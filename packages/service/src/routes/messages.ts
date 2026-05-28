import { Hono } from 'hono';
import { z } from 'zod';
import { validateSession, getIMAPClient } from '../session-manager';

export const messagesRouter = new Hono();

const getMessagesSchema = z.object({
  sessionId: z.string().min(1),
  uids: z.array(z.number().int().positive()),
  markSeen: z.boolean().optional().default(false),
});

const getMessageSchema = z.object({
  sessionId: z.string().min(1),
  uid: z.number().int().positive(),
  markSeen: z.boolean().optional().default(false),
});

const deleteMessageSchema = z.object({
  sessionId: z.string().min(1),
  uid: z.number().int().positive(),
});

const unseenSchema = z.object({
  sessionId: z.string().min(1),
  limit: z.number().int().positive().optional().default(50),
});

const recentSchema = z.object({
  sessionId: z.string().min(1),
  limit: z.number().int().positive().optional().default(50),
});

const countSchema = z.object({
  sessionId: z.string().min(1),
});

const openMailboxSchema = z.object({
  sessionId: z.string().min(1),
  mailboxName: z.string().optional().default('INBOX'),
  readOnly: z.boolean().optional().default(false),
});

messagesRouter.post('/list', async (c) => {
  console.error('[Messages] Get multiple messages');
  try {
    const body = await c.req.json();
    const parsed = getMessagesSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, uids, markSeen } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const messages = await imap.fetchMessages(uids, { markSeen });
    return c.json({ messages });
  } catch (err) {
    console.error('[Messages/List] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

messagesRouter.post('/get', async (c) => {
  console.error('[Messages] Get single message');
  try {
    const body = await c.req.json();
    const parsed = getMessageSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, uid, markSeen } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const message = await imap.getMessage(uid);
    if (markSeen && message) {
      try { await imap.fetchMessages([uid], { markSeen: true }); } catch {}
    }
    if (!message) {
      return c.json({ error: `Message with UID ${uid} not found` }, 404);
    }
    return c.json({ message });
  } catch (err) {
    console.error('[Messages/Get] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

messagesRouter.post('/delete', async (c) => {
  console.error('[Messages] Delete message');
  try {
    const body = await c.req.json();
    const parsed = deleteMessageSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, uid } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    await imap.deleteMessage(uid);
    return c.json({ success: true, deletedUid: uid });
  } catch (err) {
    console.error('[Messages/Delete] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

messagesRouter.post('/unseen', async (c) => {
  console.error('[Messages] Get unseen messages');
  try {
    const body = await c.req.json();
    const parsed = unseenSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, limit } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const messages = await imap.getUnseenMessages(limit);
    return c.json({ messages });
  } catch (err) {
    console.error('[Messages/Unseen] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

messagesRouter.post('/recent', async (c) => {
  console.error('[Messages] Get recent messages');
  try {
    const body = await c.req.json();
    const parsed = recentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, limit } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const messages = await imap.getRecentMessages(limit);
    return c.json({ messages });
  } catch (err) {
    console.error('[Messages/Recent] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

messagesRouter.post('/count', async (c) => {
  console.error('[Messages] Get message count');
  try {
    const body = await c.req.json();
    const parsed = countSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const total = await imap.getMessageCount();
    return c.json({ totalMessages: total });
  } catch (err) {
    console.error('[Messages/Count] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

messagesRouter.post('/open-mailbox', async (c) => {
  console.error('[Messages] Open mailbox');
  try {
    const body = await c.req.json();
    const parsed = openMailboxSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, mailboxName, readOnly } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const info = await imap.openBox(mailboxName, readOnly);
    return c.json({ mailbox: info });
  } catch (err) {
    console.error('[Messages/OpenMailbox] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});