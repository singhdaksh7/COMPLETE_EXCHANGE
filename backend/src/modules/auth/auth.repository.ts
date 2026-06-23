import type { Prisma, User, AuthSession, LoginAttempt } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * Repository layer: the ONLY place that talks to Prisma for auth data.
 *
 * It exposes intention-revealing methods and hides query details from the
 * service. Swapping the data source or query shape never leaks upward.
 */
export const authRepository = {
  findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  createUser(data: {
    email: string;
    phone?: string;
    passwordHash: string;
  }): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email,
        phone: data.phone,
        passwordHash: data.passwordHash,
      },
    });
  },

  /** Find a linked OAuth identity (with its owning user), or null. */
  findOAuthAccountWithUser(provider: string, providerAccountId: string) {
    return prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true },
    });
  },

  /** Link an OAuth identity to an existing user. */
  linkOAuthAccount(data: {
    userId: string;
    provider: string;
    providerAccountId: string;
    email?: string;
  }) {
    return prisma.oAuthAccount.create({ data });
  },

  /**
   * Create a brand-new OAuth-only user plus its linked identity, atomically.
   * The email is treated as verified (the provider asserted ownership) and the
   * caller supplies an unusable random password hash so password login fails.
   */
  createUserWithOAuth(data: {
    email: string;
    passwordHash: string;
    provider: string;
    providerAccountId: string;
  }): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        emailVerifiedAt: new Date(),
        oauthAccounts: {
          create: {
            provider: data.provider,
            providerAccountId: data.providerAccountId,
            email: data.email,
          },
        },
      },
    });
  },

  createSession(data: {
    id: string;
    userId: string;
    refreshHash: string;
    familyId: string;
    ip?: string;
    deviceInfo?: Prisma.InputJsonValue;
    expiresAt: Date;
  }): Promise<AuthSession> {
    return prisma.authSession.create({
      data: {
        id: data.id,
        userId: data.userId,
        refreshHash: data.refreshHash,
        familyId: data.familyId,
        ip: data.ip,
        deviceInfo: data.deviceInfo,
        expiresAt: data.expiresAt,
        // A fresh session has been "seen" right now.
        lastSeenAt: new Date(),
      },
    });
  },

  /** Total sessions ever created for a user (device-recognition signal). */
  countSessionsForUser(userId: string): Promise<number> {
    return prisma.authSession.count({ where: { userId } });
  },

  /**
   * Count prior sessions for this user that match the same device signal (same
   * IP or same user-agent). Used to flag a login from a new device. When no
   * signal is available we return 1 so we never raise a false "new device".
   */
  countSessionsForUserDevice(
    userId: string,
    ip?: string,
    userAgent?: string,
  ): Promise<number> {
    const or: Prisma.AuthSessionWhereInput[] = [];
    if (ip) or.push({ ip });
    if (userAgent) or.push({ deviceInfo: { equals: { userAgent } } });
    if (or.length === 0) return Promise.resolve(1);
    return prisma.authSession.count({ where: { userId, OR: or } });
  },

  /**
   * Best-effort "last active" stamp, throttled to at most once per minute per
   * session so the authenticated hot path does not write on every request.
   */
  async touchSession(id: string): Promise<number> {
    const cutoff = new Date(Date.now() - 60_000);
    const result = await prisma.authSession.updateMany({
      where: {
        id,
        revokedAt: null,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
      },
      data: { lastSeenAt: new Date() },
    });
    return result.count;
  },

  findSessionById(id: string): Promise<AuthSession | null> {
    return prisma.authSession.findUnique({ where: { id } });
  },

  findSessionWithUserById(id: string) {
    return prisma.authSession.findUnique({
      where: { id },
      include: { user: true },
    });
  },

  /** Mark an email verified — only transitions the unverified state once. */
  async setEmailVerified(userId: string): Promise<number> {
    const result = await prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null, deletedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    return result.count;
  },

  /** Rotate a user's password hash (reset / change). */
  updatePassword(userId: string, passwordHash: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  },

  /** Active (non-revoked, non-expired) sessions for the account dashboard. */
  findActiveSessionsByUser(userId: string): Promise<AuthSession[]> {
    return prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * The user's own security/account events from the append-only audit log
   * (login, password change, KYC submission, deposit submitted, withdrawal
   * requested, session revoke, …). Scoped by actorId so only the caller's
   * actions are returned.
   */
  listUserAuditLogs(userId: string, limit: number) {
    return prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { id: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        entityType: true,
        ip: true,
        metadata: true,
        occurredAt: true,
      },
    });
  },

  /** Revoke a single session, scoped to its owner (prevents cross-user revoke). */
  async revokeSessionForUser(
    userId: string,
    sessionId: string,
  ): Promise<number> {
    const result = await prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  },

  /**
   * Revoke every active session for a user, optionally keeping one (the caller's
   * current session). Used on password change/reset — "log out everywhere".
   */
  async revokeAllSessionsForUser(
    userId: string,
    exceptSessionId?: string,
  ): Promise<{ revokedSessionIds: string[] }> {
    const sessions = await prisma.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      select: { id: true },
    });
    if (sessions.length === 0) return { revokedSessionIds: [] };
    const ids = sessions.map((s) => s.id);
    await prisma.authSession.updateMany({
      where: { id: { in: ids } },
      data: { revokedAt: new Date() },
    });
    return { revokedSessionIds: ids };
  },

  /**
   * Resolve a user's effective RBAC: role names + the union of their roles'
   * permission codes. One query with nested includes (foundation join shape).
   */
  async getUserRolesAndPermissions(
    userId: string,
  ): Promise<{ roles: string[]; permissions: string[] }> {
    const rows = await prisma.userRole.findMany({
      where: { userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    const roles = rows.map((r) => r.role.name);
    const permissions = new Set<string>();
    for (const r of rows) {
      for (const rp of r.role.permissions) permissions.add(rp.permission.code);
    }
    return { roles, permissions: [...permissions] };
  },

  /**
   * Atomic, compare-and-swap rotation. Updates the session's refresh hash ONLY
   * if the currently stored hash still equals `expectedHash` and the session is
   * not revoked. Returns the number of rows updated (1 = we won the race, 0 =
   * the token was already rotated/revoked by a concurrent request → reuse).
   *
   * This closes the TOCTOU window that a read-then-write rotation leaves open:
   * two concurrent refreshes carrying the same token can both pass a separate
   * hash check, but only one `updateMany` can match-and-swap the old hash.
   */
  async rotateSessionAtomic(
    id: string,
    expectedHash: string,
    newHash: string,
    expiresAt: Date,
  ): Promise<number> {
    const result = await prisma.authSession.updateMany({
      where: { id, refreshHash: expectedHash, revokedAt: null },
      data: { refreshHash: newHash, expiresAt },
    });
    return result.count;
  },

  revokeSession(id: string): Promise<Prisma.BatchPayload> {
    return prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /** Revoke an entire token family (used on refresh-token reuse detection). */
  revokeFamily(familyId: string): Promise<Prisma.BatchPayload> {
    return prisma.authSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  recordLoginAttempt(data: {
    userId?: string;
    email?: string;
    ip?: string;
    success: boolean;
  }): Promise<LoginAttempt> {
    return prisma.loginAttempt.create({ data });
  },

  countRecentFailedAttemptsByEmailIp(
    email: string,
    ip: string | undefined,
    since: Date,
  ): Promise<number> {
    return prisma.loginAttempt.count({
      where: {
        email,
        ip: ip ?? undefined,
        success: false,
        createdAt: { gte: since },
      },
    });
  },

  countRecentFailedAttemptsByEmail(email: string, since: Date): Promise<number> {
    return prisma.loginAttempt.count({
      where: {
        email,
        success: false,
        createdAt: { gte: since },
      },
    });
  },

  countRecentFailedAttemptsByIp(
    ip: string | undefined,
    since: Date,
  ): Promise<number> {
    return prisma.loginAttempt.count({
      where: {
        ip: ip ?? undefined,
        success: false,
        createdAt: { gte: since },
      },
    });
  },

  countRecentFailedAttempts(
    email: string,
    ip: string | undefined,
    since: Date,
  ): Promise<number> {
    return this.countRecentFailedAttemptsByEmailIp(email, ip, since);
  },
};

export type AuthRepository = typeof authRepository;
