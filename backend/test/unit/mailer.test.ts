import { describe, it, expect, beforeEach } from 'vitest';
import { mailer, outbox, verificationLink, resetLink } from '../../src/lib/mailer';

// These tests run under the default MAIL_PROVIDER=log (no AWS_REGION set), so
// they exercise the offline outbox path and the link builders only.
describe('mailer link builders', () => {
  it('builds a verification link with encoded email + token', () => {
    const link = verificationLink('user@example.com', 'tok-123');
    expect(link).toBe(
      'http://localhost:3000/verify-email?email=user%40example.com&token=tok-123',
    );
  });

  it('builds a reset link with an encoded token', () => {
    expect(resetLink('tok-456')).toBe(
      'http://localhost:3000/reset-password?token=tok-456',
    );
  });

  it('url-encodes token characters that need escaping', () => {
    // base64url is already URL-safe, but the builder must stay safe regardless.
    const link = resetLink('a+b/c=d');
    expect(link).toBe('http://localhost:3000/reset-password?token=a%2Bb%2Fc%3Dd');
  });
});

describe('mailer log provider (default)', () => {
  beforeEach(() => mailer.clearOutbox());

  it('records verification email to the outbox', async () => {
    await mailer.sendEmailVerification('a@example.com', 'verify-token');
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      to: 'a@example.com',
      kind: 'EMAIL_VERIFICATION',
      token: 'verify-token',
    });
    expect(mailer.lastTokenFor('a@example.com', 'EMAIL_VERIFICATION')).toBe('verify-token');
  });

  it('records password reset email to the outbox', async () => {
    await mailer.sendPasswordReset('b@example.com', 'reset-token');
    expect(mailer.lastTokenFor('b@example.com', 'PASSWORD_RESET')).toBe('reset-token');
  });

  it('clearOutbox empties the outbox', async () => {
    await mailer.sendEmailVerification('c@example.com', 'x');
    mailer.clearOutbox();
    expect(outbox).toHaveLength(0);
  });
});
