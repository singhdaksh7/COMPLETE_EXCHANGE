import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/authenticate';
import { authRateLimiter } from '../../middleware/rate-limit';
import { authController } from './auth.controller';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  sessionIdParamSchema,
  oauthExchangeSchema,
  verify2faSchema,
} from './auth.validators';
import {
  requestEmailOtpSchema,
  resendEmailOtpSchema,
  verifyEmailOtpSchema,
} from './auth.otp.validators';
import { authFederatedController } from './auth.federated.controller';
import {
  federatedLinkConfirmSchema,
  federatedLinkRequestOtpSchema,
  federatedLoginSchema,
  federatedRegisterCompleteSchema,
} from './auth.federated.validators';

/**
 * Auth routes.
 *   route → rate-limit → validate → (authenticate) → controller → service → repo
 *
 * Public/unauthenticated endpoints carry the tighter `authRateLimiter` to blunt
 * credential stuffing, brute force, and token guessing.
 */
export const authRouter = Router();

// ---- public ----
authRouter.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  asyncHandler(authController.register),
);

authRouter.post(
  '/verify-email',
  authRateLimiter,
  validate({ body: verifyEmailSchema }),
  asyncHandler(authController.verifyEmail),
);

authRouter.post(
  '/resend-verification',
  authRateLimiter,
  validate({ body: resendVerificationSchema }),
  asyncHandler(authController.resendVerification),
);

authRouter.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  asyncHandler(authController.login),
);

// Second step of a 2FA-gated login: exchange the challenge token + TOTP/backup
// code for real access/refresh tokens.
authRouter.post(
  '/2fa/verify',
  authRateLimiter,
  validate({ body: verify2faSchema }),
  asyncHandler(authController.verify2fa),
);

// ---- Google OAuth (Authorization Code + PKCE, one-time code exchange) ----
authRouter.get('/google/start', authRateLimiter, asyncHandler(authController.googleStart));

authRouter.get(
  '/google/callback',
  authRateLimiter,
  asyncHandler(authController.googleCallback),
);

authRouter.post(
  '/oauth/exchange',
  authRateLimiter,
  validate({ body: oauthExchangeSchema }),
  asyncHandler(authController.oauthExchange),
);

// ---- Federated identity (Google/Apple via Firebase Authentication, Stage 12) ----
// Firebase is a verification layer only; EXORA remains authoritative for
// users/sessions/tokens (see auth.federated.service.ts). Kept ALONGSIDE the
// legacy /auth/google/* + /auth/oauth/exchange routes above (not replacing
// them at the route level) — the web client is what's being migrated onto
// this endpoint; existing linked oauth_accounts rows keep resolving here too.
authRouter.post(
  '/federated/firebase',
  authRateLimiter,
  validate({ body: federatedLoginSchema }),
  asyncHandler(authFederatedController.login),
);

authRouter.post(
  '/federated/link/request-otp',
  authRateLimiter,
  validate({ body: federatedLinkRequestOtpSchema }),
  asyncHandler(authFederatedController.requestLinkOtp),
);

authRouter.post(
  '/federated/link/confirm',
  authRateLimiter,
  validate({ body: federatedLinkConfirmSchema }),
  asyncHandler(authFederatedController.confirmLink),
);

authRouter.post(
  '/federated/register/complete',
  authRateLimiter,
  validate({ body: federatedRegisterCompleteSchema }),
  asyncHandler(authFederatedController.completeRegistration),
);

authRouter.post(
  '/refresh',
  authRateLimiter,
  validate({ body: refreshSchema }),
  asyncHandler(authController.refresh),
);

// ---- passwordless email OTP (Stage 3A) ----
authRouter.post(
  '/request-email-otp',
  authRateLimiter,
  validate({ body: requestEmailOtpSchema }),
  asyncHandler(authController.requestEmailOtp),
);

authRouter.post(
  '/resend-email-otp',
  authRateLimiter,
  validate({ body: resendEmailOtpSchema }),
  asyncHandler(authController.resendEmailOtp),
);

authRouter.post(
  '/verify-email-otp',
  authRateLimiter,
  validate({ body: verifyEmailOtpSchema }),
  asyncHandler(authController.verifyEmailOtp),
);

authRouter.post(
  '/forgot-password',
  authRateLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(authController.forgotPassword),
);

authRouter.post(
  '/reset-password',
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(authController.resetPassword),
);

// ---- authenticated ----
authRouter.post(
  '/change-password',
  authenticate,
  authRateLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword),
);

authRouter.post('/logout', authenticate, asyncHandler(authController.logout));

authRouter.get('/sessions', authenticate, asyncHandler(authController.listSessions));

authRouter.delete(
  '/sessions/:sessionId',
  authenticate,
  validate({ params: sessionIdParamSchema }),
  asyncHandler(authController.revokeSession),
);

authRouter.get('/me', authenticate, asyncHandler(authController.me));

authRouter.get('/activity', authenticate, asyncHandler(authController.activity));
