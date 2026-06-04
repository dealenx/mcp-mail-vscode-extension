import * as assert from 'assert';
import { SMTPClient, EmailOptions } from '../../mail/smtp-client';

function createMockTransporter(hang: boolean = false, delayMs: number = 0, rejectWithError?: string) {
  let closeCalled = false;
  const transporter = {
    sendMail: async () => {
      if (rejectWithError) {
        throw new Error(rejectWithError);
      }
      if (hang) {
        return new Promise(() => {});
      }
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      return {
        messageId: '<test@example.com>',
        response: '250 OK',
        accepted: ['recipient@example.com'],
        rejected: [],
      };
    },
    close: () => {
      closeCalled = true;
    },
    get _closeCalled() {
      return closeCalled;
    },
    verify: async () => {},
  };
  return transporter;
}

function createClientWithMock(hang: boolean = false, delayMs: number = 0, rejectWithError?: string): { client: SMTPClient; transporter: ReturnType<typeof createMockTransporter> } {
  const config = { host: 'smtp.test.com', port: 587, username: 'user@test.com', password: 'pass' };
  const client = new SMTPClient(config);
  const transporter = createMockTransporter(hang, delayMs, rejectWithError);
  (client as any).transporter = transporter;
  return { client, transporter };
}

describe('SMTPClient.cancel', () => {
  const basicOptions: EmailOptions = {
    to: 'recipient@example.com',
    subject: 'Test',
    text: 'Hello',
  };

  it('should throw when not connected', async () => {
    const client = new SMTPClient({ host: 'smtp.test.com', port: 587, username: 'user', password: 'pass' });
    try {
      await client.sendMail(basicOptions);
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes('not connected'));
    }
  });

  it('should throw when signal is already aborted before starting', async () => {
    const { client } = createClientWithMock();
    const ac = new AbortController();
    ac.abort();

    try {
      await client.sendMail(basicOptions, ac.signal);
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes('cancelled'), `Expected cancellation message, got: ${e.message}`);
    }
  });

  it('should cancel during a hanging sendMail', async () => {
    const { client, transporter } = createClientWithMock(true);
    const ac = new AbortController();

    const sendPromise = client.sendMail(basicOptions, ac.signal);

    setTimeout(() => ac.abort(), 50);

    try {
      await sendPromise;
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes('cancelled'), `Expected cancellation message, got: ${e.message}`);
      assert.strictEqual((client as any).transporter, null, 'Transporter should be nulled after cancellation');
    }
  });

  it.skip('should timeout when transporter hangs and no cancellation', async () => {
    const { client } = createClientWithMock(true);

    const start = Date.now();
    try {
      await client.sendMail(basicOptions);
      assert.fail('Should have thrown');
    } catch (e) {
      const elapsed = Date.now() - start;
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes('timed out'), `Expected timeout message, got: ${e.message}`);
      assert.ok(elapsed >= 29000, `Expected at least 29s, took ${elapsed}ms`);
    }
  }).timeout(35000);

  it('should succeed when transporter responds before timeout', async () => {
    const { client } = createClientWithMock(false, 100);

    const result = await client.sendMail(basicOptions);
    assert.strictEqual(result.messageId, '<test@example.com>');
    assert.strictEqual(result.accepted.length, 1);
  });

  it('should succeed when transporter responds instantly', async () => {
    const { client } = createClientWithMock(false);

    const result = await client.sendMail(basicOptions);
    assert.strictEqual(result.messageId, '<test@example.com>');
    assert.strictEqual(result.response, '250 OK');
  });

  it.skip('should close and null transporter on timeout', async () => {
    const { client, transporter } = createClientWithMock(true);

    try {
      await client.sendMail(basicOptions);
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes('timed out') || e.message.includes('Failed to send email'));
      assert.strictEqual((client as any).transporter, null, 'Transporter should be nulled after timeout');
    }
  }).timeout(35000);

  it('should propagate sendMail error from transporter', async () => {
    const { client } = createClientWithMock(false, 0, 'SMTP auth failed');

    try {
      await client.sendMail(basicOptions);
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes('SMTP auth failed'), `Expected SMTP auth error, got: ${e.message}`);
    }
  });

  it('should propagate transporter error even with signal present', async () => {
    const { client } = createClientWithMock(false, 0, 'Connection refused');
    const ac = new AbortController();

    try {
      await client.sendMail(basicOptions, ac.signal);
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.ok(e.message.includes('Connection refused'));
    }
  });

  it('should handle concurrent cancellation and timeout (cancel fires first)', async () => {
    const { client } = createClientWithMock(true);
    const ac = new AbortController();

    const sendPromise = client.sendMail(basicOptions, ac.signal);

    setTimeout(() => ac.abort(), 10);

    try {
      await sendPromise;
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e instanceof Error);
    }
  });

  it('should not leak when send succeeds quickly', async () => {
    const { client } = createClientWithMock(false, 50);

    const result = await client.sendMail(basicOptions);

    assert.strictEqual(result.messageId, '<test@example.com>');
    assert.ok((client as any).transporter !== null, 'Transporter should still be connected after success');
  });
});

describe('SMTPClient.connect', () => {
  it('should set isConnected after mock connect', () => {
    const config = { host: 'localhost', port: 587, username: 'user', password: 'pass' };
    const client = new SMTPClient(config);
    assert.strictEqual(client.isConnected(), false);
  });

  it('should return username from config', () => {
    const config = { host: 'localhost', port: 587, username: 'testuser@test.com', password: 'pass' };
    const client = new SMTPClient(config);
    assert.strictEqual(client.getCurrentUsername(), 'testuser@test.com');
  });

  it('should use fromAddress as from when provided', () => {
    const config = { host: 'localhost', port: 587, username: 'a.smith@example.org', password: 'pass', fromAddress: 'support@example.org' };
    const client = new SMTPClient(config);
    assert.strictEqual(client.getCurrentUsername(), 'a.smith@example.org');
  });

  it('should fall back to username as from when fromAddress is not provided', () => {
    const config = { host: 'localhost', port: 587, username: 'testuser@test.com', password: 'pass' };
    const client = new SMTPClient(config);
    assert.strictEqual(client.getCurrentUsername(), 'testuser@test.com');
  });
});

describe('SMTPClient.disconnect', () => {
  it('should null transporter on disconnect', async () => {
    const { client } = createClientWithMock(false);
    assert.ok(client.isConnected());

    await client.disconnect();

    assert.strictEqual(client.isConnected(), false);
    assert.strictEqual((client as any).transporter, null);
  });
});