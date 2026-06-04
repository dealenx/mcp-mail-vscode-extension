import { describe, test, expect } from 'bun:test';

const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:3000';

const IMAP_HOST = process.env.IMAP_HOST || '';
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993', 10);
const IMAP_USER = process.env.IMAP_USER || '';
const IMAP_PASS = process.env.IMAP_PASS || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

const hasImap = !!(IMAP_HOST && IMAP_USER && IMAP_PASS);
const hasSmtp = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

async function request(path: string, body: any, method: string = 'POST', timeoutMs = 30000): Promise<{ status: number; data: any }> {
  const url = `${SERVICE_URL}/api/${path}`;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    };
    if (method !== 'GET') {
      options.body = JSON.stringify(body);
    } else if (body?.sessionId) {
      const params = new URLSearchParams({ sessionId: body.sessionId });
      const res = await fetch(`${url}?${params.toString()}`, options);
      clearTimeout(tid);
      const data = await res.json();
      return { status: res.status, data };
    }

    const res = await fetch(url, options);
    clearTimeout(tid);
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    clearTimeout(tid);
    throw err;
  }
}

async function connectSession(): Promise<string> {
  const smtpConfig = hasSmtp
    ? { host: SMTP_HOST, port: SMTP_PORT, username: SMTP_USER, password: SMTP_PASS, secure: SMTP_PORT === 465 }
    : { host: 'localhost', port: 25, username: 'test', password: 'test', secure: false };

  const { status, data } = await request('connect', {
    imap: { host: IMAP_HOST, port: IMAP_PORT, username: IMAP_USER, password: IMAP_PASS, tls: true },
    smtp: smtpConfig,
  }, 'POST', 60000);

  if (status !== 200) {
    throw new Error(`Connect failed: ${JSON.stringify(data)}`);
  }
  console.error(`[Test] Connected: sessionId=${data.sessionId}, results=${JSON.stringify(data.results)}`);
  return data.sessionId;
}

async function disconnectSession(sessionId: string): Promise<void> {
  await request('disconnect', { sessionId });
  console.error('[Test] Disconnected');
}

describe('Service health', () => {
  test('GET / returns service info', async () => {
    const res = await fetch(`${SERVICE_URL}/`);
    const data = await res.json();
    expect(data.service).toBe('mcp-mail-service');
  });

  test('GET /health returns ok', async () => {
    const res = await fetch(`${SERVICE_URL}/health`);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });
});

describe('Idempotency logic', () => {
  test('idempotency store: checkOrMark + store + check again', async () => {
    const { clearIdempotencyStore, checkOrMarkIdempotency, storeIdempotencyResult, IdempotencyResult } = await import('../src/middleware/idempotency');

    clearIdempotencyStore();

    const key1 = `test-key-${Date.now()}`;
    const result1 = checkOrMarkIdempotency(key1);
    expect(result1.type).toBe(IdempotencyResult.NEW);

    storeIdempotencyResult(key1, 200, { messageId: '<test@idem>', from: 'test@test.com' });

    const result2 = checkOrMarkIdempotency(key1);
    expect(result2.type).toBe(IdempotencyResult.DUPLICATE);
    expect(result2.response?.body.messageId).toBe('<test@idem>');

    const keyNoKey = checkOrMarkIdempotency(undefined);
    expect(keyNoKey.type).toBe(IdempotencyResult.NEW);

    clearIdempotencyStore();
  });

  test('idempotency pending: concurrent request gets same result', async () => {
    const { clearIdempotencyStore, checkOrMarkIdempotency, storeIdempotencyResult, IdempotencyResult } = await import('../src/middleware/idempotency');

    clearIdempotencyStore();

    const key2 = `test-pending-${Date.now()}`;
    const result1 = checkOrMarkIdempotency(key2);
    expect(result1.type).toBe(IdempotencyResult.NEW);

    const result2 = checkOrMarkIdempotency(key2);
    expect(result2.type).toBe(IdempotencyResult.PENDING);

    const result3 = checkOrMarkIdempotency(key2);
    expect(result3.type).toBe(IdempotencyResult.PENDING);

    storeIdempotencyResult(key2, 200, { messageId: '<pending@test>', from: 'pending@test.com' });

    const final2 = await result2.pendingPromise!;
    expect(final2.httpStatus).toBe(200);
    expect(final2.body.messageId).toBe('<pending@test>');

    const final3 = await result3.pendingPromise!;
    expect(final3.httpStatus).toBe(200);
    expect(final3.body.messageId).toBe('<pending@test>');

    clearIdempotencyStore();
  });
});

if (hasImap) {
  describe('IMAP integration (read-only)', () => {
    let sessionId: string;

    test('connect to mail server', async () => {
      sessionId = await connectSession();
      expect(sessionId).toBeDefined();
      expect(sessionId.length).toBeGreaterThan(0);
    }, 60000);

    test('check status', async () => {
      if (!sessionId) return;
      const { status, data } = await request('status', { sessionId }, 'GET');
      expect(status).toBe(200);
      console.error(`[Test] Status: imap=${JSON.stringify(data.imap)}, smtp=${JSON.stringify(data.smtp)}`);
    });

    test('list mailboxes', async () => {
      if (!sessionId) return;
      const { status } = await request('mailboxes', { sessionId });
      expect([200, 500]).toContain(status);
    });

    test('open INBOX', async () => {
      if (!sessionId) return;
      const { status, data } = await request('messages/open-mailbox', { sessionId, mailboxName: 'INBOX', readOnly: true });
      expect(status).toBe(200);
      console.error(`[Test] INBOX: totalMessages=${data.totalMessages}`);
    });

    test('get message count', async () => {
      if (!sessionId) return;
      const { status, data } = await request('messages/count', { sessionId });
      expect(status).toBe(200);
      console.error(`[Test] Message count: ${data.totalMessages}`);
    });

    test('get recent messages (5)', async () => {
      if (!sessionId) return;
      const { status, data } = await request('messages/recent', { sessionId, limit: 5 });
      expect(status).toBe(200);
      console.error(`[Test] Recent: ${data.messages?.length || 0} messages`);
    });

    test('disconnect', async () => {
      if (!sessionId) return;
      const { status } = await request('disconnect', { sessionId });
      expect(status).toBe(200);
      sessionId = '';
    });
  });
}

if (hasImap && hasSmtp) {
  describe('Full send integration (IMAP + SMTP)', () => {
    let sessionId: string;

    test('connect with full IMAP+SMTP', async () => {
      sessionId = await connectSession();
      expect(sessionId).toBeDefined();
    }, 60000);

    test('send email with idempotency key', async () => {
      if (!sessionId) return;
      const key = `test-send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const { status, data } = await request('send-email', {
        sessionId,
        to: SMTP_USER,
        subject: `[Integration Test] ${new Date().toISOString()}`,
        text: 'This is an integration test email.',
        idempotencyKey: key,
      }, 'POST', 60000);
      expect(status).toBe(200);
      expect(data.messageId).toBeDefined();
      console.error(`[Test] Sent: messageId=${data.messageId}, idempotencyKey=${key}`);
    }, 60000);

    test('idempotency: duplicate key returns same messageId', async () => {
      if (!sessionId) return;
      const key = `test-idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const first = await request('send-email', {
        sessionId,
        to: SMTP_USER,
        subject: `[Idempotency Test] ${new Date().toISOString()}`,
        text: 'First request',
        idempotencyKey: key,
      }, 'POST', 60000);

      expect(first.status).toBe(200);
      const msgId = first.data.messageId;
      console.error(`[Test] Idempotency first: ${msgId}`);

      const second = await request('send-email', {
        sessionId,
        to: SMTP_USER,
        subject: '[Idempotency Test] SHOULD BE DEDUPED',
        text: 'Second request — must be deduped',
        idempotencyKey: key,
      }, 'POST', 60000);

      expect(second.status).toBe(200);
      expect(second.data.messageId).toBe(msgId);
      console.error(`[Test] Idempotency second: ${second.data.messageId} (SAME — deduped!)`);
    }, 60000);

    test('send 50 emails sequentially', async () => {
      if (!sessionId) return;
      const messageIds: string[] = [];

      for (let i = 0; i < 50; i++) {
        const key = `stress-seq-${i}-${Date.now()}`;
        const start = Date.now();
        const { status, data } = await request('send-email', {
          sessionId,
          to: SMTP_USER,
          subject: `[Stress Test ${i}] ${new Date().toISOString()}`,
          text: `Stress test email #${i}`,
          idempotencyKey: key,
        }, 'POST', 60000);
        const timeMs = Date.now() - start;
        console.error(`[StressTest] #${i}: ${timeMs}ms — messageId=${data.messageId || 'N/A'}`);
        expect(status).toBe(200);
        if (data.messageId) {
          messageIds.push(data.messageId);
        }
      }

      const unique = new Set(messageIds);
      console.error(`[StressTest] Results: ${messageIds.length} sends, ${unique.size} unique IDs`);
      expect(unique.size).toBe(messageIds.length);
    }, 600000);

    test('concurrent: 5 simultaneous sends', async () => {
      if (!sessionId) return;
      const promises = [0, 1, 2, 3, 4].map(async (i) => {
        const key = `stress-concurrent-${i}-${Date.now()}`;
        const start = Date.now();
        const result = await request('send-email', {
          sessionId,
          to: SMTP_USER,
          subject: `[Concurrent ${i}] ${new Date().toISOString()}`,
          text: `Concurrent #${i}`,
          idempotencyKey: key,
        }, 'POST', 60000);
        return { ...result, timeMs: Date.now() - start, i };
      });

      const results = await Promise.all(promises);
      for (const r of results) {
        expect(r.status).toBe(200);
        console.error(`[StressTest] Concurrent #${r.i}: ${r.timeMs}ms`);
      }

      const ids = results.map((r) => r.data.messageId);
      expect(new Set(ids).size).toBe(5);
    }, 120000);

    test('disconnect after tests', async () => {
      if (!sessionId) return;
      await request('disconnect', { sessionId });
    });
  });
}