import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import app from '../src/index';

describe('Service API - Validation Tests (using Hono test)', () => {
  test('GET / should return service info', async () => {
    const req = new Request('http://localhost:3000/');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.service).toBe('mcp-mail-service');
    expect(data.version).toBe('0.1.0');
  });

  test('GET /health should return ok', async () => {
    const req = new Request('http://localhost:3000/health');
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  test('POST /api/connect with missing fields should return 400', async () => {
    const req = new Request('http://localhost:3000/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imap: { host: 'test' } }),
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid request');
  });

  test('POST /api/disconnect with missing sessionId should return 400', async () => {
    const req = new Request('http://localhost:3000/api/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid request');
  });

  test('POST /api/search/sender with missing fields should return 400', async () => {
    const req = new Request('http://localhost:3000/api/search/sender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'test' }),
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
  });

  test('POST /api/status with nonexistent session should return 404 or 500', async () => {
    const req = new Request('http://localhost:3000/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'nonexistent-session' }),
    });
    const res = await app.fetch(req);
    expect([404, 500]).toContain(res.status);
  });
});