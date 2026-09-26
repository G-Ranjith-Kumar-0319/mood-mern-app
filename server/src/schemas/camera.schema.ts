import { z } from 'zod';

/** Matches the ids the server issues (base64url); anything else is rejected before verification. */
export const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const handshakeAuthSchema = z.object({
  sessionId: sessionIdSchema,
  token: z.string().min(1).max(2048),
});

/** SDP for one video track is a few KB; the cap stops abuse of the relay. */
const MAX_SDP_LENGTH = 20_000;
const MAX_CANDIDATE_LENGTH = 1024;

export const sessionDescriptionSchema = z.strictObject({
  sdp: z.string().min(1).max(MAX_SDP_LENGTH),
});

export const iceCandidateSchema = z.strictObject({
  candidate: z.strictObject({
    // An empty string means "end of candidates".
    candidate: z.string().max(MAX_CANDIDATE_LENGTH),
    sdpMid: z.string().max(64).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  }),
});

export type SessionDescriptionPayload = z.infer<typeof sessionDescriptionSchema>;
export type IceCandidatePayload = z.infer<typeof iceCandidateSchema>;
