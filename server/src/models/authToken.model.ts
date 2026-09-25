import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

export const AUTH_TOKEN_TYPES = ['verify-email', 'reset-password'] as const;
export type AuthTokenType = (typeof AUTH_TOKEN_TYPES)[number];

/**
 * One-time tokens sent by email. Only a SHA-256 hash is stored, so a database
 * leak does not reveal usable links. Expired tokens are removed by a TTL index.
 */
const authTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: AUTH_TOKEN_TYPES, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

/** Lookup when a link is clicked. */
authTokenSchema.index({ tokenHash: 1 }, { unique: true });
/** Invalidate a user's previous tokens of a type when a new one is issued. */
authTokenSchema.index({ userId: 1, type: 1 });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthToken = InferSchemaType<typeof authTokenSchema> & { _id: Types.ObjectId };

export const AuthTokenModel = model('AuthToken', authTokenSchema);
