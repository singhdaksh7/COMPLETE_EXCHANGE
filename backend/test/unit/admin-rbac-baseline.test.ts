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

  it('grants Stage 5.3 wallet-risk / Travel Rule permissions to the right roles', () => {
    expect(ADMIN_PERMISSIONS.map((p) => p.code)).toEqual(
      expect.arrayContaining([
        'compliance.walletRisk.view',
        'compliance.walletRisk.run',
        'compliance.walletRisk.review',
        'compliance.travelRule.view',
        'compliance.travelRule.manage',
        'compliance.travelRule.export',
      ]),
    );

    const reviewer = ADMIN_ROLES.find((r) => r.name === 'KYC_REVIEWER');
    const finance = ADMIN_ROLES.find((r) => r.name === 'FINANCE');
    const support = ADMIN_ROLES.find((r) => r.name === 'SUPPORT');

    expect(reviewer?.permissions).toEqual(
      expect.arrayContaining([
        'compliance.walletRisk.view',
        'compliance.walletRisk.run',
        'compliance.walletRisk.review',
        'compliance.travelRule.view',
        'compliance.travelRule.manage',
        'compliance.travelRule.export',
      ]),
    );
    expect(finance?.permissions).toEqual(
      expect.arrayContaining(['compliance.walletRisk.view', 'compliance.travelRule.view']),
    );
    expect(finance?.permissions).not.toContain('compliance.walletRisk.run');
    // Read-only roles inherit only the .view grants.
    expect(support?.permissions).toEqual(
      expect.arrayContaining(['compliance.walletRisk.view', 'compliance.travelRule.view']),
    );
    expect(support?.permissions).not.toContain('compliance.walletRisk.review');
    expect(support?.permissions).not.toContain('compliance.travelRule.manage');
  });

  it('grants Stage 5.4 evidence-pack / retention permissions to the right roles', () => {
    expect(ADMIN_PERMISSIONS.map((p) => p.code)).toEqual(
      expect.arrayContaining([
        'compliance.evidencePack.view',
        'compliance.evidencePack.generate',
        'compliance.evidencePack.export',
        'compliance.retention.view',
        'compliance.retention.manage',
        'compliance.exportEvent.view',
      ]),
    );

    const reviewer = ADMIN_ROLES.find((r) => r.name === 'KYC_REVIEWER');
    const finance = ADMIN_ROLES.find((r) => r.name === 'FINANCE');
    const support = ADMIN_ROLES.find((r) => r.name === 'SUPPORT');

    // KYC_REVIEWER: full evidence-pack + retention handling.
    expect(reviewer?.permissions).toEqual(
      expect.arrayContaining([
        'compliance.evidencePack.view',
        'compliance.evidencePack.generate',
        'compliance.evidencePack.export',
        'compliance.retention.view',
        'compliance.retention.manage',
        'compliance.exportEvent.view',
      ]),
    );
    // FINANCE: read-only retention oversight, NO broad compliance export/generate.
    expect(finance?.permissions).toEqual(
      expect.arrayContaining(['compliance.retention.view', 'compliance.exportEvent.view']),
    );
    expect(finance?.permissions).not.toContain('compliance.evidencePack.generate');
    expect(finance?.permissions).not.toContain('compliance.evidencePack.export');
    // Read-only roles inherit only the .view grants (VIEW_ONLY filter).
    expect(support?.permissions).toEqual(
      expect.arrayContaining(['compliance.evidencePack.view', 'compliance.retention.view', 'compliance.exportEvent.view']),
    );
    expect(support?.permissions).not.toContain('compliance.evidencePack.generate');
    expect(support?.permissions).not.toContain('compliance.retention.manage');
  });

  it('grants Stage 5.5/5.6 tax / legal / FIU permissions to the right roles', () => {
    expect(ADMIN_PERMISSIONS.map((p) => p.code)).toEqual(
      expect.arrayContaining([
        'tax.rule.view', 'tax.rule.manage', 'tax.tds.view', 'tax.statement.view', 'tax.statement.generate',
        'legal.document.view', 'legal.document.manage', 'legal.acceptance.view',
        'compliance.fiuReport.view', 'compliance.fiuReport.generate', 'compliance.fiuReport.validate', 'compliance.fiuReport.export', 'compliance.fiuReport.manage',
      ]),
    );

    const reviewer = ADMIN_ROLES.find((r) => r.name === 'KYC_REVIEWER');
    const finance = ADMIN_ROLES.find((r) => r.name === 'FINANCE');
    const support = ADMIN_ROLES.find((r) => r.name === 'SUPPORT');

    // FINANCE owns tax view/statements (calc-only) but no FIU export and not rule.manage.
    expect(finance?.permissions).toEqual(
      expect.arrayContaining(['tax.rule.view', 'tax.tds.view', 'tax.statement.view', 'tax.statement.generate']),
    );
    expect(finance?.permissions).not.toContain('tax.rule.manage');
    expect(finance?.permissions).not.toContain('compliance.fiuReport.export');
    expect(finance?.permissions).not.toContain('compliance.fiuReport.generate');

    // KYC_REVIEWER (compliance) handles FIU drafts + sees legal acceptances.
    expect(reviewer?.permissions).toEqual(
      expect.arrayContaining([
        'legal.acceptance.view',
        'compliance.fiuReport.view', 'compliance.fiuReport.generate', 'compliance.fiuReport.validate', 'compliance.fiuReport.export',
      ]),
    );

    // Read-only roles inherit only .view grants.
    expect(support?.permissions).toEqual(
      expect.arrayContaining(['tax.rule.view', 'legal.document.view', 'legal.acceptance.view', 'compliance.fiuReport.view']),
    );
    expect(support?.permissions).not.toContain('compliance.fiuReport.generate');
    expect(support?.permissions).not.toContain('tax.statement.generate');
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
