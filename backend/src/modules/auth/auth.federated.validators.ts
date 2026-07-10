import { z } from 'zod';
import { acceptedPolicies, loginLocation, opaqueToken, phoneNumber } from './auth.validators';

const federatedProvider = z.enum(['GOOGLE', 'APPLE']);

export const federatedLoginSchema = z
  .object({
    idToken: z.string().min(16, 'Invalid token').max(4096),
    provider: federatedProvider,
    location: loginLocation,
  })
  .strict();

export const federatedLinkRequestOtpSchema = z
  .object({
    challengeToken: opaqueToken,
  })
  .strict();

export const federatedLinkConfirmSchema = z
  .object({
    challengeToken: opaqueToken,
    otp: z.string().trim().regex(/^\d{6}$/, 'Invalid code'),
    location: loginLocation,
  })
  .strict();

export const federatedRegisterCompleteSchema = z
  .object({
    challengeToken: opaqueToken,
    phone: phoneNumber,
    acceptedPolicies,
    location: loginLocation,
  })
  .strict();

export type FederatedLoginDto = z.infer<typeof federatedLoginSchema>;
export type FederatedLinkConfirmDto = z.infer<typeof federatedLinkConfirmSchema>;
export type FederatedRegisterCompleteDto = z.infer<typeof federatedRegisterCompleteSchema>;
