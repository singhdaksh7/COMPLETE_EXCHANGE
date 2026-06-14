import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { hash } from '@node-rs/argon2';
import type { Admin, AdminSession, Permission, Role } from '@prisma/client';

vi.mock('../../src/modules/admin-rbac/admin-rbac.repository', () => ({
  adminRbacRepository: {
    findAdminByEmail: vi.fn(),
    findAdminById: vi.fn(),
    updateAdminPassword: vi.fn(),
    createAdminSession: vi.fn(),
    findAdminSessionWithAdmin: vi.fn(),
    revokeAdminSession: vi.fn(),
    listRoles: vi.fn(),
    findRoleById: vi.fn(),
    findRoleByName: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    listPermissions: vi.fn(),
    findPermissionById: vi.fn(),
    findPermissionByCode: vi.fn(),
    createPermission: vi.fn(),
    updatePermission: vi.fn(),
    deletePermission: vi.fn(),
    assignRoleToAdmin: vi.fn(),
    removeRoleFromAdmin: vi.fn(),
    grantPermissionToRole: vi.fn(),
    revokePermissionFromRole: vi.fn(),
    getAdminRolesAndPermissions: vi.fn(),
    adminsWithRole: vi.fn(),
    countActiveAdminsWithRole: vi.fn(),
    adminIdsForRole: vi.fn(),
    adminIdsForPermission: vi.fn(),
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
import { authRedisDel } from '../../src/lib/redis';

const repo = vi.mocked(adminRbacRepository);
const redisDel = vi.mocked(authRedisDel);

function makeAdmin(over: Partial<Admin> = {}): Admin {
  return {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: 'hash',
    totpSecretEnc: Buffer.alloc(0),
    totpEnabled: false,
    status: 'ACTIVE',
    createdAt: new Date(),
    ...over,
  } as Admin;
}

function makeSession(over: Partial<AdminSession> = {}): AdminSession {
  return {
    id: 'sess-1',
    adminId: 'admin-1',
    refreshHash: 'hash',
    ip: '127.0.0.1',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
    ...over,
  } as AdminSession;
}

function makeRole(over: Partial<Role> = {}): Role {
  return {
    id: 'role-1',
    name: 'FINANCE',
    scope: 'ADMIN',
    description: null,
    isSystem: false,
    createdAt: new Date(),
    ...over,
  } as Role;
}

function makePermission(over: Partial<Permission> = {}): Permission {
  return {
    id: 'perm-1',
    code: 'withdrawal.approve',
    description: null,
    ...over,
  } as Permission;
}

let passwordHash = '';

beforeAll(async () => {
  passwordHash = await hash('AdminPassw0rd!');
});

beforeEach(() => {
  vi.clearAllMocks();
  redisDel.mockResolvedValue(1);
  repo.createAdminSession.mockResolvedValue(makeSession());
  repo.writeAdminLog.mockResolvedValue({} as never);
  repo.getAdminRolesAndPermissions.mockResolvedValue({
    roles: ['SUPER_ADMIN'],
    permissions: ['role.manage', 'admin.manage', 'withdrawal.approve'],
  });
});

describe('adminRbacService', () => {
  it('logs in an active admin and creates an admin session', async () => {
    repo.findAdminByEmail.mockResolvedValue(makeAdmin({ passwordHash }));

    const result = await adminRbacService.login({
      email: 'admin@example.com',
      password: 'AdminPassw0rd!',
      totp: '000000',
      ip: '127.0.0.1',
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(repo.createAdminSession).toHaveBeenCalledOnce();
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.login' }),
    );
  });

  it('rejects inactive admins during live session validation', async () => {
    repo.findAdminSessionWithAdmin.mockResolvedValue({
      ...makeSession(),
      admin: makeAdmin({ status: 'LOCKED' }),
    });

    await expect(
      adminRbacService.validateAdminSession('admin-1', 'sess-1'),
    ).rejects.toMatchObject({ errorCode: 'SESSION_INVALID' });
  });

  it('prevents removing the last SUPER_ADMIN', async () => {
    repo.findRoleById.mockResolvedValue(makeRole({ name: 'SUPER_ADMIN' }) as never);
    repo.adminsWithRole.mockResolvedValue([{ adminId: 'admin-1' }]);
    repo.countActiveAdminsWithRole.mockResolvedValue(1);

    await expect(
      adminRbacService.removeRoleFromAdmin('admin-1', 'role-1', {
        adminId: 'admin-1',
      }),
    ).rejects.toMatchObject({ errorCode: 'LAST_SUPER_ADMIN' });
    expect(repo.removeRoleFromAdmin).not.toHaveBeenCalled();
  });

  it('prevents non-SUPER_ADMIN from granting permissions they do not hold', async () => {
    repo.findRoleById.mockResolvedValue(makeRole() as never);
    repo.findPermissionById.mockResolvedValue(
      makePermission({ code: 'ledger.adjust' }),
    );
    repo.getAdminRolesAndPermissions.mockResolvedValue({
      roles: ['FINANCE'],
      permissions: ['withdrawal.approve'],
    });

    await expect(
      adminRbacService.grantPermissionToRole('role-1', 'perm-1', {
        adminId: 'admin-1',
      }),
    ).rejects.toMatchObject({ errorCode: 'FORBIDDEN' });
    expect(repo.grantPermissionToRole).not.toHaveBeenCalled();
  });

  it('invalidates affected admin RBAC cache after permission grants', async () => {
    repo.findRoleById.mockResolvedValue(makeRole() as never);
    repo.findPermissionById.mockResolvedValue(makePermission());
    repo.adminIdsForRole.mockResolvedValue(['admin-1', 'admin-2']);
    repo.grantPermissionToRole.mockResolvedValue({} as never);

    await adminRbacService.grantPermissionToRole('role-1', 'perm-1', {
      adminId: 'admin-1',
    });

    expect(redisDel).toHaveBeenCalledWith('admin:rbac:perms:admin-1');
    expect(redisDel).toHaveBeenCalledWith('admin:rbac:perms:admin-2');
    expect(repo.writeAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.permission.grant' }),
    );
  });
});
