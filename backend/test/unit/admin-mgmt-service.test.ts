import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { hash } from '@node-rs/argon2';
import type { Admin, Role } from '@prisma/client';

vi.mock('../../src/modules/admin-rbac/admin-rbac.repository', () => ({
  adminRbacRepository: {
    findAdminByEmail: vi.fn(),
    findAdminById: vi.fn(),
    findRoleById: vi.fn(),
    createAdmin: vi.fn(),
    assignRoleToAdmin: vi.fn(),
    updateAdminStatus: vi.fn(),
    setAdminTotp: vi.fn(),
    setAdminIpAllowlist: vi.fn(),
    revokeAllAdminSessions: vi.fn(),
    adminsWithRole: vi.fn().mockResolvedValue([]),
    countActiveAdminsWithRole: vi.fn().mockResolvedValue(2),
    getAdminRolesAndPermissions: vi.fn(),
    writeAdminLog: vi.fn(),
  },
}));

vi.mock('../../src/lib/redis', () => ({
  authRedisGet: vi.fn().mockResolvedValue(null),
  authRedisSet: vi.fn().mockResolvedValue('OK'),
  authRedisDel: vi.fn().mockResolvedValue(1),
}));

import { adminRbacRepository } from '../../src/modules/admin-rbac/admin-rbac.repository';
import { adminRbacService } from '../../src/modules/admin-rbac/admin-rbac.service';

const repo = vi.mocked(adminRbacRepository);

function makeAdmin(over: Partial<Admin> = {}): Admin {
  return {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: 'hash',
    totpSecretEnc: Buffer.alloc(0),
    totpEnabled: false,
    status: 'ACTIVE',
    ipAllowlist: [],
    createdAt: new Date(),
    ...over,
  } as Admin;
}

function makeRole(over: Partial<Role> = {}): Role {
  return {
    id: 'role-finance',
    name: 'FINANCE',
    scope: 'ADMIN',
    description: null,
    isSystem: true,
    createdAt: new Date(),
    ...over,
  } as Role;
}

const ACTOR = { adminId: 'super-1', ip: '10.0.0.1', requestId: 'req-1' };

beforeEach(() => {
  vi.clearAllMocks();
  repo.countActiveAdminsWithRole.mockResolvedValue(2);
  repo.adminsWithRole.mockResolvedValue([] as never);
});

describe('createAdmin', () => {
  it('creates a sub-admin, links the role, and returns a one-time password', async () => {
    repo.findRoleById.mockResolvedValue(makeRole() as never);
    repo.findAdminByEmail.mockResolvedValue(null);
    repo.createAdmin.mockResolvedValue(
      makeAdmin({ id: 'new-1', email: 'fin@example.com' }) as never,
    );

    const result = await adminRbacService.createAdmin(
      { email: 'fin@example.com', roleId: 'role-finance' },
      ACTOR,
    );

    expect(result.role).toBe('FINANCE');
    expect(typeof result.initialPassword).toBe('string');
    expect(result.initialPassword.length).toBeGreaterThanOrEqual(16);
    expect(repo.assignRoleToAdmin).toHaveBeenCalledWith('new-1', 'role-finance');
    // Audit is written WITHOUT the password.
    const auditArg = repo.writeAdminLog.mock.calls[0][0];
    expect(auditArg.action).toBe('admin.create');
    expect(JSON.stringify(auditArg)).not.toContain(result.initialPassword);
  });

  it('refuses to create a SUPER_ADMIN sub-admin', async () => {
    repo.findRoleById.mockResolvedValue(
      makeRole({ id: 'role-super', name: 'SUPER_ADMIN' }) as never,
    );
    await expect(
      adminRbacService.createAdmin({ email: 'x@e.com', roleId: 'role-super' }, ACTOR),
    ).rejects.toMatchObject({ errorCode: 'SUPER_ADMIN_NOT_ALLOWED' });
    expect(repo.createAdmin).not.toHaveBeenCalled();
  });

  it('rejects a duplicate email', async () => {
    repo.findRoleById.mockResolvedValue(makeRole() as never);
    repo.findAdminByEmail.mockResolvedValue(makeAdmin() as never);
    await expect(
      adminRbacService.createAdmin({ email: 'dupe@e.com', roleId: 'role-finance' }, ACTOR),
    ).rejects.toMatchObject({ errorCode: 'ADMIN_EXISTS' });
  });
});

describe('updateAdminStatus', () => {
  it('suspends an admin and revokes their sessions', async () => {
    repo.findAdminById.mockResolvedValue(makeAdmin({ id: 'sub-1' }) as never);
    repo.updateAdminStatus.mockResolvedValue(
      makeAdmin({ id: 'sub-1', status: 'SUSPENDED' }) as never,
    );

    const res = await adminRbacService.updateAdminStatus('sub-1', 'SUSPENDED', ACTOR);
    expect(res.status).toBe('SUSPENDED');
    expect(repo.revokeAllAdminSessions).toHaveBeenCalledWith('sub-1');
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.suspend', targetId: 'sub-1' }),
    );
  });

  it('refuses to change your own status', async () => {
    repo.findAdminById.mockResolvedValue(makeAdmin({ id: 'super-1' }) as never);
    await expect(
      adminRbacService.updateAdminStatus('super-1', 'SUSPENDED', ACTOR),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.updateAdminStatus).not.toHaveBeenCalled();
  });

  it('refuses to suspend the last active SUPER_ADMIN', async () => {
    repo.findAdminById.mockResolvedValue(makeAdmin({ id: 'sub-1' }) as never);
    repo.adminsWithRole.mockResolvedValue([{ adminId: 'sub-1' }] as never);
    repo.countActiveAdminsWithRole.mockResolvedValue(1);
    await expect(
      adminRbacService.updateAdminStatus('sub-1', 'SUSPENDED', ACTOR),
    ).rejects.toMatchObject({ errorCode: 'LAST_SUPER_ADMIN' });
  });
});

describe('resetAdminTotp', () => {
  it('disables TOTP and revokes sessions', async () => {
    repo.findAdminById.mockResolvedValue(makeAdmin({ id: 'sub-1', totpEnabled: true }) as never);
    repo.setAdminTotp.mockResolvedValue(makeAdmin({ id: 'sub-1', totpEnabled: false }) as never);

    const res = await adminRbacService.resetAdminTotp('sub-1', ACTOR);
    expect(res.totpEnabled).toBe(false);
    expect(repo.setAdminTotp).toHaveBeenCalledWith('sub-1', {
      secretEnc: Buffer.alloc(0),
      enabled: false,
    });
    expect(repo.revokeAllAdminSessions).toHaveBeenCalledWith('sub-1');
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.totp_reset' }),
    );
  });
});

describe('setIpAllowlist', () => {
  it('validates, de-dupes and persists IP entries', async () => {
    repo.findAdminById.mockResolvedValue(makeAdmin({ id: 'sub-1' }) as never);
    repo.setAdminIpAllowlist.mockResolvedValue(
      makeAdmin({ id: 'sub-1', ipAllowlist: ['10.0.0.0/8', '203.0.113.7'] }) as never,
    );

    const res = await adminRbacService.setIpAllowlist(
      'sub-1',
      ['10.0.0.0/8', '203.0.113.7', '10.0.0.0/8'],
      ACTOR,
    );
    expect(res.ipRestricted).toBe(true);
    const persisted = repo.setAdminIpAllowlist.mock.calls[0][1];
    expect(persisted).toEqual(['10.0.0.0/8', '203.0.113.7']); // de-duped
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.ip_allowlist_update' }),
    );
  });

  it('rejects an invalid IP entry', async () => {
    repo.findAdminById.mockResolvedValue(makeAdmin({ id: 'sub-1' }) as never);
    await expect(
      adminRbacService.setIpAllowlist('sub-1', ['10.0.0.999'], ACTOR),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.setAdminIpAllowlist).not.toHaveBeenCalled();
  });

  it('prevents locking yourself out (own allowlist must include your IP)', async () => {
    repo.findAdminById.mockResolvedValue(makeAdmin({ id: 'super-1' }) as never);
    await expect(
      // actor ip is 10.0.0.1, not covered by 203.0.113.0/24
      adminRbacService.setIpAllowlist('super-1', ['203.0.113.0/24'], ACTOR),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('login IP allowlist enforcement', () => {
  let passwordHash = '';
  beforeAll(async () => {
    passwordHash = await hash('Sup3rSecret!');
  });

  it('blocks login from an IP outside the allowlist', async () => {
    repo.findAdminByEmail.mockResolvedValue(
      makeAdmin({
        passwordHash,
        totpEnabled: false,
        ipAllowlist: ['10.0.0.1'],
      }) as never,
    );

    await expect(
      adminRbacService.login({
        email: 'admin@example.com',
        password: 'Sup3rSecret!',
        totp: '000000',
        ip: '8.8.8.8',
      }),
    ).rejects.toMatchObject({ errorCode: 'IP_NOT_ALLOWED' });

    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.login_blocked_ip' }),
    );
  });
});
