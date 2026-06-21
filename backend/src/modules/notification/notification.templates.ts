import type { NotificationType } from '@prisma/client';
import { type EmailContent, notificationLayout } from '../../lib/mailer';

export interface BuiltNotification {
  title: string;
  message: string;
  /** When present, an email is also dispatched (best-effort) for this type. */
  email?: EmailContent;
}

type Meta = Record<string, unknown>;

function str(meta: Meta | undefined, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
}

function email(subject: string, heading: string, body: string): EmailContent {
  return {
    subject,
    html: notificationLayout(heading, body),
    text: `${heading}\n\n${body}\n\nView details in your Exora account.`,
  };
}

/**
 * Map a notification type + metadata to its in-app copy and (optionally) an
 * email. Copy is intentionally plain and safe — it never contains secrets,
 * tokens, full document data, or internal compliance notes.
 */
export function buildNotification(type: NotificationType, meta?: Meta): BuiltNotification {
  switch (type) {
    case 'KYC_APPROVED':
      return {
        title: 'KYC approved',
        message: 'Your identity verification was approved. Trading, deposits and withdrawals are now unlocked.',
        email: email('Your Exora KYC is approved', 'KYC approved', 'Your identity verification was approved. You can now trade, deposit and withdraw.'),
      };
    case 'KYC_REJECTED': {
      const reason = str(meta, 'reason');
      const body = reason
        ? `Your identity verification could not be approved. Reason: ${reason}. You can review your details and resubmit.`
        : 'Your identity verification could not be approved. You can review your details and resubmit.';
      return { title: 'KYC rejected', message: body, email: email('Update on your Exora KYC', 'KYC rejected', body) };
    }
    case 'KYC_NEEDS_MORE_INFO': {
      const reason = str(meta, 'reason');
      const body = reason
        ? `We need more information to complete your verification: ${reason}. Please resubmit with the requested details.`
        : 'We need more information to complete your verification. Please resubmit with the requested details.';
      return { title: 'More information needed', message: body, email: email('Action needed on your Exora KYC', 'More information needed', body) };
    }
    case 'KYC_SUBMITTED':
      return {
        title: 'KYC submitted',
        message: 'We received your identity verification details. Your submission is now pending review.',
        email: email('We received your Exora KYC', 'KYC submitted', 'We received your identity verification details. Your submission is now pending review — we will email you when the review is complete.'),
      };
    case 'KYC_LIVENESS_FAILED':
      return {
        title: 'Liveness check failed',
        message: 'Your liveness check could not be completed. Please retry the selfie/liveness step from your KYC page.',
        email: email('Action needed: Exora liveness check', 'Liveness check failed', 'Your liveness check could not be completed. Please retry the selfie/liveness step from your KYC page.'),
      };
    case 'COMPLIANCE_REVIEW_COMPLETED': {
      const outcome = str(meta, 'outcome');
      const body = `Your compliance review is complete${outcome ? ` (${outcome})` : ''}. See your KYC status page for details.`;
      // In-app only — the specific approved/rejected email is sent separately.
      return { title: 'Compliance review completed', message: body };
    }
    case 'INR_DEPOSIT_SUBMITTED': {
      const amt = str(meta, 'amount');
      return {
        title: 'Deposit submitted',
        message: `We received your INR deposit request${amt ? ` of ₹${amt}` : ''}. It is pending review.`,
        // In-app only — no email for the submission acknowledgement.
      };
    }
    case 'INR_DEPOSIT_APPROVED': {
      const amt = str(meta, 'amount');
      const body = `Your INR deposit${amt ? ` of ₹${amt}` : ''} was approved and credited to your wallet.`;
      return { title: 'Deposit approved', message: body, email: email('Your Exora deposit is credited', 'Deposit approved', body) };
    }
    case 'INR_DEPOSIT_REJECTED': {
      const amt = str(meta, 'amount');
      const reason = str(meta, 'reason');
      const body = `Your INR deposit${amt ? ` of ₹${amt}` : ''} was rejected${reason ? `: ${reason}` : ''}.`;
      return { title: 'Deposit rejected', message: body, email: email('Update on your Exora deposit', 'Deposit rejected', body) };
    }
    case 'WITHDRAWAL_REQUESTED': {
      const amt = str(meta, 'amount');
      const asset = str(meta, 'asset') ?? 'USDT';
      const body = `Your withdrawal request${amt ? ` of ${amt} ${asset}` : ''} was received and is being processed.`;
      return { title: 'Withdrawal requested', message: body, email: email('Withdrawal request received', 'Withdrawal requested', body) };
    }
    case 'WITHDRAWAL_APPROVED': {
      const amt = str(meta, 'amount');
      const asset = str(meta, 'asset') ?? 'USDT';
      const body = `Your withdrawal${amt ? ` of ${amt} ${asset}` : ''} was approved and is queued for processing.`;
      return { title: 'Withdrawal approved', message: body, email: email('Your Exora withdrawal is approved', 'Withdrawal approved', body) };
    }
    case 'WITHDRAWAL_REJECTED': {
      const amt = str(meta, 'amount');
      const asset = str(meta, 'asset') ?? 'USDT';
      const reason = str(meta, 'reason');
      const body = `Your withdrawal${amt ? ` of ${amt} ${asset}` : ''} was rejected${reason ? `: ${reason}` : ''}. Any held funds have been released.`;
      return { title: 'Withdrawal rejected', message: body, email: email('Update on your Exora withdrawal', 'Withdrawal rejected', body) };
    }
    case 'WITHDRAWAL_COMPLETED': {
      const amt = str(meta, 'amount');
      const asset = str(meta, 'asset') ?? 'USDT';
      const body = `Your withdrawal${amt ? ` of ${amt} ${asset}` : ''} has completed and been sent on-chain.`;
      return { title: 'Withdrawal completed', message: body, email: email('Your Exora withdrawal is complete', 'Withdrawal completed', body) };
    }
    case 'PASSWORD_CHANGED':
      return {
        title: 'Password changed',
        message: 'Your account password was changed. If this was not you, reset your password and contact support immediately.',
        email: email('Your Exora password was changed', 'Password changed', 'Your account password was changed. If this was not you, reset your password and contact support immediately.'),
      };
    case 'SECURITY_SESSION_REVOKED':
      return {
        title: 'A session was signed out',
        message: 'A login session on your account was signed out. If this was not you, review your security settings and change your password.',
        email: email('Security alert: session signed out', 'A session was signed out', 'A login session on your account was signed out. If this was not you, review your security settings and change your password.'),
      };
    default:
      return { title: 'Notification', message: 'You have a new notification.' };
  }
}
