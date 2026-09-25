import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { liveUpdates } from '../../src/services/liveUpdates.js';
import { detectionPayload } from '../helpers/factories.js';
import { useTestDatabase } from '../helpers/testDatabase.js';

useTestDatabase();
const app = createApp();
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await liveUpdates.start();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await liveUpdates.stop();
  await new Promise((resolve) => server.close(resolve));
});

/** Opens an event stream and collects the events it receives. */
async function openStream(cookie?: string) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/v1/expressions/events`, {
    headers: cookie ? { cookie } : {},
    signal: controller.signal,
  });
  const events: Array<{ type: string; data: { expression: string } }> = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const type = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (type && data) events.push({ type, data: JSON.parse(data) });
        }
      }
    } catch {
      // aborted
    }
  })();
  // No wait needed: the server subscribes synchronously right after sending the
  // headers, so by the time fetch() resolves the subscription already exists.
  return { response, events, close: () => controller.abort() };
}

async function register(email: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'a-strong-password' })
    .expect(201);
  const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

describe('GET /api/v1/expressions/events (Server-Sent Events)', () => {
  it('streams text/event-stream without buffering headers', async () => {
    const stream = await openStream();
    expect(stream.response.headers.get('content-type')).toContain('text/event-stream');
    expect(stream.response.headers.get('x-accel-buffering')).toBe('no');
    expect(stream.response.headers.get('content-encoding')).toBeNull();
    stream.close();
  });

  it('delivers a saved detection only to its owner', async () => {
    const aliceCookie = await register('alice@example.com');
    const bobCookie = await register('bob@example.com');
    const alice = await openStream(aliceCookie);
    const bob = await openStream(bobCookie);
    const anonymous = await openStream();
    await expect.poll(() => liveUpdates.subscriberCount).toBe(3);

    await request(app)
      .post('/api/v1/expressions')
      .set('Cookie', aliceCookie)
      .send(detectionPayload({ expression: 'surprised' }))
      .expect(201);

    await expect.poll(() => alice.events.length, { timeout: 5000 }).toBe(1);
    expect(alice.events[0]).toMatchObject({
      type: 'detection.created',
      data: { expression: 'surprised' },
    });
    // Give any wrongly-routed event time to arrive before asserting its absence.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(bob.events).toHaveLength(0);
    expect(anonymous.events).toHaveLength(0);

    for (const stream of [alice, bob, anonymous]) stream.close();
    await expect.poll(() => liveUpdates.subscriberCount).toBe(0);
  });

  it('delivers anonymous detections to anonymous listeners', async () => {
    const anonymous = await openStream();
    await request(app).post('/api/v1/expressions').send(detectionPayload()).expect(201);
    await expect.poll(() => anonymous.events.length, { timeout: 5000 }).toBe(1);
    anonymous.close();
  });
});
