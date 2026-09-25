import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { UserModel } from '../../src/models/user.model.js';
import { useTestDatabase } from '../helpers/testDatabase.js';

useTestDatabase();
const app = createApp();
const AUTH = '/api/v1/auth';
const credentials = { email: 'Ada@Example.com', password: 'correct horse battery' };

function cookieHeader(response: request.Response): string[] {
  const header = response.headers['set-cookie'];
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
}

describe('auth API', () => {
  it('registers a user, sets secure HttpOnly cookies and never returns secrets', async () => {
    const response = await request(app).post(`${AUTH}/register`).send(credentials).expect(201);

    expect(response.body.data.user).toEqual({
      id: expect.any(String),
      email: 'ada@example.com', // normalised
      displayName: null,
      emailVerified: false,
      retentionDays: null,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|token/i);

    const cookies = cookieHeader(response);
    expect(cookies.some((c) => c.startsWith('access_token=') && /HttpOnly/i.test(c))).toBe(true);
    expect(
      cookies.some((c) => c.startsWith('refresh_token=') && /Path=\/api\/v1\/auth/.test(c)),
    ).toBe(true);
    expect(cookies.every((c) => /SameSite=Strict/i.test(c))).toBe(true);
  });

  it('stores only a bcrypt hash of the password', async () => {
    await request(app).post(`${AUTH}/register`).send(credentials).expect(201);
    const user = await UserModel.findOne({ email: 'ada@example.com' })
      .select('+passwordHash')
      .lean();
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(user?.passwordHash).not.toContain(credentials.password);
  });

  it('rejects duplicate emails (case-insensitive) with 409', async () => {
    await request(app).post(`${AUTH}/register`).send(credentials).expect(201);
    const response = await request(app)
      .post(`${AUTH}/register`)
      .send({ ...credentials, email: 'ADA@example.com' })
      .expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it.each([
    ['a short password', { password: 'short' }],
    ['an invalid email', { email: 'not-an-email' }],
    ['a password longer than 72 bytes', { password: 'é'.repeat(40) }],
  ])('validates registration: %s', async (_label, override) => {
    await request(app)
      .post(`${AUTH}/register`)
      .send({ ...credentials, ...override })
      .expect(400);
  });

  it('logs in with valid credentials and returns the same generic error otherwise', async () => {
    await request(app).post(`${AUTH}/register`).send(credentials).expect(201);

    await request(app).post(`${AUTH}/login`).send(credentials).expect(200);
    const wrongPassword = await request(app)
      .post(`${AUTH}/login`)
      .send({ ...credentials, password: 'wrong password!' })
      .expect(401);
    const unknownUser = await request(app)
      .post(`${AUTH}/login`)
      .send({ ...credentials, email: 'nobody@example.com' })
      .expect(401);

    // Identical responses: the API does not reveal which accounts exist.
    expect(wrongPassword.body).toEqual(unknownUser.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('reports the current user via /me (null when anonymous)', async () => {
    expect((await request(app).get(`${AUTH}/me`).expect(200)).body.data.user).toBeNull();

    const agent = request.agent(app);
    await agent.post(`${AUTH}/register`).send(credentials).expect(201);
    const me = await agent.get(`${AUTH}/me`).expect(200);
    expect(me.body.data.user.email).toBe('ada@example.com');
  });

  it('refreshes the session with the refresh cookie', async () => {
    const agent = request.agent(app);
    await agent.post(`${AUTH}/register`).send(credentials).expect(201);
    const response = await agent.post(`${AUTH}/refresh`).expect(200);
    expect(response.body.data.user.email).toBe('ada@example.com');
  });

  it('rejects refresh without a cookie', async () => {
    const response = await request(app).post(`${AUTH}/refresh`).expect(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  it('logout revokes previously issued refresh tokens', async () => {
    const registration = await request(app).post(`${AUTH}/register`).send(credentials).expect(201);
    const refreshCookie = cookieHeader(registration)
      .find((c) => c.startsWith('refresh_token='))
      ?.split(';')[0];
    expect(refreshCookie).toBeDefined();

    await request(app)
      .post(`${AUTH}/logout`)
      .set('Cookie', refreshCookie ?? '')
      .expect(200);

    // A stolen copy of the old refresh token is now useless.
    const reuse = await request(app)
      .post(`${AUTH}/refresh`)
      .set('Cookie', refreshCookie ?? '')
      .expect(401);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');
  });

  it('does not accept a refresh token as an access token', async () => {
    const registration = await request(app).post(`${AUTH}/register`).send(credentials).expect(201);
    const refreshValue = cookieHeader(registration)
      .find((c) => c.startsWith('refresh_token='))
      ?.split(';')[0]
      ?.split('=')[1];

    await request(app).get(`${AUTH}/me`).set('Cookie', `access_token=${refreshValue}`).expect(401);
  });
});
