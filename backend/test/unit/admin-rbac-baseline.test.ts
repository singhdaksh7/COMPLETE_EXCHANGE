import { describe, expect, it } from 'vitest';
import { ADMIN_PERMISSIONS, ADMIN_ROLES } from '../../src/modules/admin-rbac/admin-rbac.baseline';

describe('admin RBAC baseline user-risk grants', () => {
  it('defines user management and risk permissions with expected role access', () => {
    expect(ADMIN_PERMISSIONS.map((p) => p.code)).toEqual(
      expect.arrayContaining(['users.view', 'users.manage', 'risk.manage', 'fees.view', 'reports.view']),
    );

    const support = ADMIN_ROLES.find((r) => r.name === 'SUPPORT');
    const readOnly = ADMIN_ROLES.find((r) => r.name === 'READ_ONLY');
    const finance = ADMIN_ROLES.find((r) => r.name === 'FINANCE');

    expect(support?.permissions).toContain('users.view');
    expect(support?.permissions).not.toContain('users.manage');
    expect(support?.permissions).not.toContain('risk.manage');
    expect(readOnly?.permissions).toContain('users.view');
    expect(readOnly?.permissions).toEqual(expect.arrayContaining(['fees.view', 'reports.view']));
    expect(readOnly?.permissions).not.toContain('users.manage');
    expect(finance?.permissions).toEqual(
      expect.arrayContaining(['users.view', 'risk.manage', 'fees.view', 'reports.view']),
    );
    expect(finance?.permissions).not.toContain('users.manage');
  });
});
