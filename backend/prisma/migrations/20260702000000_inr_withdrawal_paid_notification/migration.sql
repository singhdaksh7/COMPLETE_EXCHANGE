-- Stage 7B: add the INR_WITHDRAWAL_PAID notification type.
-- Additive enum value only. Lets a manual INR withdrawal "mark paid" (bank
-- payout) surface a correct in-app alert to the user, instead of reusing the
-- WITHDRAWAL_COMPLETED copy which says "sent on-chain" (wrong for INR).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INR_WITHDRAWAL_PAID';
