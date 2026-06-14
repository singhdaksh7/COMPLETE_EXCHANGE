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
} from './auth.validators';

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

authRouter.post(
  '/refresh',
  authRateLimiter,
  validate({ body: refreshSchema }),
  asyncHandler(authController.refresh),
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
