import { z } from 'zod';
import { newPassword } from './auth.schema.js';

/** Offered retention periods (days). `null` keeps detections until deleted. */
export const RETENTION_OPTIONS = [7, 30, 90, 365] as const;

export const updateSettingsSchema = z.strictObject({
  retentionDays: z.union([z.literal(RETENTION_OPTIONS), z.null()]),
});

export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1).max(256),
    newPassword,
  })
  .refine((body) => body.currentPassword !== body.newPassword, {
    message: 'The new password must be different',
    path: ['newPassword'],
  });

export const deleteAccountSchema = z.strictObject({
  /** Re-entering the password protects against a hijacked session or a mis-click. */
  password: z.string().min(1).max(256),
});

export type UpdateSettingsInput = z.output<typeof updateSettingsSchema>;
export type ChangePasswordInput = z.output<typeof changePasswordSchema>;
