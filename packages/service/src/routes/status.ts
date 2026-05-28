import { Hono } from 'hono';
import { z } from 'zod';
import { validateSession } from '../session-manager';

export const statusRouter = new Hono();

const statusSchema = z.object({
  sessionId: z.string().min(1),
});

statusRouter.get('/', async (c) => {
  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json({ error: 'sessionId query parameter is required' }, 400);
  }
  console.error(`[Status] Checking status for session ${sessionId}`);
  try {
    const session = validateSession(sessionId);
    return c.json({
      imap: {
        connected: !!session.imap && session.imap.isConnected(),
        server: `${session.imapConfig.host}:${session.imapConfig.port}`,
      },
      smtp: {
        connected: !!session.smtp && session.smtp.isConnected(),
        server: `${session.smtpConfig.host}:${session.smtpConfig.port}`,
      },
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
  }
});

statusRouter.post('/', async (c) => {
  console.error('[Status] Checking status (POST)');
  try {
    const body = await c.req.json();
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId } = parsed.data;
    const session = validateSession(sessionId);
    return c.json({
      imap: {
        connected: !!session.imap && session.imap.isConnected(),
        server: `${session.imapConfig.host}:${session.imapConfig.port}`,
      },
      smtp: {
        connected: !!session.smtp && session.smtp.isConnected(),
        server: `${session.smtpConfig.host}:${session.smtpConfig.port}`,
      },
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 404);
  }
});