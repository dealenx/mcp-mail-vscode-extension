import { Hono } from 'hono';
import { z } from 'zod';
import { validateSession, getIMAPClient } from '../session-manager';

export const mailboxesRouter = new Hono();

const mailboxesSchema = z.object({
  sessionId: z.string().min(1),
});

mailboxesRouter.post('/', async (c) => {
  console.error('[Mailboxes] Listing mailboxes');
  try {
    const body = await c.req.json();
    const parsed = mailboxesSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const boxes = await imap.getBoxes();
    return c.json({ mailboxes: boxes });
  } catch (err) {
    console.error('[Mailboxes] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});