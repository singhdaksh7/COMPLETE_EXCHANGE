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

  it('grants KYC + compliance permissions to the right roles', () => {
    expect(ADMIN_PERMISSIONS.map((p) => p.code)).toEqual(
      expect.arrayContaining(['kyc.view', 'kyc.review', 'compliance.view']),
    );

    const reviewer = ADMIN_ROLES.find((r) => r.name === 'KYC_REVIEWER');
    const finance = ADMIN_ROLES.find((r) => r.name === 'FINANCE');
    const support = ADMIN_ROLES.find((r) => r.name === 'SUPPORT');
    const readOnly = ADMIN_ROLES.find((r) => r.name === 'READ_ONLY');

    // KYC_REVIEWER can view + review + see compliance metrics.
    expect(reviewer?.permissions).toEqual(
      expect.arrayContaining(['kyc.view', 'kyc.review', 'compliance.view']),
    );
    // FINANCE sees compliance metrics but cannot review KYC.
    expect(finance?.permissions).toContain('compliance.view');
    expect(finance?.permissions).not.toContain('kyc.review');
    // Read-only roles inherit the view grants but never the review grant.
    expect(support?.permissions).toEqual(
      expect.arrayContaining(['kyc.view', 'compliance.view']),
    );
    expect(support?.permissions).not.toContain('kyc.review');
    expect(readOnly?.permissions).toContain('compliance.view');
    expect(readOnly?.permissions).not.toContain('kyc.review');
  });

  it('grants Stage 5.2 monitoring/case permissions to the right roles', () => {
    expect(ADMIN_PERMISSIONS.map((p) => p.code)).toEqual(
      expect.arrayContaining([
        'compliance.case.view',
        'compliance.case.manage',
        'compliance.case.assign',
        'compliance.alert.view',
        'compliance.alert.manage',
        'compliance.monitoring.run',
        'compliance.str.export',
      ]),
    );

    const reviewer = ADMIN_ROLES.find((r) => r.name === 'KYC_REVIEWER');
    const finance = ADMIN_ROLES.find((r) => r.name === 'FINANCE');
    const support = ADMIN_ROLES.find((r) => r.name === 'SUPPORT');
    const readOnly = ADMIN_ROLES.find((r) => r.name === 'READ_ONLY');

    // KYC_REVIEWER fully handles cases/alerts, runs monitoring, exports STR drafts.
    expect(reviewer?.permissions).toEqual(
      expect.arrayContaining([
        'compliance.case.view',
        'compliance.case.manage',
        'compliance.case.assign',
        'compliance.alert.view',
        'compliance.alert.manage',
        'compliance.monitoring.run',
        'compliance.str.export',
      ]),
    );
    // FINANCE has read-only case/alert visibility but cannot manage or run.
    expect(finance?.permissions).toEqual(
      expect.arrayContaining(['compliance.case.view', 'compliance.alert.view']),
    );
    expect(finance?.permissions).not.toContain('compliance.case.manage');
    expect(finance?.permissions).not.toContain('compliance.monitoring.run');
    // Read-only roles inherit the .view grants only (VIEW_ONLY filter).
    expect(support?.permissions).toEqual(
      expect.arrayContaining(['compliance.case.view', 'compliance.alert.view']),
    );
    expect(support?.permissions).not.toContain('compliance.case.manage');
    expect(support?.permissions).not.toContain('compliance.str.export');
    expect(readOnly?.permissions).toContain('compliance.case.view');
    expect(readOnly?.permissions).not.toContain('compliance.monitoring.run');
  });

  it('defines system / ops-center permissions with the right role access (Stage 4.3)', () => {
    expect(ADMIN_PERMISSIONS.map((p) => p.code)).toEqual(
      expect.arrayContaining(['system.view', 'system.health.view', 'system.risk.view']),
    );

    const finance = ADMIN_ROLES.find((r) => r.name === 'FINANCE');
    const reviewer = ADMIN_ROLES.find((r) => r.name === 'KYC_REVIEWER');
    const support = ADMIN_ROLES.find((r) => r.name === 'SUPPORT');
    const readOnly = ADMIN_ROLES.find((r) => r.name === 'READ_ONLY');

    // FINANCE acts as operations admin: full system visibility.
    expect(finance?.permissions).toEqual(
      expect.arrayContaining(['system.view', 'system.health.view', 'system.risk.view']),
    );
    // KYC_REVIEWER acts as compliance admin: ops + risk, but not health-only.
    expect(reviewer?.permissions).toEqual(
      expect.arrayContaining(['system.view', 'system.risk.view']),
    );
    // The three new permissions all end in `.view`, so the read-only roles
    // inherit them through the VIEW_ONLY filter.
    expect(support?.permissions).toEqual(
      expect.arrayContaining(['system.view', 'system.health.view', 'system.risk.view']),
    );
    expect(readOnly?.permissions).toEqual(
      expect.arrayContaining(['system.view', 'system.health.view', 'system.risk.view']),
    );
  });
});
