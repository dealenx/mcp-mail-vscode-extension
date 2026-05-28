import { Hono } from 'hono';
import { z } from 'zod';
import { validateSession, getIMAPClient, getSMTPClient } from '../session-manager';
import { findSentMailbox, buildRawEmailMessage } from './send-email';

export const replyEmailRouter = new Hono();

const replyEmailSchema = z.object({
  sessionId: z.string().min(1),
  originalUid: z.number().int().positive(),
  text: z.string().optional(),
  html: z.string().optional(),
  replyToAll: z.boolean().optional().default(false),
  includeOriginal: z.boolean().optional().default(true),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(),
    contentType: z.string().optional(),
  })).optional(),
});

replyEmailRouter.post('/', async (c) => {
  console.error('[ReplyEmail] Incoming reply email request');
  try {
    const body = await c.req.json();
    const parsed = replyEmailSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }

    const { sessionId, originalUid, text, html, replyToAll, includeOriginal, attachments } = parsed.data;

    if (!text && !html) {
      return c.json({ error: 'Either text or html content is required' }, 400);
    }

    const imap = await getIMAPClient(sessionId);
    const smtp = await getSMTPClient(sessionId);
    const session = validateSession(sessionId);

    const original = await imap.getMessage(originalUid);
    if (!original) {
      return c.json({ error: `Original message with UID ${originalUid} not found` }, 404);
    }

    const extractEmail = (addr: any): string | null => {
      if (!addr) return null;
      if (typeof addr === 'string') {
        const match = addr.match(/<([^>]+)>/) || addr.match(/([^\s<>]+@[^\s<>]+)/);
        return match ? match[1] : addr;
      }
      return null;
    };

    const originalFrom = extractEmail(original.from);
    if (!originalFrom) {
      return c.json({ error: 'Could not extract sender email from original message' }, 400);
    }

    let toRecipients: string[] = [originalFrom];
    let ccRecipients: string[] = [];

    if (replyToAll) {
      const originalTo = (original.to || '').split(',').map((e: string) => e.trim()).filter(Boolean);
      const originalCc = (original.cc || '').split(',').map((e: string) => e.trim()).filter(Boolean);
      const filtered = [...originalTo, ...originalCc].filter(
        (email: string) => email !== session.imapConfig.username && email !== originalFrom
      );
      if (filtered.length > 0) ccRecipients = filtered;
    }

    const replySubject = `Re: ${original.subject || ''}`;
    let finalText = text || '';
    let finalHtml = html || '';

    if (includeOriginal) {
      const originalDate = original.date ? new Date(original.date).toLocaleString() : 'Unknown Date';
      const quotedText = `On ${originalDate}, ${original.from || 'Unknown Sender'} wrote:\n${(original.text || '').split('\n').map((line: string) => `> ${line}`).join('\n')}`;
      finalText = `${text || ''}\n\n${quotedText}`;

      if (html || original.html) {
        const quotedHtml = `<div style="border-left: 3px solid #ccc; padding-left: 10px; margin-left: 10px; color: #666;"><p><strong>On ${originalDate}, ${original.from || 'Unknown Sender'} wrote:</strong></p><div>${(original.html || original.text || '').replace(/\n/g, '<br>')}</div></div>`;
        finalHtml = `${html || (text || '').replace(/\n/g, '<br>') || ''}<br><br>${quotedHtml}`;
      }
    }

    const emailOptions: any = {
      to: toRecipients,
      cc: ccRecipients.length > 0 ? ccRecipients : undefined,
      subject: replySubject,
      text: finalText,
      html: finalHtml,
    };

    if (attachments && attachments.length > 0) {
      emailOptions.attachments = attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: att.contentType,
      }));
    }

    const result = await smtp.sendMail(emailOptions);
    console.error('[ReplyEmail] Reply sent successfully:', result.messageId);

    const sentFolderResult = { saved: false };
    try {
      const sentMailbox = await findSentMailbox(imap);
      if (sentMailbox) {
        const rawMessage = buildRawEmailMessage(emailOptions, result.messageId, session.imapConfig.username);
        await imap.saveMessageToFolder(rawMessage, sentMailbox);
        sentFolderResult.saved = true;
      }
    } catch (err) {
      console.error('[ReplyEmail] Failed to save to sent folder:', err instanceof Error ? err.message : String(err));
    }

    return c.json({
      ...result,
      replyTo: originalFrom,
      replyToAll,
      sentFolderSaved: sentFolderResult.saved,
      subject: replySubject,
      to: originalFrom,
      from: session.smtpConfig.username,
    });
  } catch (err) {
    console.error('[ReplyEmail] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});