import { Hono } from 'hono';
import { z } from 'zod';
import { validateSession, getIMAPClient } from '../session-manager';

export const attachmentsRouter = new Hono();

const getAttachmentsSchema = z.object({
  sessionId: z.string().min(1),
  uid: z.number().int().positive(),
});

const saveAttachmentSchema = z.object({
  sessionId: z.string().min(1),
  uid: z.number().int().positive(),
  attachmentIndex: z.number().int().min(0).optional(),
  returnBase64: z.boolean().optional().default(false),
});

attachmentsRouter.post('/meta', async (c) => {
  console.error('[Attachments] Get attachment metadata');
  try {
    const body = await c.req.json();
    const parsed = getAttachmentsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, uid } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const message = await imap.getMessage(uid);
    if (!message) {
      return c.json({ error: `Message with UID ${uid} not found` }, 404);
    }
    return c.json({
      uid,
      attachmentCount: message.attachments?.length || 0,
      attachments: message.attachments || [],
    });
  } catch (err) {
    console.error('[Attachments/Meta] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

attachmentsRouter.post('/save', async (c) => {
  console.error('[Attachments] Save attachment');
  try {
    const body = await c.req.json();
    const parsed = saveAttachmentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, uid, attachmentIndex, returnBase64 } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const allAttachments = await imap.fetchMessageAttachments(uid);
    if (allAttachments.length === 0) {
      return c.json({ uid, note: 'This email has no attachments.' });
    }

    const toSave = attachmentIndex !== undefined ? [allAttachments[attachmentIndex]] : allAttachments;
    const results: Array<{ filename: string; size: number; base64?: string }> = [];

    for (const att of toSave) {
      if (returnBase64) {
        results.push({
          filename: att.filename,
          size: att.size,
          base64: att.content.toString('base64'),
        });
      } else {
        results.push({
          filename: att.filename,
          size: att.size,
          base64: att.content.toString('base64'),
        });
      }
    }

    return c.json({ uid, savedCount: results.length, files: results });
  } catch (err) {
    console.error('[Attachments/Save] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});