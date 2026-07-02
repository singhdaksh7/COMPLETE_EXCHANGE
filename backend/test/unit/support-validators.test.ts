import { describe, it, expect } from 'vitest';
import {
  userCreateTicketSchema,
  userMessageSchema,
  adminMessageSchema,
} from '../../src/modules/support/support.validators';

describe('support user validators (Stage 9A)', () => {
  it('accepts a valid ticket and trims fields', () => {
    const parsed = userCreateTicketSchema.parse({
      category: 'WITHDRAWAL',
      subject: '  Withdrawal stuck  ',
      message: 'My INR withdrawal has been pending for 2 days.',
      referenceType: 'INR_WITHDRAWAL',
      referenceId: 'UTR123456',
    });
    expect(parsed.subject).toBe('Withdrawal stuck');
    expect(parsed.category).toBe('WITHDRAWAL');
  });

  it('rejects an unknown category', () => {
    expect(() =>
      userCreateTicketSchema.parse({ category: 'CRYPTO', subject: 'hi there', message: 'hello' }),
    ).toThrow();
  });

  it('rejects HTML/script in subject, message and reference (stored-XSS guard)', () => {
    expect(() =>
      userCreateTicketSchema.parse({
        category: 'OTHER',
        subject: '<script>alert(1)</script>',
        message: 'ok message',
      }),
    ).toThrow();
    expect(() =>
      userCreateTicketSchema.parse({
        category: 'OTHER',
        subject: 'Valid subject',
        message: '<img src=x onerror=alert(1)>',
      }),
    ).toThrow();
    expect(() =>
      userCreateTicketSchema.parse({
        category: 'OTHER',
        subject: 'Valid subject',
        message: 'ok',
        referenceId: '<b>x</b>',
      }),
    ).toThrow();
  });

  it('rejects an over-long or empty message', () => {
    expect(() =>
      userMessageSchema.parse({ body: '' }),
    ).toThrow();
    expect(() =>
      userMessageSchema.parse({ body: 'x'.repeat(5001) }),
    ).toThrow();
    expect(userMessageSchema.parse({ body: 'a real reply' }).body).toBe('a real reply');
  });

  it('admin message defaults isInternalNote to false and rejects HTML', () => {
    expect(adminMessageSchema.parse({ body: 'looking into it' }).isInternalNote).toBe(false);
    expect(adminMessageSchema.parse({ body: 'note', isInternalNote: true }).isInternalNote).toBe(true);
    expect(() => adminMessageSchema.parse({ body: '<script>x</script>' })).toThrow();
  });
});
