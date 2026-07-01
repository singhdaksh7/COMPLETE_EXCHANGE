import { hash, verify } from '@node-rs/argon2';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { Admin } from '@prisma/client';
import {
  signAdminAccessToken,
  signAdminRefreshToken,
} from '../../lib/jwt';
import {
  authRedisCall,
  authRedisDel,
  authRedisGet,
  authRedisSet,
} from '../../lib/redis';
import { config } from '../../config';
import { encryptPII, decryptPII } from '../../lib/encryption';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../lib/errors';
import { isIpAllowed, isValidIpv4OrCidr } from '../../lib/ip-allowlist';
import { adminTotpRequired } from '../../lib/prod-safety';
import { adminRbacRepository } from './admin-rbac.repository';
import { ADMIN_PERMISSIONS } from './admin-rbac.baseline';
import type {
  AdminActivityFilters,
  AdminActivityItem,
  AdminActivityPage,
  AdminActivitySummary,
  AdminContext,
  AdminListItem,
  AdminLoginInput,
  AdminProfile,
  AdminSecurityProfile,
  AdminTokenPair,
  CreatedAdmin,
  PermissionDto,
  PublicAdmin,
  RoleDto,
  TotpEnrollment,
} from './admin-rbac.types';
import {
  toAdminListItem,
  toPermissionDto,
  toPublicAdmin,
  toRoleDto,
} from './admin-rbac.types';

const ADMIN_RBAC_KEY = (adminId: string): string => `admin:rbac:perms:${adminId}`;
const SUPER_ADMIN = 'SUPER_ADMIN';

/**
 * Account-level brute-force lockout for admin login (parity with the user login
 * lockout in auth.service). The IP-keyed `authRateLimiter` on the route blunts a
 * single source, but it does not stop a slow/distributed credential-spray
 * against one admin account; this Redis counter does. Keyed per (email, IP) and
 * reusing the same threshold/window as the user lockout. Blocked attempts are
 * NOT counted, so an active attacker cannot indefinitely extend the lockout
 * against the legitimate owner trying to get back in.
 */
const ADMIN_LOCKOUT_KEY = (email: string, ip?: string): string =>
  `admin:lockout:${email.trim().toLowerCase()}:${ip ?? 'noip'}`;

async function adminLockoutCount(email: string, ip?: string): Promise<number> {
  const raw = await authRedisGet(ADMIN_LOCKOUT_KEY(email, ip)).catch(() => null);
  return raw ? Number(raw) : 0;
}

async function recordAdminLoginFailure(email: string, ip?: string): Promise<void> {
  const key = ADMIN_LOCKOUT_KEY(email, ip);
  const count = await authRedisCall<number>('INCR', key).catch(() => 0);
  // Set the rolling window only on the first failure so the window does not keep
  // sliding forward on every subsequent attempt.
  if (count === 1) {
    await authRedisCall(
      'PEXPIRE',
      key,
      String(config.loginLockout.windowMs),
    ).catch(() => undefined);
  }
}

async function clearAdminLoginFailures(email: string, ip?: string): Promise<void> {
  await authRedisDel(ADMIN_LOCKOUT_KEY(email, ip)).catch(() => undefined);
}

/**
 * The full set of known admin permission codes (from the RBAC baseline). Used to
 * expand a SUPER_ADMIN's effective permissions for the `/auth/me` payload so a
 * permission-aware frontend never hides a module from a master admin, even if
 * the DB grants for SUPER_ADMIN predate a newer module's permission.
 */
const ALL_ADMIN_PERMISSION_CODES: readonly string[] = ADMIN_PERMISSIONS.map(
  (p) => p.code,
);

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const factor =
    unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return value * factor;
}

function normalizeBase32Str(input: string): string {
  return input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
}

function normalizeBase32(input: Buffer): string {
  return normalizeBase32Str(input.toString('utf8'));
}

/**
 * Seal a base32 TOTP secret for storage in the `totp_secret_enc` column using
 * the same authenticated AES-256-GCM envelope as KYC PII. Previously the secret
 * was written as plaintext base32 bytes, so a database read exposed every admin
 * 2FA seed; sealing it means a DB leak alone no longer defeats the second factor.
 */
function sealTotpSecret(base32: string): Buffer {
  return encryptPII(base32);
}

/**
 * Open a stored TOTP secret back to its base32 form. New rows are AES-GCM
 * sealed; legacy rows hold plaintext base32 bytes — if authenticated decryption
 * fails we fall back to treating the bytes as legacy plaintext so already-
 * enrolled admins keep working until their next (re-)enrollment re-seals it.
 */
function openTotpSecret(stored: Buffer): string {
  if (stored.length === 0) return '';
  try {
    return normalizeBase32Str(decryptPII(stored));
  } catch {
    return normalizeBase32(stored);
  }
}

function base32ToBuffer(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input) {
    const value = alphabet.indexOf(char);
    if (value === -1) return Buffer.alloc(0);
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: Buffer, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 30_000);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 (no padding) — the form authenticator apps expect. */
function base32Encode(buf: Buffer): string {
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[Number.parseInt(bits.slice(i, i + 5), 2)];
  }
  const rem = bits.length % 5;
  if (rem !== 0) {
    out += BASE32_ALPHABET[Number.parseInt(bits.slice(-rem).padEnd(5, '0'), 2)];
  }
  return out;
}

/** Fresh base32 TOTP secret (160 bits). */
function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** A strong, opaque initial password for a staging sub-admin. Never logged. */
function newInitialPassword(): string {
  // ~24 url-safe chars of entropy; mixed case + digits via base64url.
  return randomBytes(18).toString('base64url');
}

function otpauthUri(email: string, secret: string): string {
  const label = encodeURIComponent(`CEX Admin:${email}`);
  const issuer = encodeURIComponent('CEX Admin');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

function verifyTotp(secretEnc: Buffer, code: string): boolean {
  const secret = base32ToBuffer(openTotpSecret(secretEnc));
  if (secret.length === 0) return false;
  const presented = Buffer.from(code);
  for (const skew of [-30_000, 0, 30_000]) {
    const expected = Buffer.from(totp(secret, Date.now() + skew));
    if (
      presented.length === expected.length &&
      timingSafeEqual(presented, expected)
    ) {
      return true;
    }
  }
  return false;
}

async function audit(ctx: AdminContext, input: {
  action: string;
  targetType?: string;
  targetId?: string;
  beforeState?: unknown;
  afterState?: unknown;
}) {
  if (!ctx.adminId) return;
  await adminRbacRepository.writeAdminLog({
    adminId: ctx.adminId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    beforeState: input.beforeState as never,
    afterState: input.afterState as never,
    ip: ctx.ip,
    requestId: ctx.requestId,
  });
}

async function invalidateMany(adminIds: string[]): Promise<void> {
  await Promise.all(
    [...new Set(adminIds)].map((id) => authRedisDel(ADMIN_RBAC_KEY(id))),
  );
}

function ensureSuperAdminOrHasPermission(
  actor: { roles: string[]; permissions: string[] },
  permission: string,
): void {
  if (actor.roles.includes(SUPER_ADMIN)) return;
  if (!actor.permissions.includes(permission)) {
    throw new ForbiddenError(
      'You cannot grant permissions you do not currently hold',
      'FORBIDDEN',
    );
  }
}

// ===========================================================================
// Stage 7A — admin activity profile helpers.
//
// Every count and timeline entry below is derived from the append-only
// `admin_logs` table (the actor-keyed record of what each admin did). Nothing
// is synthesised: if an action was not logged with enough metadata it simply
// does not appear, and the known gaps are documented in
// docs/security/admin-access-runbook.md rather than faked.
// ===========================================================================

/** action code -> summary bucket. Multiple codes can feed one bucket. */
const ACTIVITY_BUCKETS: Record<string, ReadonlyArray<string>> = {
  depositsApproved: [
    'inr.deposit.manual_approved',
    'inr.deposit.manual_second_approved',
  ],
  depositsRejected: ['inr.deposit.manual_rejected'],
  withdrawalsApproved: ['inr.withdrawal.approved'],
  withdrawalsRejected: ['inr.withdrawal.rejected'],
  withdrawalsMarkedPaid: ['inr.withdrawal.paid'],
  kycApproved: ['kyc.approve'],
  kycRejected: ['kyc.reject'],
  kycRequestedInfo: ['kyc.request_info'],
  userFeatureChanges: ['admin.user.controls_update'],
  blockedLogins: ['admin.login_blocked_no_totp', 'admin.login_blocked_ip'],
};

/** Security-sensitive admin actions rolled into `adminSecurityActions`. */
const SECURITY_ACTION_PREFIXES: ReadonlyArray<string> = [
  'admin.create',
  'admin.suspend',
  'admin.activate',
  'admin.deactivate',
  'admin.reactivate',
  'admin.totp_reset',
  'admin.ip_allowlist_update',
  'admin.role.',
  'admin.permission.',
  'admin.user.2fa_reset',
];

function isSecurityAction(action: string): boolean {
  return SECURITY_ACTION_PREFIXES.some(
    (p) => action === p || action.startsWith(p),
  );
}

function buildActivitySummary(
  counts: Array<{ action: string; count: number }>,
  total: number,
): AdminActivitySummary {
  const byAction = new Map(counts.map((c) => [c.action, c.count]));
  const sum = (codes: ReadonlyArray<string>): number =>
    codes.reduce((acc, code) => acc + (byAction.get(code) ?? 0), 0);
  let adminSecurityActions = 0;
  for (const { action, count } of counts) {
    if (isSecurityAction(action)) adminSecurityActions += count;
  }
  return {
    depositsApproved: sum(ACTIVITY_BUCKETS.depositsApproved),
    depositsRejected: sum(ACTIVITY_BUCKETS.depositsRejected),
    withdrawalsApproved: sum(ACTIVITY_BUCKETS.withdrawalsApproved),
    withdrawalsRejected: sum(ACTIVITY_BUCKETS.withdrawalsRejected),
    withdrawalsMarkedPaid: sum(ACTIVITY_BUCKETS.withdrawalsMarkedPaid),
    kycApproved: sum(ACTIVITY_BUCKETS.kycApproved),
    kycRejected: sum(ACTIVITY_BUCKETS.kycRejected),
    kycRequestedInfo: sum(ACTIVITY_BUCKETS.kycRequestedInfo),
    userFeatureChanges: sum(ACTIVITY_BUCKETS.userFeatureChanges),
    adminSecurityActions,
    blockedLogins: sum(ACTIVITY_BUCKETS.blockedLogins),
    totalActions: total,
  };
}

/** Target types on an admin_log whose targetId is a user id (affectedUserId). */
const USER_TARGET_TYPES = new Set([
  'user',
  'user_feature_controls',
  'kyc_profile',
  'compliance_profile',
]);

/**
 * Best-effort, non-sensitive metadata summary for a timeline row. admin_logs
 * never store secrets, but we still only surface a compact status/reason view
 * rather than the raw before/after blobs.
 */
function summarizeState(
  before: unknown,
  after: unknown,
): { result: string | null; metadata: Record<string, unknown> | null } {
  const pick = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  const a = pick(after);
  const b = pick(before);
  const nested = a && pick(a.after);
  const result =
    (nested && typeof nested.status === 'string' && nested.status) ||
    (a && typeof a.status === 'string' && a.status) ||
    (a && typeof a.result === 'string' && a.result) ||
    null;
  const metadata = a ?? b ?? null;
  return { result: result || null, metadata };
}

export const adminRbacService = {
  async login(input: AdminLoginInput): Promise<AdminTokenPair> {
    // Account-level brute-force lockout (checked BEFORE any credential work so a
    // locked account spends no CPU and the block is not extended by the attack).
    if (
      (await adminLockoutCount(input.email, input.ip)) >=
      config.loginLockout.maxAttempts
    ) {
      throw new TooManyRequestsError(
        'Too many failed admin login attempts. Please try again later.',
        'ADMIN_ACCOUNT_LOCKED',
      );
    }

    const admin = await adminRbacRepository.findAdminByEmail(input.email);
    const ok = admin
      ? await verify(admin.passwordHash, input.password).catch(() => false)
      : false;
    if (!admin || !ok) {
      await recordAdminLoginFailure(input.email, input.ip);
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }
    if (admin.status !== 'ACTIVE') {
      throw new ForbiddenError('Admin account is not active', 'ADMIN_NOT_ACTIVE');
    }
    if (admin.totpEnabled) {
      if (!verifyTotp(Buffer.from(admin.totpSecretEnc), input.totp)) {
        await recordAdminLoginFailure(input.email, input.ip);
        throw new UnauthorizedError('Invalid TOTP code', 'INVALID_TOTP');
      }
    } else if (
      adminTotpRequired({
        isProd: config.isProd,
        totpEnabled: admin.totpEnabled,
        allowOverride: config.security.allowAdminLoginWithoutTotp,
      })
    ) {
      // Production requires a real second factor. A TOTP-less admin must enroll
      // (out-of-band bootstrap, or via the ALLOW_ADMIN_LOGIN_WITHOUT_TOTP
      // staging override) before logging in. The blocked attempt is audited.
      await adminRbacRepository.writeAdminLog({
        adminId: admin.id,
        action: 'admin.login_blocked_no_totp',
        targetType: 'admin',
        targetId: admin.id,
        ip: input.ip,
        requestId: input.requestId,
      });
      throw new ForbiddenError(
        'TOTP enrollment is required before admin login',
        'ADMIN_TOTP_REQUIRED',
      );
    }
    // Per-admin IP allowlist: when configured, only listed IPs may authenticate.
    if (!isIpAllowed(input.ip, admin.ipAllowlist)) {
      await adminRbacRepository.writeAdminLog({
        adminId: admin.id,
        action: 'admin.login_blocked_ip',
        targetType: 'admin',
        targetId: admin.id,
        ip: input.ip,
        requestId: input.requestId,
      });
      throw new ForbiddenError(
        'Admin login is not permitted from this IP address',
        'IP_NOT_ALLOWED',
      );
    }
    // Successful authentication clears the brute-force counter for this pair.
    await clearAdminLoginFailures(input.email, input.ip);
    const tokens = await this.issueSession(admin, input);
    // Stamp last-login for the admin profile view (Stage 7A). Best-effort: a
    // failure here must never fail an otherwise valid login.
    await adminRbacRepository
      .updateAdminLastLogin(admin.id)
      .catch(() => undefined);
    await adminRbacRepository.writeAdminLog({
      adminId: admin.id,
      action: 'admin.login',
      targetType: 'admin',
      targetId: admin.id,
      ip: input.ip,
      requestId: input.requestId,
    });
    return tokens;
  },

  async bootstrapSuperAdmin(email: string, password: string): Promise<PublicAdmin> {
    const admin = await adminRbacRepository.findAdminByEmail(email);
    if (!admin) throw new NotFoundError('Bootstrap admin not found');
    const passwordHash = await hash(password);
    const updated = await adminRbacRepository.updateAdminPassword(admin.id, passwordHash);
    return toPublicAdmin(updated);
  },

  async issueSession(
    admin: Admin,
    meta: { ip?: string },
  ): Promise<AdminTokenPair> {
    const sessionId = randomUUID();
    const refreshTtlMs = ttlToMs(config.jwt.refreshTtl);
    const accessToken = signAdminAccessToken({ sub: admin.id, sid: sessionId });
    const refreshToken = signAdminRefreshToken({ sub: admin.id, sid: sessionId });
    await adminRbacRepository.createAdminSession({
      id: sessionId,
      adminId: admin.id,
      refreshHash: hashToken(refreshToken),
      ip: meta.ip,
      expiresAt: new Date(Date.now() + refreshTtlMs),
    });
    return { accessToken, refreshToken };
  },

  async validateAdminSession(adminId: string, sessionId: string): Promise<Admin> {
    const session = await adminRbacRepository.findAdminSessionWithAdmin(sessionId);
    if (
      !session ||
      session.adminId !== adminId ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.admin.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedError('Admin session is no longer valid', 'SESSION_INVALID');
    }
    return session.admin;
  },

  async getAdminPermissions(
    adminId: string,
  ): Promise<{ roles: string[]; permissions: string[] }> {
    const cached = await authRedisGet(ADMIN_RBAC_KEY(adminId)).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached) as { roles: string[]; permissions: string[] };
      } catch {
        // fall through and rebuild cache
      }
    }
    const result = await adminRbacRepository.getAdminRolesAndPermissions(adminId);
    await authRedisSet(
      ADMIN_RBAC_KEY(adminId),
      JSON.stringify(result),
      'EX',
      config.auth.rbacCacheTtlSec,
    ).catch(() => undefined);
    return result;
  },

  async invalidateAdminPermissions(adminId: string): Promise<void> {
    await authRedisDel(ADMIN_RBAC_KEY(adminId));
  },

  async profile(adminId: string, ctx: AdminContext = {}): Promise<AdminProfile> {
    const admin = await adminRbacRepository.findAdminById(adminId);
    if (!admin) throw new UnauthorizedError('Admin not found');
    const { roles, permissions } = await this.getAdminPermissions(adminId);
    const isSuperAdmin = roles.includes(SUPER_ADMIN);
    // A SUPER_ADMIN bypasses every backend permission check, so expose the full
    // permission set here (union of granted + all known codes) — the frontend
    // uses this to render every admin module without special-casing the role.
    const effectivePermissions = isSuperAdmin
      ? [...new Set([...permissions, ...ALL_ADMIN_PERMISSION_CODES])]
      : permissions;
    await audit({ ...ctx, adminId }, {
      action: 'admin.profile.view',
      targetType: 'admin',
      targetId: adminId,
    });
    return {
      admin: toPublicAdmin(admin),
      roles,
      permissions: effectivePermissions,
      isSuperAdmin,
    };
  },

  listRoles(): Promise<RoleDto[]> {
    return adminRbacRepository.listRoles().then((roles) => roles.map(toRoleDto));
  },

  async createRole(
    input: { name: string; description?: string },
    ctx: AdminContext,
  ): Promise<RoleDto> {
    const existing = await adminRbacRepository.findRoleByName(input.name);
    if (existing) throw new ConflictError('Role already exists', 'ROLE_EXISTS');
    const role = await adminRbacRepository.createRole(input);
    await audit(ctx, {
      action: 'admin.role.create',
      targetType: 'role',
      targetId: role.id,
      afterState: toRoleDto(role),
    });
    return toRoleDto(role);
  },

  async updateRole(
    roleId: string,
    input: { description?: string | null },
    ctx: AdminContext,
  ): Promise<RoleDto> {
    const before = await adminRbacRepository.findRoleById(roleId);
    if (!before || before.scope !== 'ADMIN') throw new NotFoundError('Role not found');
    if (before.isSystem) {
      throw new ForbiddenError('System roles cannot be edited', 'SYSTEM_ROLE');
    }
    const role = await adminRbacRepository.updateRole(roleId, input);
    await audit(ctx, {
      action: 'admin.role.update',
      targetType: 'role',
      targetId: role.id,
      beforeState: toRoleDto(before),
      afterState: toRoleDto(role),
    });
    return toRoleDto(role);
  },

  async deleteRole(roleId: string, ctx: AdminContext): Promise<void> {
    const role = await adminRbacRepository.findRoleById(roleId);
    if (!role || role.scope !== 'ADMIN') throw new NotFoundError('Role not found');
    if (role.isSystem || role.name === SUPER_ADMIN) {
      throw new ForbiddenError('System roles cannot be deleted', 'SYSTEM_ROLE');
    }
    const affectedAdmins = await adminRbacRepository.adminIdsForRole(roleId);
    await adminRbacRepository.deleteRole(roleId);
    await invalidateMany(affectedAdmins);
    await audit(ctx, {
      action: 'admin.role.delete',
      targetType: 'role',
      targetId: roleId,
      beforeState: toRoleDto(role),
    });
  },

  listPermissions(): Promise<PermissionDto[]> {
    return adminRbacRepository
      .listPermissions()
      .then((permissions) => permissions.map(toPermissionDto));
  },

  async createPermission(
    input: { code: string; description?: string },
    ctx: AdminContext,
  ): Promise<PermissionDto> {
    const actor = ctx.adminId
      ? await this.getAdminPermissions(ctx.adminId)
      : { roles: [], permissions: [] };
    if (!actor.roles.includes(SUPER_ADMIN)) {
      throw new ForbiddenError('Only SUPER_ADMIN can create permissions', 'FORBIDDEN');
    }
    const existing = await adminRbacRepository.findPermissionByCode(input.code);
    if (existing) {
      throw new ConflictError('Permission already exists', 'PERMISSION_EXISTS');
    }
    const permission = await adminRbacRepository.createPermission(input);
    await audit(ctx, {
      action: 'admin.permission.create',
      targetType: 'permission',
      targetId: permission.id,
      afterState: toPermissionDto(permission),
    });
    return toPermissionDto(permission);
  },

  async updatePermission(
    permissionId: string,
    input: { description?: string | null },
    ctx: AdminContext,
  ): Promise<PermissionDto> {
    const permission = await adminRbacRepository.updatePermission(permissionId, input);
    const affectedAdmins = await adminRbacRepository.adminIdsForPermission(permissionId);
    await invalidateMany(affectedAdmins);
    await audit(ctx, {
      action: 'admin.permission.update',
      targetType: 'permission',
      targetId: permission.id,
      afterState: toPermissionDto(permission),
    });
    return toPermissionDto(permission);
  },

  async deletePermission(permissionId: string, ctx: AdminContext): Promise<void> {
    const permission = await adminRbacRepository.findPermissionById(permissionId);
    if (!permission) throw new NotFoundError('Permission not found');
    const affectedAdmins = await adminRbacRepository.adminIdsForPermission(permissionId);
    await adminRbacRepository.deletePermission(permissionId);
    await invalidateMany(affectedAdmins);
    await audit(ctx, {
      action: 'admin.permission.delete',
      targetType: 'permission',
      targetId: permissionId,
      beforeState: toPermissionDto(permission),
    });
  },

  async assignRoleToAdmin(
    adminId: string,
    roleId: string,
    ctx: AdminContext,
  ): Promise<void> {
    const role = await adminRbacRepository.findRoleById(roleId);
    const admin = await adminRbacRepository.findAdminById(adminId);
    if (!role || role.scope !== 'ADMIN') throw new NotFoundError('Role not found');
    if (!admin) throw new NotFoundError('Admin not found');
    const actor = ctx.adminId
      ? await this.getAdminPermissions(ctx.adminId)
      : { roles: [], permissions: [] };
    if (role.name === SUPER_ADMIN && !actor.roles.includes(SUPER_ADMIN)) {
      throw new ForbiddenError('Only SUPER_ADMIN can grant SUPER_ADMIN', 'FORBIDDEN');
    }
    await adminRbacRepository.assignRoleToAdmin(adminId, roleId);
    await this.invalidateAdminPermissions(adminId);
    await audit(ctx, {
      action: 'admin.role.assign',
      targetType: 'admin',
      targetId: adminId,
      afterState: { roleId, role: role.name },
    });
  },

  async removeRoleFromAdmin(
    adminId: string,
    roleId: string,
    ctx: AdminContext,
  ): Promise<void> {
    const role = await adminRbacRepository.findRoleById(roleId);
    if (!role || role.scope !== 'ADMIN') throw new NotFoundError('Role not found');
    if (role.name === SUPER_ADMIN) {
      const [superAdmins, activeSuperAdminCount] = await Promise.all([
        adminRbacRepository.adminsWithRole(SUPER_ADMIN),
        adminRbacRepository.countActiveAdminsWithRole(SUPER_ADMIN),
      ]);
      const targetIsActiveSuperAdmin = superAdmins.some(
        (a) => a.adminId === adminId,
      );
      if (targetIsActiveSuperAdmin && activeSuperAdminCount <= 1) {
        throw new ForbiddenError('Cannot remove the last SUPER_ADMIN', 'LAST_SUPER_ADMIN');
      }
    }
    await adminRbacRepository.removeRoleFromAdmin(adminId, roleId);
    await this.invalidateAdminPermissions(adminId);
    await audit(ctx, {
      action: 'admin.role.remove',
      targetType: 'admin',
      targetId: adminId,
      beforeState: { roleId, role: role.name },
    });
  },

  async grantPermissionToRole(
    roleId: string,
    permissionId: string,
    ctx: AdminContext,
  ): Promise<void> {
    const role = await adminRbacRepository.findRoleById(roleId);
    const permission = await adminRbacRepository.findPermissionById(permissionId);
    if (!role || role.scope !== 'ADMIN') throw new NotFoundError('Role not found');
    if (!permission) throw new NotFoundError('Permission not found');
    const actor = ctx.adminId
      ? await this.getAdminPermissions(ctx.adminId)
      : { roles: [], permissions: [] };
    ensureSuperAdminOrHasPermission(actor, permission.code);
    const affectedAdmins = await adminRbacRepository.adminIdsForRole(roleId);
    await adminRbacRepository.grantPermissionToRole(roleId, permissionId);
    await invalidateMany(affectedAdmins);
    await audit(ctx, {
      action: 'admin.permission.grant',
      targetType: 'role',
      targetId: roleId,
      afterState: { permissionId, permission: permission.code },
    });
  },

  async revokePermissionFromRole(
    roleId: string,
    permissionId: string,
    ctx: AdminContext,
  ): Promise<void> {
    const role = await adminRbacRepository.findRoleById(roleId);
    const permission = await adminRbacRepository.findPermissionById(permissionId);
    if (!role || role.scope !== 'ADMIN') throw new NotFoundError('Role not found');
    if (!permission) throw new NotFoundError('Permission not found');
    if (role.name === SUPER_ADMIN) {
      throw new ForbiddenError(
        'SUPER_ADMIN permissions cannot be revoked',
        'SUPER_ADMIN_PROTECTED',
      );
    }
    const affectedAdmins = await adminRbacRepository.adminIdsForRole(roleId);
    await adminRbacRepository.revokePermissionFromRole(roleId, permissionId);
    await invalidateMany(affectedAdmins);
    await audit(ctx, {
      action: 'admin.permission.revoke',
      targetType: 'role',
      targetId: roleId,
      beforeState: { permissionId, permission: permission.code },
    });
  },

  // ==========================================================================
  // Admin management (Stage 3.4B) — list, create sub-admin, status, TOTP, IPs.
  // Every mutation is recorded in admin_logs via audit().
  // ==========================================================================

  listAdmins(): Promise<AdminListItem[]> {
    return adminRbacRepository
      .listAdminsWithRoles()
      .then((admins) => admins.map(toAdminListItem));
  },

  /**
   * Create a sub-admin with exactly one (non-SUPER_ADMIN) role and a strong,
   * random initial password returned ONCE in the response (never logged). The
   * account starts with TOTP disabled so the sub-admin can log in and enroll.
   */
  async createAdmin(
    input: { email: string; roleId: string; status?: string },
    ctx: AdminContext,
  ): Promise<CreatedAdmin> {
    const role = await adminRbacRepository.findRoleById(input.roleId);
    if (!role || role.scope !== 'ADMIN') throw new NotFoundError('Role not found');
    if (role.name === SUPER_ADMIN) {
      throw new ForbiddenError(
        'Sub-admins cannot be created as SUPER_ADMIN; grant that role explicitly afterwards',
        'SUPER_ADMIN_NOT_ALLOWED',
      );
    }
    const existing = await adminRbacRepository.findAdminByEmail(input.email);
    if (existing) {
      throw new ConflictError('An admin with this email already exists', 'ADMIN_EXISTS');
    }

    const initialPassword = newInitialPassword();
    const passwordHash = await hash(initialPassword);
    const status = input.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
    const admin = await adminRbacRepository.createAdmin({
      email: input.email,
      passwordHash,
      status,
    });
    await adminRbacRepository.assignRoleToAdmin(admin.id, role.id);

    await audit(ctx, {
      action: 'admin.create',
      targetType: 'admin',
      targetId: admin.id,
      afterState: { email: admin.email, role: role.name, status },
    });

    return { admin: toPublicAdmin(admin), role: role.name, initialPassword };
  },

  /** Suspend or re-activate an admin. Suspending kills live sessions + cache. */
  async updateAdminStatus(
    adminId: string,
    status: string,
    ctx: AdminContext,
  ): Promise<PublicAdmin> {
    const normalized = status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
    const target = await adminRbacRepository.findAdminById(adminId);
    if (!target) throw new NotFoundError('Admin not found');
    if (ctx.adminId === adminId) {
      throw new BadRequestError('You cannot change your own status');
    }
    if (normalized === 'SUSPENDED') {
      const supers = await adminRbacRepository.adminsWithRole(SUPER_ADMIN);
      const isSuper = supers.some((a) => a.adminId === adminId);
      if (isSuper) {
        const activeSupers =
          await adminRbacRepository.countActiveAdminsWithRole(SUPER_ADMIN);
        if (activeSupers <= 1) {
          throw new ForbiddenError(
            'Cannot suspend the last active SUPER_ADMIN',
            'LAST_SUPER_ADMIN',
          );
        }
      }
    }

    const before = target.status;
    const updated = await adminRbacRepository.updateAdminStatus(adminId, normalized);
    if (normalized === 'SUSPENDED') {
      // Immediately invalidate existing sessions + cached permissions.
      await adminRbacRepository.revokeAllAdminSessions(adminId);
      await this.invalidateAdminPermissions(adminId);
    }

    await audit(ctx, {
      action: normalized === 'SUSPENDED' ? 'admin.suspend' : 'admin.activate',
      targetType: 'admin',
      targetId: adminId,
      beforeState: { status: before },
      afterState: { status: normalized },
    });
    return toPublicAdmin(updated);
  },

  /** SUPER_ADMIN resets an admin's TOTP: clears the secret, disables TOTP, and
   *  revokes sessions so the admin must log in and re-enroll. */
  async resetAdminTotp(adminId: string, ctx: AdminContext): Promise<PublicAdmin> {
    const target = await adminRbacRepository.findAdminById(adminId);
    if (!target) throw new NotFoundError('Admin not found');
    const updated = await adminRbacRepository.setAdminTotp(adminId, {
      secretEnc: Buffer.alloc(0),
      enabled: false,
    });
    await adminRbacRepository.revokeAllAdminSessions(adminId);
    await audit(ctx, {
      action: 'admin.totp_reset',
      targetType: 'admin',
      targetId: adminId,
    });
    return toPublicAdmin(updated);
  },

  /** Replace an admin's IP allowlist (validated IPv4 / CIDR; empty = no limit). */
  async setIpAllowlist(
    adminId: string,
    ips: string[],
    ctx: AdminContext,
  ): Promise<{ id: string; ipAllowlist: string[]; ipRestricted: boolean }> {
    const target = await adminRbacRepository.findAdminById(adminId);
    if (!target) throw new NotFoundError('Admin not found');
    const cleaned = [...new Set(ips.map((s) => s.trim()).filter(Boolean))];
    for (const entry of cleaned) {
      if (!isValidIpv4OrCidr(entry)) {
        throw new BadRequestError(`Invalid IPv4 address or CIDR: ${entry}`);
      }
    }
    // Anti-lockout: setting YOUR OWN allowlist must keep your current IP allowed.
    if (ctx.adminId === adminId && cleaned.length > 0 && !isIpAllowed(ctx.ip, cleaned)) {
      throw new BadRequestError(
        'Your own allowlist must include your current IP address',
      );
    }
    const updated = await adminRbacRepository.setAdminIpAllowlist(adminId, cleaned);
    await audit(ctx, {
      action: 'admin.ip_allowlist_update',
      targetType: 'admin',
      targetId: adminId,
      beforeState: { ipAllowlist: target.ipAllowlist },
      afterState: { ipAllowlist: cleaned },
    });
    return {
      id: updated.id,
      ipAllowlist: updated.ipAllowlist,
      ipRestricted: updated.ipAllowlist.length > 0,
    };
  },

  /** Self-service: begin TOTP (re-)enrollment. Stores a fresh secret but leaves
   *  TOTP disabled until confirmed with a valid code. */
  async enrollTotp(adminId: string, ctx: AdminContext): Promise<TotpEnrollment> {
    const admin = await adminRbacRepository.findAdminById(adminId);
    if (!admin) throw new UnauthorizedError('Admin not found');
    const secret = newTotpSecret();
    await adminRbacRepository.setAdminTotp(adminId, {
      secretEnc: sealTotpSecret(secret),
      enabled: false,
    });
    await audit({ ...ctx, adminId }, {
      action: 'admin.totp_enroll_start',
      targetType: 'admin',
      targetId: adminId,
    });
    return { secret, otpauthUri: otpauthUri(admin.email, secret) };
  },

  /** Self-service: confirm enrollment by proving a current code, enabling TOTP. */
  async confirmTotp(
    adminId: string,
    code: string,
    ctx: AdminContext,
  ): Promise<PublicAdmin> {
    const admin = await adminRbacRepository.findAdminById(adminId);
    if (!admin) throw new UnauthorizedError('Admin not found');
    if (!verifyTotp(Buffer.from(admin.totpSecretEnc), code)) {
      throw new UnauthorizedError('Invalid TOTP code', 'INVALID_TOTP');
    }
    const updated = await adminRbacRepository.setAdminTotp(adminId, {
      secretEnc: Buffer.from(admin.totpSecretEnc),
      enabled: true,
    });
    await audit({ ...ctx, adminId }, {
      action: 'admin.totp_enabled',
      targetType: 'admin',
      targetId: adminId,
    });
    return toPublicAdmin(updated);
  },

  // ==========================================================================
  // Admin lifecycle (Stage 7A) — SUPER_ADMIN-only soft deactivation / access
  // removal + reactivation. Admin rows are never hard-deleted; historical
  // admin_logs remain traceable forever for FIU accountability.
  // ==========================================================================

  /**
   * Soft-deactivate an admin: remove access without deleting anything. Only a
   * SUPER_ADMIN may call. Self-deactivation and removing the last active
   * SUPER_ADMIN are refused. Live sessions + cached permissions are killed so
   * the deactivated admin cannot continue an in-flight session.
   */
  async deactivateAdmin(
    adminId: string,
    input: { reason: string; note?: string },
    ctx: AdminContext,
  ): Promise<PublicAdmin> {
    const target = await adminRbacRepository.findAdminById(adminId);
    if (!target) throw new NotFoundError('Admin not found');

    // Highest-privilege action: SUPER_ADMIN only. This also means a normal admin
    // or compliance officer can never deactivate a SUPER_ADMIN (or anyone).
    const actor = ctx.adminId
      ? await this.getAdminPermissions(ctx.adminId)
      : { roles: [] as string[], permissions: [] as string[] };
    if (!actor.roles.includes(SUPER_ADMIN)) {
      throw new ForbiddenError('Only SUPER_ADMIN can deactivate an admin', 'FORBIDDEN');
    }
    if (ctx.adminId === adminId) {
      throw new BadRequestError('You cannot deactivate your own admin account');
    }
    if (target.status === 'DEACTIVATED') {
      throw new ConflictError('Admin is already deactivated', 'ALREADY_DEACTIVATED');
    }

    // Never remove the last active SUPER_ADMIN — protects the break-glass role.
    const supers = await adminRbacRepository.adminsWithRole(SUPER_ADMIN);
    if (supers.some((a) => a.adminId === adminId)) {
      const activeSupers =
        await adminRbacRepository.countActiveAdminsWithRole(SUPER_ADMIN);
      if (activeSupers <= 1) {
        throw new ForbiddenError(
          'Cannot deactivate the last active SUPER_ADMIN',
          'LAST_SUPER_ADMIN',
        );
      }
    }

    const before = target.status;
    const updated = await adminRbacRepository.deactivateAdmin(adminId, {
      deactivatedBy: ctx.adminId,
      reason: input.reason,
    });
    // Immediately invalidate existing sessions + cached permissions.
    await adminRbacRepository.revokeAllAdminSessions(adminId);
    await this.invalidateAdminPermissions(adminId);

    // ADMIN_DEACTIVATED — actor, target, reason, ip, requestId, user agent.
    await adminRbacRepository.writeAdminLog({
      adminId: ctx.adminId ?? adminId,
      action: 'admin.deactivate',
      targetType: 'admin',
      targetId: adminId,
      reason: input.reason,
      beforeState: { status: before },
      afterState: {
        status: 'DEACTIVATED',
        note: input.note ?? null,
        userAgent: ctx.userAgent ?? null,
      },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    return toPublicAdmin(updated);
  },

  /**
   * Reactivate a previously deactivated admin. SUPER_ADMIN only. Re-enables
   * login/access but does NOT restore old sessions — the admin logs in fresh.
   */
  async reactivateAdmin(
    adminId: string,
    input: { reason: string },
    ctx: AdminContext,
  ): Promise<PublicAdmin> {
    const target = await adminRbacRepository.findAdminById(adminId);
    if (!target) throw new NotFoundError('Admin not found');
    const actor = ctx.adminId
      ? await this.getAdminPermissions(ctx.adminId)
      : { roles: [] as string[], permissions: [] as string[] };
    if (!actor.roles.includes(SUPER_ADMIN)) {
      throw new ForbiddenError('Only SUPER_ADMIN can reactivate an admin', 'FORBIDDEN');
    }
    if (target.status === 'ACTIVE') {
      throw new ConflictError('Admin is already active', 'ALREADY_ACTIVE');
    }

    const before = target.status;
    const updated = await adminRbacRepository.reactivateAdmin(adminId);
    await this.invalidateAdminPermissions(adminId);

    // ADMIN_REACTIVATED — old sessions are intentionally NOT restored.
    await adminRbacRepository.writeAdminLog({
      adminId: ctx.adminId ?? adminId,
      action: 'admin.reactivate',
      targetType: 'admin',
      targetId: adminId,
      reason: input.reason,
      beforeState: { status: before },
      afterState: { status: 'ACTIVE', userAgent: ctx.userAgent ?? null },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    return toPublicAdmin(updated);
  },

  /**
   * Full admin security + accountability profile (Stage 7A). Never exposes the
   * TOTP seed, recovery codes, password hash or any other secret material —
   * only safe identity, role, status and derived activity counts.
   */
  async adminSecurityProfile(
    adminId: string,
    ctx: AdminContext,
  ): Promise<AdminSecurityProfile> {
    const admin = await adminRbacRepository.findAdminById(adminId);
    if (!admin) throw new NotFoundError('Admin not found');
    const { roles, permissions } = await this.getAdminPermissions(adminId);
    const isSuperAdmin = roles.includes(SUPER_ADMIN);
    const effectivePermissions = isSuperAdmin
      ? [...new Set([...permissions, ...ALL_ADMIN_PERMISSION_CODES])]
      : permissions;
    const [counts, total, emails] = await Promise.all([
      adminRbacRepository.adminActionCounts(adminId),
      adminRbacRepository.adminActionTotal(adminId),
      adminRbacRepository.findAdminEmailsByIds(
        [admin.createdBy, admin.deactivatedBy].filter(
          (x): x is string => Boolean(x),
        ),
      ),
    ]);
    await audit(ctx, {
      action: 'admin.profile.view',
      targetType: 'admin',
      targetId: adminId,
    });
    return {
      id: admin.id,
      email: admin.email,
      status: admin.status,
      roles,
      permissions: effectivePermissions,
      isSuperAdmin,
      totpEnabled: admin.totpEnabled,
      ipAllowlist: admin.ipAllowlist,
      ipRestricted: admin.ipAllowlist.length > 0,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      lastLoginAt: admin.lastLoginAt,
      createdBy: admin.createdBy,
      createdByEmail: admin.createdBy ? emails.get(admin.createdBy) ?? null : null,
      deactivatedAt: admin.deactivatedAt,
      deactivatedBy: admin.deactivatedBy,
      deactivatedByEmail: admin.deactivatedBy
        ? emails.get(admin.deactivatedBy) ?? null
        : null,
      deactivationReason: admin.deactivationReason,
      activitySummary: buildActivitySummary(counts, total),
    };
  },

  /**
   * Filtered, paginated admin activity timeline (Stage 7A). Every entry is a
   * real append-only admin_log row for this actor — no synthesis. Only safe
   * fields are surfaced; secrets are never stored in admin_logs to begin with.
   */
  async adminActivity(
    adminId: string,
    filters: AdminActivityFilters,
    ctx: AdminContext,
  ): Promise<AdminActivityPage> {
    const admin = await adminRbacRepository.findAdminById(adminId);
    if (!admin) throw new NotFoundError('Admin not found');
    const { rows, total } = await adminRbacRepository.adminActivity(adminId, filters);
    const items: AdminActivityItem[] = rows.map((r) => {
      const { result, metadata } = summarizeState(r.beforeState, r.afterState);
      const affectedUserId =
        r.targetType && USER_TARGET_TYPES.has(r.targetType) ? r.targetId : null;
      return {
        id: r.id.toString(),
        occurredAt: r.occurredAt,
        action: r.action,
        entityType: r.targetType,
        entityId: r.targetId,
        affectedUserId,
        result,
        reason: r.reason,
        requestId: r.requestId,
        ip: r.ip,
        metadata,
      };
    });
    await audit(ctx, {
      action: 'admin.activity.view',
      targetType: 'admin',
      targetId: adminId,
    });
    return {
      items,
      page: filters.page,
      limit: filters.limit,
      total,
      hasMore: filters.page * filters.limit < total,
    };
  },
};

export type AdminRbacService = typeof adminRbacService;
