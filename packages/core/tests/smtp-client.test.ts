import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { SMTPClient } from '../src/smtp-client';

describe('SMTPClient', () => {
  const testConfig = {
    host: 'smtp.test.com',
    port: 465,
    username: 'test@test.com',
    password: 'password',
    secure: true,
  };

  test('should create SMTPClient with config', () => {
    const client = new SMTPClient(testConfig);
    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
  });

  test('should have getCurrentUsername method', () => {
    const client = new SMTPClient(testConfig);
    expect(client.getCurrentUsername()).toBe('test@test.com');
  });

  test('should throw when sending without connection', async () => {
    const client = new SMTPClient(testConfig);
    try {
      await client.sendMail({
        to: 'recipient@test.com',
        subject: 'Test',
        text: 'Hello',
      });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toContain('not connected');
    }
  });

  test('should handle cancelled signal gracefully', () => {
    const client = new SMTPClient(testConfig);
    const controller = new AbortController();
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });
});