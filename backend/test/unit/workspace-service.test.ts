import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeSlaStatus } from '../../src/modules/compliance/workspace.sla';

vi.mock('../../src/modules/compliance/workspace.repository', () => ({
  workspaceRepository: {
    createTask: vi.fn(),
    findTaskByDedupe: vi.fn(),
    updateTask: vi.fn(),
    findTask: vi.fn(),
    listTasks: vi.fn(),
    createEvent: vi.fn().mockResolvedValue({}),
    upsertSla: vi.fn().mockResolvedValue({}),
    createTemplate: vi.fn(),
    listTemplates: vi.fn().mockResolvedValue([]),
    findTemplate: vi.fn(),
    createResponse: vi.fn(),
    updateResponse: vi.fn(),
    listResponsesForTask: vi.fn().mockResolvedValue([]),
    createApproval: vi.fn(),
    findApproval: vi.fn(),
    updateApproval: vi.fn(),
    listApprovals: vi.fn(),
    summary: vi.fn(),
    fiuNeedingReview: vi.fn().mockResolvedValue(0),
  },
}));
vi.mock('../../src/lib/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));

import { workspaceService } from '../../src/modules/compliance/workspace.service';
import { workspaceRepository } from '../../src/modules/compliance/workspace.repository';

const repo = vi.mocked(workspaceRepository);

function taskRow(over: Record<string, unknown> = {}) {
  return { id: 't1', type: 'GENERAL_AML_REVIEW', status: 'OPEN', priority: 'MEDIUM', title: 't', events: [], checklistResponses: [], sla: null, user: null, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findTask.mockResolvedValue(taskRow() as never);
});

describe('computeSlaStatus (pure)', () => {
  const start = new Date('2026-06-22T00:00:00Z');
  const due = new Date('2026-06-22T10:00:00Z');
  it('COMPLETED when completedAt set', () => {
    expect(computeSlaStatus({ startedAt: start, dueAt: due, completedAt: new Date() })).toBe('COMPLETED');
  });
  it('BREACHED when now past due', () => {
    expect(computeSlaStatus({ startedAt: start, dueAt: due, now: new Date('2026-06-22T11:00:00Z') })).toBe('BREACHED');
  });
  it('AT_RISK near the deadline', () => {
    expect(computeSlaStatus({ startedAt: start, dueAt: due, now: new Date('2026-06-22T09:00:00Z') })).toBe('AT_RISK');
  });
  it('ON_TRACK early', () => {
    expect(computeSlaStatus({ startedAt: start, dueAt: due, now: new Date('2026-06-22T01:00:00Z') })).toBe('ON_TRACK');
  });
});

describe('workspaceService.createTask', () => {
  it('creates a task + SLA tracker + CREATED event (idempotent on dedupeKey)', async () => {
    repo.createTask.mockResolvedValue({ id: 't1' } as never);
    await workspaceService.createTask({ type: 'STR_CASE_REVIEW', title: 'Review', slaMinutes: 60 }, { actorId: 'admin-1' });
    expect(repo.createTask).toHaveBeenCalled();
    expect(repo.upsertSla).toHaveBeenCalled();
    expect(repo.createEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATED' }));
  });

  it('returns the existing task when dedupeKey already exists', async () => {
    repo.findTaskByDedupe.mockResolvedValue({ id: 't-existing' } as never);
    repo.findTask.mockResolvedValue(taskRow({ id: 't-existing' }) as never);
    await workspaceService.createTask({ type: 'STR_CASE_REVIEW', title: 'Review', dedupeKey: 'k1' }, {});
    expect(repo.createTask).not.toHaveBeenCalled();
  });
});

describe('workspaceService.setStatus — required checklist gate', () => {
  it('blocks COMPLETED when a required checklist is incomplete', async () => {
    repo.findTask.mockResolvedValue(taskRow({ checklistResponses: [{ templateId: 'tpl-1', completed: false }] }) as never);
    repo.findTemplate.mockResolvedValue({ id: 'tpl-1', requiredForCompletion: true } as never);
    await expect(workspaceService.setStatus('t1', 'COMPLETED', undefined, { actorId: 'a' })).rejects.toThrow(/checklist/i);
  });

  it('allows COMPLETED when no required checklist is pending', async () => {
    repo.findTask.mockResolvedValue(taskRow({ checklistResponses: [] }) as never);
    repo.updateTask.mockResolvedValue({} as never);
    await workspaceService.setStatus('t1', 'COMPLETED', undefined, { actorId: 'a' });
    expect(repo.updateTask).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'COMPLETED' }));
  });
});

describe('workspaceService maker-checker approvals', () => {
  it('creates a PENDING approval with the maker recorded', async () => {
    repo.createApproval.mockResolvedValue({ id: 'ap1' } as never);
    await workspaceService.createApproval({ approvalType: 'FIU_DRAFT_EXPORT', title: 'export' }, { actorId: 'admin-maker' });
    expect(repo.createApproval).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING', makerAdminId: 'admin-maker' }));
  });

  it('the maker CANNOT approve their own request', async () => {
    repo.findApproval.mockResolvedValue({ id: 'ap1', status: 'PENDING', makerAdminId: 'admin-maker' } as never);
    await expect(workspaceService.decideApproval('ap1', 'APPROVED', undefined, { actorId: 'admin-maker' })).rejects.toThrow(/maker cannot/i);
    expect(repo.updateApproval).not.toHaveBeenCalled();
  });

  it('a different admin (checker) can approve', async () => {
    repo.findApproval.mockResolvedValue({ id: 'ap1', status: 'PENDING', makerAdminId: 'admin-maker', approvalType: 'FIU_DRAFT_EXPORT' } as never);
    repo.updateApproval.mockResolvedValue({ id: 'ap1', status: 'APPROVED' } as never);
    await workspaceService.decideApproval('ap1', 'APPROVED', 'ok', { actorId: 'admin-checker' });
    expect(repo.updateApproval).toHaveBeenCalledWith('ap1', expect.objectContaining({ status: 'APPROVED', checkerAdminId: 'admin-checker' }));
  });

  it('cannot decide an already-decided approval', async () => {
    repo.findApproval.mockResolvedValue({ id: 'ap1', status: 'APPROVED', makerAdminId: 'm' } as never);
    await expect(workspaceService.decideApproval('ap1', 'REJECTED', undefined, { actorId: 'c' })).rejects.toThrow(/not pending/i);
  });
});

describe('workspaceService.createTemplate', () => {
  it('creates an active checklist template', async () => {
    repo.createTemplate.mockResolvedValue({ id: 'tpl1' } as never);
    await workspaceService.createTemplate({ taskType: 'KYC_REVIEW', name: 'KYC checklist', items: [{ key: 'pan', label: 'PAN verified' }], requiredForCompletion: true }, { actorId: 'a' });
    expect(repo.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ active: true, requiredForCompletion: true }));
  });
});
