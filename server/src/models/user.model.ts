import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    displayName: { type: String, trim: true, maxlength: 60, default: null },
    /** bcrypt hash — excluded from queries unless explicitly selected. */
    passwordHash: { type: String, required: true, select: false },
    /**
     * Embedded in refresh tokens. Incrementing it (on logout) invalidates every
     * refresh token issued before, without storing sessions server-side.
     */
    tokenVersion: { type: Number, default: 0 },
    /** Set once the user clicks the link in the verification (or password-reset) email. */
    emailVerified: { type: Boolean, default: false },
    /** Auto-delete detections after this many days; null = keep until deleted. */
    retentionDays: { type: Number, min: 1, max: 3650, default: null },
  },
  { timestamps: true, versionKey: false },
);

/** Login lookup + uniqueness guarantee (enforced by MongoDB, not just application code). */
userSchema.index({ email: 1 }, { unique: true });

export type User = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };

export const UserModel = model('User', userSchema);
