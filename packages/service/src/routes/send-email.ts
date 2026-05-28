import { Hono } from 'hono';
import { z } from 'zod';
import { validateSession, getIMAPClient, getSMTPClient } from '../session-manager';

export const sendEmailRouter = new Hono();

const sendEmailSchema = z.object({
  sessionId: z.string().min(1),
  to: z.string().min(1),
  subject: z.string().min(1),
  text: z.string().optional(),
  html: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(),
    contentType: z.string().optional(),
  })).optional(),
});

sendEmailRouter.post('/', async (c) => {
  console.error('[SendEmail] Incoming send email request');
  try {
    const body = await c.req.json();
    const parsed = sendEmailSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }

    const { sessionId, to, subject, text, html, cc, bcc, attachments } = parsed.data;

    if (!text && !html) {
      return c.json({ error: 'Either text or html content is required' }, 400);
    }

    const smtp = await getSMTPClient(sessionId);
    const session = validateSession(sessionId);

    const emailOptions: any = {
      to: to.includes(',') ? to.split(',').map((e: string) => e.trim()) : to,
      subject,
      text,
      html,
      cc: cc ? (cc.includes(',') ? cc.split(',').map((e: string) => e.trim()) : cc) : undefined,
      bcc: bcc ? (bcc.includes(',') ? bcc.split(',').map((e: string) => e.trim()) : bcc) : undefined,
    };

    if (attachments && attachments.length > 0) {
      emailOptions.attachments = attachments.map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: att.contentType,
      }));
    }

    const result = await smtp.sendMail(emailOptions);
    console.error('[SendEmail] Email sent successfully:', result.messageId);

    const sentFolderResult = { saved: false };
    try {
      const imap = await getIMAPClient(sessionId);
      const sentMailbox = await findSentMailbox(imap);
      if (sentMailbox) {
        const rawMessage = buildRawEmailMessage(emailOptions, result.messageId, session.smtpConfig.username);
        await imap.saveMessageToFolder(rawMessage, sentMailbox);
        sentFolderResult.saved = true;
      }
    } catch (err) {
      console.error('[SendEmail] Failed to save to sent folder:', err instanceof Error ? err.message : String(err));
    }

    return c.json({
      ...result,
      sentFolderSaved: sentFolderResult.saved,
      from: session.smtpConfig.username,
    });
  } catch (err) {
    console.error('[SendEmail] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

const COMMON_SENT_MAILBOX_NAMES = ['INBOX.Sent', 'Sent', 'SENT', 'Sent Items', 'Sent Messages'];

async function findSentMailbox(imap: any): Promise<string | null> {
  try {
    const boxes = await imap.getBoxes();
    const findByAttrib = (nodes: any, prefix = ''): string | null => {
      for (const [name, box] of Object.entries(nodes) as [string, any][]) {
        const fullPath = prefix ? `${prefix}${box.delimiter || '.'}${name}` : name;
        if (Array.isArray(box.attribs) && box.attribs.includes('\\Sent')) return fullPath;
        if (box.children) {
          const found = findByAttrib(box.children, fullPath);
          if (found) return found;
        }
      }
      return null;
    };
    const byAttrib = findByAttrib(boxes);
    if (byAttrib) return byAttrib;
  } catch {}

  for (const name of COMMON_SENT_MAILBOX_NAMES) {
    try {
      await imap.openBox(name, true);
      return name;
    } catch { /* continue */ }
  }
  return null;
}

function buildRawEmailMessage(options: any, messageId: string | undefined, fromEmail: string): string {
  const now = new Date();
  const msgId = messageId || `<${Date.now()}.${Math.random().toString(36)}@${fromEmail.split('@')[1] || 'localhost'}>`;

  let raw = '';
  raw += `Message-ID: ${msgId}\r\n`;
  raw += `Date: ${now.toUTCString()}\r\n`;
  raw += `From: ${fromEmail}\r\n`;
  raw += `To: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}\r\n`;
  if (options.cc) raw += `Cc: ${Array.isArray(options.cc) ? options.cc.join(', ') : options.cc}\r\n`;
  if (options.bcc) raw += `Bcc: ${Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc}\r\n`;
  raw += `Subject: ${options.subject}\r\n`;
  raw += `MIME-Version: 1.0\r\n`;

  if (options.html && options.text) {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36)}`;
    raw += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    raw += `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${options.text}\r\n\r\n`;
    raw += `--${boundary}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${options.html}\r\n\r\n`;
    raw += `--${boundary}--\r\n`;
  } else if (options.html) {
    raw += `Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${options.html}\r\n`;
  } else {
    raw += `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${options.text || ''}\r\n`;
  }

  return raw;
}

export { findSentMailbox, buildRawEmailMessage };