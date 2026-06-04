import { describe, test, expect } from 'bun:test';
import type {
  IMAPConfig,
  SMTPConfig,
  MailConfig,
  EmailOptions,
  EmailResult,
  EmailMessage,
  AttachmentMeta,
  AttachmentData,
  MailboxInfo,
  SearchResult,
  SendMode,
} from '../src/types';

describe('Types', () => {
  test('IMAPConfig should have required fields', () => {
    const config: IMAPConfig = {
      host: 'imap.example.com',
      port: 993,
      username: 'user@example.com',
      password: 'secret',
      tls: true,
    };
    expect(config.host).toBe('imap.example.com');
    expect(config.port).toBe(993);
    expect(config.tls).toBe(true);
  });

  test('SMTPConfig should have required fields', () => {
    const config: SMTPConfig = {
      host: 'smtp.example.com',
      port: 465,
      username: 'user@example.com',
      password: 'secret',
      secure: true,
    };
    expect(config.host).toBe('smtp.example.com');
    expect(config.port).toBe(465);
    expect(config.secure).toBe(true);
  });

  test('SMTPConfig should support optional fromAddress', () => {
    const config: SMTPConfig = {
      host: 'smtp.example.com',
      port: 465,
      username: 'a.smith@example.org',
      password: 'secret',
      secure: true,
      fromAddress: 'support@example.org',
    };
    expect(config.fromAddress).toBe('support@example.org');
  });

  test('SMTPConfig without fromAddress falls back to username', () => {
    const config: SMTPConfig = {
      host: 'smtp.example.com',
      port: 465,
      username: 'user@example.com',
      password: 'secret',
      secure: true,
    };
    expect(config.fromAddress).toBeUndefined();
  });

  test('MailConfig should combine IMAP and SMTP configs', () => {
    const config: MailConfig = {
      IMAP: {
        host: 'imap.example.com',
        port: 993,
        username: 'user@example.com',
        password: 'secret',
        tls: true,
      },
      SMTP: {
        host: 'smtp.example.com',
        port: 465,
        username: 'user@example.com',
        password: 'secret',
        secure: true,
        fromAddress: 'user@example.com',
      },
    };
    expect(config.IMAP.host).toBe('imap.example.com');
    expect(config.SMTP.host).toBe('smtp.example.com');
    expect(config.SMTP.fromAddress).toBe('user@example.com');
  });

  test('MailConfig should support shared mailbox pattern', () => {
    const config: MailConfig = {
      IMAP: {
        host: 'imap.yandex.ru',
        port: 993,
        username: 'example.org/a.smith/support',
        password: 'secret',
        tls: true,
      },
      SMTP: {
        host: 'smtp.yandex.ru',
        port: 465,
        username: 'a.smith@example.org',
        password: 'secret',
        secure: true,
        fromAddress: 'support@example.org',
      },
    };
    expect(config.IMAP.username).toBe('example.org/a.smith/support');
    expect(config.SMTP.username).toBe('a.smith@example.org');
    expect(config.SMTP.fromAddress).toBe('support@example.org');
  });

  test('EmailOptions should support all fields', () => {
    const options: EmailOptions = {
      to: 'recipient@example.com',
      subject: 'Test',
      text: 'Hello',
      html: '<p>Hello</p>',
      cc: 'cc@example.com',
      bcc: 'bcc@example.com',
      from: 'sender@example.com',
      attachments: [{ filename: 'test.txt', content: Buffer.from('test') }],
    };
    expect(options.to).toBe('recipient@example.com');
    expect(options.attachments?.length).toBe(1);
  });

  test('EmailResult should have messageId', () => {
    const result: EmailResult = {
      messageId: '<123@example.com>',
      response: '250 OK',
      accepted: ['recipient@example.com'],
      rejected: [],
    };
    expect(result.messageId).toBe('<123@example.com>');
    expect(result.accepted.length).toBe(1);
  });

  test('SendMode should support local and remote', () => {
    const local: SendMode = { mode: 'local', remoteUrl: '' };
    const remote: SendMode = { mode: 'remote', remoteUrl: 'https://smtp-service.mimikkai.ru' };
    expect(local.mode).toBe('local');
    expect(remote.mode).toBe('remote');
  });

  test('EmailMessage should have all fields', () => {
    const msg: EmailMessage = {
      uid: 1,
      id: 1,
      flags: ['\\Seen'],
      date: '2024-01-01T00:00:00.000Z',
      size: 1024,
      subject: 'Test',
      from: 'sender@example.com',
      to: 'recipient@example.com',
      text: 'Test body',
    };
    expect(msg.uid).toBe(1);
    expect(msg.subject).toBe('Test');
  });
});
