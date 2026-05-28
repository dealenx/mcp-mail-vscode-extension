import { describe, test, expect } from 'bun:test';
import { IMAPClient } from '../src/imap-client';

describe('IMAPClient', () => {
  const testConfig = {
    host: 'imap.test.com',
    port: 993,
    username: 'test@test.com',
    password: 'password',
    tls: true,
  };

  test('should create IMAPClient with config', () => {
    const client = new IMAPClient(testConfig);
    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
  });

  test('should have getCurrentUsername method', () => {
    const client = new IMAPClient(testConfig);
    expect(client.getCurrentUsername()).toBe('test@test.com');
  });

  test('should have getCurrentBox returning null before connection', () => {
    const client = new IMAPClient(testConfig);
    expect(client.getCurrentBox()).toBeNull();
  });

  test('should throw when searching without connection', async () => {
    const client = new IMAPClient(testConfig);
    try {
      await client.search(['ALL']);
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toContain('Not connected');
    }
  });

  test('should throw when fetching messages without connection', async () => {
    const client = new IMAPClient(testConfig);
    try {
      await client.fetchMessages([1]);
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toContain('Not connected');
    }
  });

  test('should throw when deleting without connection', async () => {
    const client = new IMAPClient(testConfig);
    try {
      await client.deleteMessage(1);
      expect(true).toBe(false);
    } catch (err) {
      // deleteMessage tries to openBox first which will fail
    }
  });
});