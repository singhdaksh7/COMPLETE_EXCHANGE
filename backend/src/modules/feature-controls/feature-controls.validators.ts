import { z } from 'zod';
import { ALL_CONTROL_FLAGS } from './feature-controls.types';

export const userIdParamSchema = z.object({ userId: z.string().uuid() }).strict();

// Build a {flag: boolean optional} shape from the canonical flag list so the
// validator can never drift from the model.
const flagShape = Object.fromEntries(
  ALL_CONTROL_FLAGS.map((f) => [f, z.boolean().optional()]),
) as Record<(typeof ALL_CONTROL_FLAGS)[number], z.ZodOptional<z.ZodBoolean>>;

export const updateControlsSchema = z
  .object({
    ...flagShape,
    // A non-empty reason/note is REQUIRED before any control change is saved.
    reason: z.string().trim().min(3).max(2000),
  })
  .strict()
  .refine(
    (v) => ALL_CONTROL_FLAGS.some((f) => v[f] !== undefined),
    { message: 'At least one control flag must be provided' },
  );

export type UpdateControlsDto = z.infer<typeof updateControlsSchema>;
