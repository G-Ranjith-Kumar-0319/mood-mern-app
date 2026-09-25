import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AuthTokenModel } from '../../src/models/authToken.model.js';
import { ExpressionDetectionModel } from '../../src/models/expressionDetection.model.js';
import { UserModel } from '../../src/models/user.model.js';
import { sentEmails } from '../../src/services/mailer.js';
import { detectionPayload, signedInAgent } from '../helpers/factories.js';
import { useTestDatabase } from '../helpers/testDatabase.js';

useTestDatabase();
const app = createApp();
const PASSWORD = 'a-strong-password';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The token from the most recent email's link. */
function lastEmailToken(): string {
  const text = sentEmails.at(-1)?.text ?? '';
  const match = /token=([\w-]+)/.exec(text);
  if (!match?.[1]) throw new Error(`No token link in email: ${text}`);
  return match[1];
}

beforeEach(() => {
  sentEmails.length = 0;
});

describe('account endpoints require authentication', () => {
  it.each([
    ['get', '/api/v1/account'],
    ['get', '/api/v1/account/export'],
    ['patch', '/api/v1/account/settings'],
    ['post', '/api/v1/account/password'],
    ['delete', '/api/v1/account'],
  ] as const)('%s %s → 401', async (method, path) => {
    await request(app)[method](path).expect(401);
  });
});

describe('data retention', () => {
  it('sets expiresAt on new and existing detections, and removes it again', async () => {
    const agent = await signedInAgent(app);
    const detectedAt = '2025-01-01T00:00:00.000Z';
    await agent.post('/api/v1/expressions').send(detectionPayload({ detectedAt })).expect(201);

    const updated = await agent
      .patch('/api/v1/account/settings')
      .send({ retentionDays: 30 })
      .expect(200);
    expect(updated.body.data.user.retentionDays).toBe(30);

    // Existing document follows the new policy (computed server-side with $dateAdd).
    const existing = await ExpressionDetectionModel.findOne().lean();
    expect(existing?.expiresAt?.toISOString()).toBe(
      new Date(Date.parse(detectedAt) + 30 * DAY_MS).toISOString(),
    );

    // New documents get an expiry at insert time.
    await agent.post('/api/v1/expressions').send(detectionPayload()).expect(201);
    expect(await ExpressionDetectionModel.countDocuments({ expiresAt: { $ne: null } })).toBe(2);

    await agent.patch('/api/v1/account/settings').send({ retentionDays: null }).expect(200);
    expect(await ExpressionDetectionModel.countDocuments({ expiresAt: null })).toBe(2);
  });

  it('expires anonymous detections after the default period', async () => {
    const detectedAt = new Date(Date.now() - 60_000);
    await request(app)
      .post('/api/v1/expressions')
      .send(detectionPayload({ detectedAt: detectedAt.toISOString() }))
      .expect(201);
    const document = await ExpressionDetectionModel.findOne().lean();
    expect(document?.expiresAt?.getTime()).toBe(detectedAt.getTime() + 30 * DAY_MS);
  });

  it('only accepts the offered retention periods', async () => {
    const agent = await signedInAgent(app);
    await agent.patch('/api/v1/account/settings').send({ retentionDays: 12 }).expect(400);
  });

  it('has a TTL index on expiresAt', async () => {
    const indexes = await ExpressionDetectionModel.collection.indexes();
    expect(indexes.find((index) => index.name === 'expiresAt_1')?.expireAfterSeconds).toBe(0);
  });
});

describe('export', () => {
  it('downloads every detection of the user as JSON — and nobody else’s', async () => {
    const agent = await signedInAgent(app, 'alice@example.com');
    const other = await signedInAgent(app, 'bob@example.com');
    await agent.post('/api/v1/expressions').send(detectionPayload({ expression: 'happy' }));
    await agent.post('/api/v1/expressions').send(detectionPayload({ expression: 'sad' }));
    await other.post('/api/v1/expressions').send(detectionPayload({ expression: 'angry' }));

    const response = await agent.get('/api/v1/account/export').expect(200);
    expect(response.headers['content-disposition']).toMatch(/attachment; filename=".+\.json"/);
    const body = JSON.parse(response.text);
    expect(body.format).toBe('expression-detector-export/v1');
    expect(body.account.email).toBe('alice@example.com');
    expect(body.detections.map((d: { expression: string }) => d.expression).sort()).toEqual([
      'happy',
      'sad',
    ]);
    expect(response.text).not.toMatch(/passwordHash|tokenVersion|userId/);
  });
});

describe('change password', () => {
  it('requires the current password, then signs out other sessions', async () => {
    const agent = await signedInAgent(app);
    const otherDevice = request.agent(app);
    await otherDevice
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: PASSWORD })
      .expect(200);

    await agent
      .post('/api/v1/account/password')
      .send({ currentPassword: 'wrong-password', newPassword: 'another-password' })
      .expect(401);
    await agent
      .post('/api/v1/account/password')
      .send({ currentPassword: PASSWORD, newPassword: 'another-password' })
      .expect(200);

    // This device keeps working with its fresh cookies…
    await agent.post('/api/v1/auth/refresh').expect(200);
    // …the other device's refresh token was revoked.
    await otherDevice.post('/api/v1/auth/refresh').expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'another-password' })
      .expect(200);
  });
});

describe('delete account', () => {
  it('requires the password and removes the user with all their data', async () => {
    const agent = await signedInAgent(app);
    await agent.post('/api/v1/expressions').send(detectionPayload()).expect(201);
    await request(app).post('/api/v1/expressions').send(detectionPayload()).expect(201); // anonymous

    await agent.delete('/api/v1/account').send({ password: 'nope' }).expect(401);
    const response = await agent.delete('/api/v1/account').send({ password: PASSWORD }).expect(200);

    expect(response.body.data).toEqual({ deleted: true, deletedDetections: 1 });
    expect(await UserModel.countDocuments()).toBe(0);
    expect(await AuthTokenModel.countDocuments()).toBe(0);
    // Other people's (here: anonymous) data is untouched.
    expect(await ExpressionDetectionModel.countDocuments()).toBe(1);
    await agent.get('/api/v1/account').expect(401);
  });
});

describe('email verification', () => {
  it('sends a link on registration and verifies with it (once)', async () => {
    const agent = await signedInAgent(app);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]?.to).toBe('user@example.com');
    expect(sentEmails[0]?.text).toContain('http://localhost:5173/verify-email?token=');

    const token = lastEmailToken();
    expect((await agent.get('/api/v1/auth/me')).body.data.user.emailVerified).toBe(false);
    await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);
    expect((await agent.get('/api/v1/auth/me')).body.data.user.emailVerified).toBe(true);

    const reused = await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(400);
    expect(reused.body.error.code).toBe('INVALID_LINK');
  });

  it('stores only a hash of the token', async () => {
    await signedInAgent(app);
    const token = lastEmailToken();
    const stored = await AuthTokenModel.findOne().lean();
    expect(stored?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.tokenHash).not.toBe(token);
  });

  it('can re-send, which invalidates the previous link', async () => {
    const agent = await signedInAgent(app);
    const first = lastEmailToken();
    await agent.post('/api/v1/auth/verify-email/request').expect(200);
    const second = lastEmailToken();
    expect(second).not.toBe(first);
    await request(app).post('/api/v1/auth/verify-email').send({ token: first }).expect(400);
    await request(app).post('/api/v1/auth/verify-email').send({ token: second }).expect(200);
  });
});

describe('password reset', () => {
  it('responds identically for unknown emails and sends nothing', async () => {
    const response = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'nobody@example.com' })
      .expect(200);
    expect(response.body.data).toEqual({ sent: true });
    expect(sentEmails).toHaveLength(0);
  });

  it('resets the password with the emailed link and signs out old sessions', async () => {
    const oldSession = await signedInAgent(app);
    sentEmails.length = 0;
    await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'USER@example.com' })
      .expect(200);
    expect(sentEmails[0]?.subject).toBe('Reset your password');

    const reset = await request(app)
      .post('/api/v1/auth/password-reset')
      .send({ token: lastEmailToken(), password: 'brand-new-password' })
      .expect(200);
    expect(reset.body.data.user.emailVerified).toBe(true); // the inbox was proven

    await oldSession.post('/api/v1/auth/refresh').expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'brand-new-password' })
      .expect(200);
  });

  it('rejects invalid tokens and weak passwords', async () => {
    const invalid = await request(app)
      .post('/api/v1/auth/password-reset')
      .send({ token: 'x'.repeat(43), password: 'brand-new-password' })
      .expect(400);
    expect(invalid.body.error.code).toBe('INVALID_LINK');
    await request(app)
      .post('/api/v1/auth/password-reset')
      .send({ token: 'x'.repeat(43), password: 'short' })
      .expect(400);
  });
});
