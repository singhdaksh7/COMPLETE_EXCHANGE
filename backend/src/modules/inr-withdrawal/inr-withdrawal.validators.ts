import { z } from 'zod';

/**
 * INR rupee amount as a DECIMAL STRING (never a JS float): up to 2 decimal
 * places, strictly greater than zero.
 */
const inrAmount = z
  .string()
  .regex(
    /^(0|[1-9]\d*)(\.\d{1,2})?$/,
    'Amount must be a decimal string with up to 2 decimal places',
  )
  .refine((v) => !/^0(?:\.0{1,2})?$/.test(v), 'Amount must be greater than zero');

const inrWithdrawalStatus = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PAID',
  'FAILED',
]);

const upiId = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID (name@bank)');

const accountNumber = z
  .string()
  .trim()
  .regex(/^\d{6,20}$/, 'Account number must be 6–20 digits');

const ifsc = z
  .string()
  .trim()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code');

const holderName = z.string().trim().min(2).max(120);
const bankName = z.string().trim().min(2).max(120).optional();

/**
 * Create an INR withdrawal request. Either a UPI id OR full bank details must be
 * present, matching `method`. A superRefine enforces the method/details pairing
 * so the service can trust exactly one destination is populated.
 */
export const createWithdrawalSchema = z
  .object({
    amount: inrAmount,
    method: z.enum(['UPI', 'BANK']),
    upiId: upiId.optional(),
    accountNumber: accountNumber.optional(),
    ifsc: ifsc.optional(),
    holderName: holderName.optional(),
    bankName,
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.method === 'UPI') {
      if (!val.upiId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['upiId'],
          message: 'UPI ID is required for a UPI payout',
        });
      }
    } else {
      if (!val.accountNumber)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['accountNumber'],
          message: 'Account number is required for a bank payout',
        });
      if (!val.ifsc)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ifsc'],
          message: 'IFSC is required for a bank payout',
        });
      if (!val.holderName)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['holderName'],
          message: 'Account holder name is required for a bank payout',
        });
    }
  });

export const rejectWithdrawalSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const markPaidSchema = z
  .object({
    utr: z
      .string()
      .trim()
      .min(6, 'UTR/reference must be at least 6 characters')
      .max(40)
      .regex(/^[A-Za-z0-9]+$/, 'UTR/reference must be alphanumeric'),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const withdrawalIdParamSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export const withdrawalQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    status: inrWithdrawalStatus.optional(),
  })
  .strict();

const adminWithdrawalFilters = {
  status: inrWithdrawalStatus.optional(),
  userId: z.string().uuid().optional(),
  email: z.string().trim().min(1).max(255).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
};

export const adminWithdrawalQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    ...adminWithdrawalFilters,
  })
  .strict();

export type CreateWithdrawalDto = z.infer<typeof createWithdrawalSchema>;
export type RejectWithdrawalDto = z.infer<typeof rejectWithdrawalSchema>;
export type MarkPaidDto = z.infer<typeof markPaidSchema>;
export type WithdrawalQueryDto = z.infer<typeof withdrawalQuerySchema>;
export type AdminWithdrawalQueryDto = z.infer<typeof adminWithdrawalQuerySchema>;
