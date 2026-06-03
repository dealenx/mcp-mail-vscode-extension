import { randomUUID } from 'crypto';
import { IMAPClient, SMTPClient } from './core';
import type { IMAPConfig, SMTPConfig } from './core';

interface SessionConnections {
  imap: IMAPClient | null;
  smtp: SMTPClient | null;
  lastActivity: number;
  imapConfig: IMAPConfig;
  smtpConfig: SMTPConfig;
}

const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS || String(30 * 60 * 1000), 10);
const sessions = new Map<string, SessionConnections>();

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions) {
      if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
        console.error(`[SessionManager] Session ${sessionId} expired, cleaning up`);
        cleanupSession(sessionId);
      }
    }
  }, 60 * 1000);
  if (cleanupInterval && typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    (cleanupInterval as NodeJS.Timeout).unref();
  }
}

function cleanupSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (session.imap) {
    session.imap.disconnect().catch((err) => {
      console.error(`[SessionManager] Error disconnecting IMAP for session ${sessionId}:`, err instanceof Error ? err.message : String(err));
    });
  }
  if (session.smtp) {
    session.smtp.disconnect().catch((err) => {
      console.error(`[SessionManager] Error disconnecting SMTP for session ${sessionId}:`, err instanceof Error ? err.message : String(err));
    });
  }
  sessions.delete(sessionId);
  console.error(`[SessionManager] Session ${sessionId} removed`);
}

startCleanup();

export function createSession(imapConfig: IMAPConfig, smtpConfig: SMTPConfig): string {
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    imap: null,
    smtp: null,
    lastActivity: Date.now(),
    imapConfig,
    smtpConfig,
  });
  console.error(`[SessionManager] Session created: ${sessionId}`);
  return sessionId;
}

export function getSession(sessionId: string): SessionConnections | undefined {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
  return session;
}

export function validateSession(sessionId: string): SessionConnections {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}. Please connect first.`);
  }
  session.lastActivity = Date.now();
  return session;
}

export async function getIMAPClient(sessionId: string): Promise<IMAPClient> {
  const session = validateSession(sessionId);
  if (!session.imap || !session.imap.isConnected()) {
    console.error(`[SessionManager] Creating new IMAP connection for session ${sessionId}`);
    session.imap = new IMAPClient(session.imapConfig);
    await session.imap.connect();
  }
  return session.imap;
}

export async function getSMTPClient(sessionId: string): Promise<SMTPClient> {
  const session = validateSession(sessionId);
  if (!session.smtp || !session.smtp.isConnected()) {
    console.error(`[SessionManager] Creating new SMTP connection for session ${sessionId}`);
    session.smtp = new SMTPClient(session.smtpConfig);
    await session.smtp.connect();
  }
  return session.smtp;
}

export function destroySession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  cleanupSession(sessionId);
  return true;
}

export function getSessionCount(): number {
  return sessions.size;
}