import { Hono } from 'hono';
import { z } from 'zod';
import { validateSession, getIMAPClient, getSMTPClient } from '../session-manager';

export const disconnectRouter = new Hono();

const disconnectSchema = z.object({
  sessionId: z.string().min(1),
});

disconnectRouter.post('/', async (c) => {
  console.error('[Disconnect] Incoming disconnect request');
  try {
    const body = await c.req.json();
    const parsed = disconnectSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }

    const { sessionId } = parsed.data;
    const session = validateSession(sessionId);
    const results: string[] = [];

    if (session.imap) {
      try {
        await session.imap.disconnect();
        session.imap = null;
        results.push('IMAP: Disconnected');
      } catch (err) {
        results.push(`IMAP: Disconnect error - ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      results.push('IMAP: Not connected');
    }

    if (session.smtp) {
      try {
        await session.smtp.disconnect();
        session.smtp = null;
        results.push('SMTP: Disconnected');
      } catch (err) {
        results.push(`SMTP: Disconnect error - ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      results.push('SMTP: Not connected');
    }

    console.error(`[Disconnect] Session ${sessionId} disconnected`);
    return c.json({ success: true, results });
  } catch (err) {
    console.error('[Disconnect] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});