import request from 'supertest';
import type { Express } from 'express';

export function detectionPayload(overrides: Record<string, unknown> = {}) {
  return {
    expression: 'happy',
    confidence: 0.91,
    detectedAt: new Date(Date.now() - 60_000).toISOString(),
    durationMs: 4200,
    ...overrides,
  };
}

/** Registers a user and returns a supertest agent that keeps its auth cookies. */
export async function signedInAgent(app: Express, email = 'user@example.com') {
  const agent = request.agent(app);
  await agent
    .post('/api/v1/auth/register')
    .send({ email, password: 'a-strong-password' })
    .expect(201);
  return agent;
}
