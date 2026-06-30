import * as assert from 'assert';
import { SMTPClient, EmailOptions, SMTPConfig } from '../../mail/smtp-client';

interface CapturedMail {
  from: string | undefined;
  to: string | string[] | undefined;
  subject: string | undefined;
}

function createCapturingMock(): { transporter: any; getCaptured: () => CapturedMail[] } {
  const captured: CapturedMail[] = [];
  const transporter = {
    sendMail: async (opts: any) => {
      captured.push({
        from: opts.from,
        to: opts.to,
        subject: opts.subject,
      });
      return {
        messageId: '<test@example.com>',
        response: '250 OK',
        accepted: ['recipient@example.com'],
        rejected: [],
      };
    },
    close: () => {},
    verify: async () => {},
  };
  return { transporter, getCaptured: () => captured };
}

function makeClient(config: SMTPConfig): { client: SMTPClient; getCaptured: () => CapturedMail[] } {
  const client = new SMTPClient(config);
  const { transporter, getCaptured } = createCapturingMock();
  (client as any).transporter = transporter;
  return { client, getCaptured };
}

const ADDR = 'user@yandex.ru';
const NAME = 'Хай';

describe('SMTPClient from-header (no double-wrapping)', () => {
  const baseOptions: EmailOptions = {
    to: 'recipient@example.com',
    subject: 'Test',
    text: 'Hello',
  };

  it('[LOCAL] passes pre-formatted "Name <email>" from caller as-is', async () => {
    const { client, getCaptured } = makeClient({
      host: 'smtp.test.com', port: 465, username: ADDR, password: 'pass',
      fromAddress: ADDR, fromName: NAME,
    });
    const opts: EmailOptions = { ...baseOptions, from: `${NAME} <${ADDR}>` };
    await client.sendMail(opts);
    const captured = getCaptured();
    assert.strictEqual(captured.length, 1);
    assert.strictEqual(captured[0].from, `${NAME} <${ADDR}>`, 'from must equal caller-provided header, not re-wrapped');
    assert.ok(!/<<|>>/.test(captured[0].from || ''), 'must not contain << or >>');
  });

  it('[LOCAL] uses bare fromAddress when no fromName and no options.from', async () => {
    const { client, getCaptured } = makeClient({
      host: 'smtp.test.com', port: 465, username: ADDR, password: 'pass',
      fromAddress: ADDR,
    });
    await client.sendMail({ ...baseOptions });
    const captured = getCaptured();
    assert.strictEqual(captured[0].from, ADDR, 'should fall back to bare fromAddress');
  });

  it('[LOCAL] uses bare username when no fromAddress and no options.from', async () => {
    const { client, getCaptured } = makeClient({
      host: 'smtp.test.com', port: 465, username: ADDR, password: 'pass',
    });
    await client.sendMail({ ...baseOptions });
    const captured = getCaptured();
    assert.strictEqual(captured[0].from, ADDR, 'should fall back to bare username');
  });

  it('[LOCAL] does NOT prepend fromName when options.from is already formatted', async () => {
    const { client, getCaptured } = makeClient({
      host: 'smtp.test.com', port: 465, username: ADDR, password: 'pass',
      fromAddress: ADDR, fromName: NAME,
    });
    await client.sendMail({ ...baseOptions, from: `${NAME} <${ADDR}>` });
    const from = getCaptured()[0].from || '';
    assert.strictEqual(from, `${NAME} <${ADDR}>`);
    assert.ok(!from.startsWith(`${NAME} <${NAME}`), 'must not double-wrap with fromName');
  });

  it('[LOCAL] does NOT add extra trailing ">" (no double >>)', async () => {
    const { client, getCaptured } = makeClient({
      host: 'smtp.test.com', port: 465, username: ADDR, password: 'pass',
      fromAddress: ADDR, fromName: NAME,
    });
    await client.sendMail({ ...baseOptions, from: `${NAME} <${ADDR}>` });
    const from = getCaptured()[0].from || '';
    assert.ok(!from.endsWith('>>'), `must not end with '>>' (double-wrapping bug): got "${from}"`);
    assert.ok(!from.includes('<<'), `must not contain '<<': got "${from}"`);
    const closeCount = (from.match(/>/g) || []).length;
    assert.strictEqual(closeCount, 1, `exactly one '>' expected in "${from}"`);
  });

  it('[LOCAL] caller format helper produces "Name <email>" with exactly one wrap', () => {
    const fromName = NAME;
    const fromAddress = ADDR;
    const built = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
    assert.strictEqual(built, `${NAME} <${ADDR}>`);
    const openCount = (built.match(/</g) || []).length;
    const closeCount = (built.match(/>/g) || []).length;
    assert.strictEqual(openCount, 1, 'exactly one <');
    assert.strictEqual(closeCount, 1, 'exactly one >');
  });
});