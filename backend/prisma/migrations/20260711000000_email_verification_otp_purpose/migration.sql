-- Additive only: adds a new value to the existing EmailOtpPurpose enum so
-- mandatory email verification (password accounts) can reuse the existing
-- email_otps table/infrastructure under its own purpose, rather than a new
-- mechanism. No existing rows, columns, or constraints are touched.
--
-- Postgres requires ALTER TYPE ... ADD VALUE to run outside a transaction
-- block; Prisma's migration runner handles this automatically for this exact
-- statement shape.
ALTER TYPE "EmailOtpPurpose" ADD VALUE 'EMAIL_VERIFICATION';
