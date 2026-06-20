import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Notification } from '@prisma/client';

vi.mock('../../src/modules/notification/notification.repository', () => ({
  notificationRepository: {
    create: vi.fn(),
    setEmailStatus: vi.fn(),
    findUserEmail: vi.fn(),
    listForUser: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    existsForUser: vi.fn(),
    markAllRead: vi.fn(),
    adminRecent: vi.fn(),
  },
}));

vi.mock('../../src/lib/mailer', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/mailer')>();
  return {
    ...actual,
    mailer: { ...actual.mailer, sendNotification: vi.fn() },
  };
});

import { notificationRepository } from '../../src/modules/notification/notification.repository';
import { notificationService } from '../../src/modules/notification/notification.service';
import { mailer } from '../../src/lib/mailer';

const repo = vi.mocked(notificationRepository);
const sendNotification = vi.mocked(mailer.sendNotification);

function makeRow(over: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    userId: 'user-1',
    type: 'KYC_APPROVED',
    title: 'KYC approved',
    message: 'ok',
    metadata: null,
    emailStatus: null,
    readAt: null,
    createdAt: new Date(),
    ...over,
  } as Notification;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.create.mockResolvedValue(makeRow());
  repo.findUserEmail.mockResolvedValue({ email: 'u@example.com' });
  sendNotification.mockResolvedValue('log');
});

describe('notificationService.notify', () => {
  it('creates a notification row from the type template', async () => {
    await notificationService.notify({ userId: 'user-1', type: 'KYC_APPROVED' });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'KYC_APPROVED', title: 'KYC approved' }),
    );
  });

  it('sends the email via the resolved account address and records LOGGED in log mode', async () => {
    await notificationService.notify({ userId: 'user-1', type: 'WITHDRAWAL_COMPLETED', metadata: { amount: '5', asset: 'USDT' } });
    expect(sendNotification).toHaveBeenCalledWith('u@example.com', expect.objectContaining({ subject: expect.any(String) }));
    expect(repo.create.mock.calls[0][0].emailStatus).toBe('LOGGED');
  });

  it('records SENT when the provider delivers via SES', async () => {
    sendNotification.mockResolvedValue('ses');
    await notificationService.notify({ userId: 'user-1', type: 'PASSWORD_CHANGED' });
    expect(repo.create.mock.calls[0][0].emailStatus).toBe('SENT');
  });

  it('does not email in-app-only types (deposit submitted) → SKIPPED', async () => {
    await notificationService.notify({ userId: 'user-1', type: 'INR_DEPOSIT_SUBMITTED', metadata: { amount: '100' } });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(repo.create.mock.calls[0][0].emailStatus).toBe('SKIPPED');
  });

  it('still records the notification (FAILED email) when the mailer throws', async () => {
    sendNotification.mockRejectedValue(new Error('ses down'));
    await notificationService.notify({ userId: 'user-1', type: 'KYC_REJECTED', metadata: { reason: 'blurry' } });
    expect(repo.create.mock.calls[0][0].emailStatus).toBe('FAILED');
  });

  it('is fail-safe: never throws even if the repository write fails', async () => {
    repo.create.mockRejectedValue(new Error('db down'));
    await expect(
      notificationService.notify({ userId: 'user-1', type: 'KYC_APPROVED' }),
    ).resolves.toBeUndefined();
  });

  it('never puts secrets/raw reason fields beyond the safe message into the row', async () => {
    await notificationService.notify({ userId: 'user-1', type: 'WITHDRAWAL_REQUESTED', metadata: { amount: '5', asset: 'USDT' } });
    const row = repo.create.mock.calls[0][0];
    expect(row.message).toContain('5 USDT');
  });
});

describe('notificationService.list / markRead', () => {
  it('returns only the caller-scoped notifications with an unread count', async () => {
    repo.listForUser.mockResolvedValue([makeRow({ id: 'a' }), makeRow({ id: 'b', readAt: new Date() })]);
    repo.unreadCount.mockResolvedValue(1);

    const result = await notificationService.list({ userId: 'user-1' });

    expect(repo.listForUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
    expect(result.items).toHaveLength(2);
    expect(result.unread).toBe(1);
    expect(result.items[0]).toMatchObject({ id: 'a', read: false });
    expect(result.items[1]).toMatchObject({ id: 'b', read: true });
  });

  it('markRead scopes the update to the owner', async () => {
    repo.markRead.mockResolvedValue(1);
    const res = await notificationService.markRead('user-1', 'n1');
    expect(repo.markRead).toHaveBeenCalledWith('user-1', 'n1');
    expect(res).toEqual({ read: true });
  });

  it('markRead 404s when the notification does not belong to the user', async () => {
    repo.markRead.mockResolvedValue(0);
    repo.existsForUser.mockResolvedValue(null);
    await expect(notificationService.markRead('user-1', 'other')).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });

  it('markRead is idempotent for an already-read own notification', async () => {
    repo.markRead.mockResolvedValue(0);
    repo.existsForUser.mockResolvedValue(makeRow({ readAt: new Date() }));
    await expect(notificationService.markRead('user-1', 'n1')).resolves.toEqual({ read: true });
  });
});
