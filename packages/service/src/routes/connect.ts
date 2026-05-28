import { Hono } from 'hono';
import { z } from 'zod';
import { createSession, getIMAPClient, getSMTPClient } from '../session-manager';

export const connectRouter = new Hono();

const connectSchema = z.object({
  imap: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string().min(1),
    tls: z.boolean().optional().default(true),
  }),
  smtp: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    username: z.string().min(1),
    password: z.string().min(1),
    secure: z.boolean().optional().default(true),
  }),
});

connectRouter.post('/', async (c) => {
  console.error('[Connect] Incoming connect request');
  try {
    const body = await c.req.json();
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      console.error('[Connect] Validation error:', parsed.error.errors);
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }

    const { imap: imapConfig, smtp: smtpConfig } = parsed.data;
    const sessionId = createSession(imapConfig, smtpConfig);

    const results: string[] = [];

    try {
      const imap = await getIMAPClient(sessionId);
      results.push(`IMAP: Connected to ${imapConfig.host}:${imapConfig.port}`);
    } catch (err) {
      results.push(`IMAP: Failed - ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const smtp = await getSMTPClient(sessionId);
      results.push(`SMTP: Connected to ${smtpConfig.host}:${smtpConfig.port}`);
    } catch (err) {
      results.push(`SMTP: Failed - ${err instanceof Error ? err.message : String(err)}`);
    }

    console.error(`[Connect] Session ${sessionId} established`);
    return c.json({ sessionId, results });
  } catch (err) {
    console.error('[Connect] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});