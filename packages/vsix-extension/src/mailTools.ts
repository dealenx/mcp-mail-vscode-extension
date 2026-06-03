import * as vscode from 'vscode';
import { Tool, createAbortController } from './tool';
import { CancellationError } from './cancellation';
import { MailService } from './mail/mailService';
import { RemoteMailClient } from './mail/remote-client';
import { IMailService } from './mail/imail-service';
import { getSendMode } from './mail/config';
import { SentMailHistoryService } from './sentMail/historyService';
import { SentMailRecord } from './sentMail/types';
import { mcpMailOutputChannel } from './logger';

let mailServiceImpl: IMailService | null = null;
let currentMode: 'local' | 'remote' | null = null;
let sentMailHistory: SentMailHistoryService | null = null;

export function getMailService(forceReset = false): IMailService {
  const mode = getSendMode();
  if (forceReset && mailServiceImpl) {
    mailServiceImpl.disconnectAll();
    mailServiceImpl = null;
    currentMode = null;
  }
  if (mailServiceImpl && currentMode === mode) {
    return mailServiceImpl;
  }
  if (mailServiceImpl) {
    mailServiceImpl.disconnectAll();
  }
  if (mode === 'remote') {
    mcpMailOutputChannel.info('[MailTools] Switching to remote mode');
    const remoteClient = new RemoteMailClient();
    remoteClient.startKeepalive();
    mailServiceImpl = remoteClient;
  } else {
    mcpMailOutputChannel.info('[MailTools] Switching to local mode');
    mailServiceImpl = new MailService();
  }
  currentMode = mode;
  return mailServiceImpl;
}

export function setSentMailHistory(service: SentMailHistoryService): void {
  sentMailHistory = service;
  mcpMailOutputChannel.info('[MailTools] SentMailHistoryService registered');
}

async function saveSentMailRecord(record: SentMailRecord): Promise<void> {
  if (!sentMailHistory) {
    mcpMailOutputChannel.warn('[MailTools] SentMailHistoryService not set, skipping local save');
    return;
  }
  try {
    await sentMailHistory.save(record);
    mcpMailOutputChannel.info('[MailTools] Sent mail saved locally:', record.id);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    mcpMailOutputChannel.error('[MailTools] Failed to save sent mail locally:', msg);
  }
}

/**
 * Сохраняет base64-вложения во временные файлы и возвращает их пути.
 */
async function saveAttachmentsToTemp(
  attachments: Array<{ filename: string; content: string }>
): Promise<Array<{ filename: string; path: string }>> {
  const results: Array<{ filename: string; path: string }> = [];
  const tmpDir = vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file(process.cwd() || ''), '.mcp-mail-attachments');
  try { await vscode.workspace.fs.createDirectory(tmpDir); } catch {}
  for (const att of attachments) {
    const bytes = Buffer.from(att.content, 'base64');
    const uri = vscode.Uri.joinPath(tmpDir, att.filename);
    await vscode.workspace.fs.writeFile(uri, bytes);
    results.push({ filename: att.filename, path: uri.fsPath });
  }
  return results;
}

// ─── Connection Management ─────────────────────────────────────

export class MailConnectTool extends Tool {
  public readonly toolName = 'mail_connect_all';

  async call(_options: vscode.LanguageModelToolInvocationOptions<object>, token: vscode.CancellationToken): Promise<string> {
    const { signal } = createAbortController(token);
    const results: string[] = [];
    try {
      if (signal.aborted) throw new CancellationError();
      await getMailService().ensureIMAPConnection();
      results.push('✅ IMAP: Connected successfully');
    } catch (e) {
      if (e instanceof CancellationError) throw e;
      results.push(`❌ IMAP: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      if (signal.aborted) throw new CancellationError();
      await getMailService().ensureSMTPConnection(signal);
      results.push('✅ SMTP: Connected successfully');
    } catch (e) {
      if (e instanceof CancellationError) throw e;
      results.push(`❌ SMTP: ${e instanceof Error ? e.message : String(e)}`);
    }
    return JSON.stringify({ results }, null, 2);
  }
}

export class MailDisconnectTool extends Tool {
  public readonly toolName = 'mail_disconnect_all';

  async call(_options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    getMailService().disconnectAll();
    return JSON.stringify({ success: true, message: 'Disconnected from all mail services' }, null, 2);
  }
}

export class MailConnectionStatusTool extends Tool {
  public readonly toolName = 'mail_get_connection_status';

  async call(_options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const status = await getMailService().getConnectionStatus();
    return JSON.stringify(status, null, 2);
  }
}

// ─── Mailbox Browse ──────────────────────────────────────────────

export class MailListMailboxesTool extends Tool {
  public readonly toolName = 'mail_list_mailboxes';

  async call(_options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const boxes = await getMailService().listMailboxes();
    return JSON.stringify(boxes, null, 2);
  }
}

export class MailOpenMailboxTool extends Tool {
  public readonly toolName = 'mail_open_mailbox';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = options.input as { mailboxName?: string; readOnly?: boolean } || {};
    const info = await getMailService().openMailbox(input.mailboxName || 'INBOX', input.readOnly || false);
    return JSON.stringify(info, null, 2);
  }
}

// ─── Message Count ─────────────────────────────────────────────

export class MailGetMessageCountTool extends Tool {
  public readonly toolName = 'mail_get_message_count';

  async call(_options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const count = await getMailService().getMessageCount();
    return JSON.stringify({ totalMessages: count }, null, 2);
  }
}

export class MailGetUnseenMessagesTool extends Tool {
  public readonly toolName = 'mail_get_unseen_messages';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { limit?: number }) || {};
    const messages = await getMailService().getUnseenMessages(input.limit || 50);
    return JSON.stringify({ messages }, null, 2);
  }
}

export class MailGetRecentMessagesTool extends Tool {
  public readonly toolName = 'mail_get_recent_messages';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { limit?: number }) || {};
    const messages = await getMailService().getRecentMessages(input.limit || 50);
    return JSON.stringify({ messages }, null, 2);
  }
}

// ─── Search ──────────────────────────────────────────────────────

export class MailSearchBySenderTool extends Tool {
  public readonly toolName = 'mail_search_by_sender';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { sender?: string; startDate?: string; endDate?: string; inboxOnly?: boolean; limit?: number }) || {};
    if (!input.sender) throw new Error('sender parameter is required');
    const result = await getMailService().searchBySender(input.sender, input.startDate, input.endDate, input.inboxOnly || false, input.limit);
    return JSON.stringify(result, null, 2);
  }
}

export class MailSearchBySubjectTool extends Tool {
  public readonly toolName = 'mail_search_by_subject';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { subject?: string; startDate?: string; endDate?: string; inboxOnly?: boolean; limit?: number }) || {};
    if (!input.subject) throw new Error('subject parameter is required');
    const result = await getMailService().searchBySubject(input.subject, input.startDate, input.endDate, input.inboxOnly || false, input.limit);
    return JSON.stringify(result, null, 2);
  }
}

export class MailSearchByBodyTool extends Tool {
  public readonly toolName = 'mail_search_by_body';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { text?: string; startDate?: string; endDate?: string; inboxOnly?: boolean; limit?: number }) || {};
    if (!input.text) throw new Error('text parameter is required');
    const result = await getMailService().searchByBody(input.text, input.startDate, input.endDate, input.inboxOnly || false, input.limit);
    return JSON.stringify(result, null, 2);
  }
}

export class MailSearchSinceDateTool extends Tool {
  public readonly toolName = 'mail_search_since_date';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { date?: string; inboxOnly?: boolean; limit?: number }) || {};
    if (!input.date) throw new Error('date parameter is required');
    const result = await getMailService().searchSinceDate(input.date, input.inboxOnly || false, input.limit);
    return JSON.stringify(result, null, 2);
  }
}

export class MailSearchAllMessagesTool extends Tool {
  public readonly toolName = 'mail_search_all_messages';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { startDate?: string; endDate?: string; inboxOnly?: boolean; limit?: number }) || {};
    const result = await getMailService().searchAllMessages(input.startDate, input.endDate, input.inboxOnly || false, input.limit || 50);
    return JSON.stringify(result, null, 2);
  }
}

// ─── Read ────────────────────────────────────────────────────────

export class MailGetMessagesTool extends Tool {
  public readonly toolName = 'mail_get_messages';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { uids?: number[]; markSeen?: boolean }) || {};
    if (!Array.isArray(input.uids)) throw new Error('uids must be an array of numbers');
    const messages = await getMailService().getMessages(input.uids, input.markSeen || false);
    return JSON.stringify({ messages }, null, 2);
  }
}

export class MailGetMessageTool extends Tool {
  public readonly toolName = 'mail_get_message';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { uid?: number; markSeen?: boolean }) || {};
    if (typeof input.uid !== 'number') throw new Error('uid must be a number');
    const message = await getMailService().getMessage(input.uid, input.markSeen || false);
    if (!message) throw new Error(`Message with UID ${input.uid} not found`);
    return JSON.stringify(message, null, 2);
  }
}

// ─── Delete ──────────────────────────────────────────────────────

export class MailDeleteMessageTool extends Tool {
  public readonly toolName = 'mail_delete_message';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { uid?: number }) || {};
    if (typeof input.uid !== 'number') throw new Error('uid must be a number');
    await getMailService().deleteMessage(input.uid);
    return JSON.stringify({ success: true, deletedUid: input.uid }, null, 2);
  }
}

// ─── Attachments ───────────────────────────────────────────────

export class MailGetAttachmentsTool extends Tool {
  public readonly toolName = 'mail_get_attachments';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { uid?: number }) || {};
    if (typeof input.uid !== 'number') throw new Error('uid must be a number');
    const attachments = await getMailService().getAttachmentsMeta(input.uid);
    return JSON.stringify({ uid: input.uid, attachmentCount: attachments?.length || 0, attachments: attachments || [] }, null, 2);
  }
}

export class MailSaveAttachmentTool extends Tool {
  public readonly toolName = 'mail_save_attachment';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { uid?: number; attachmentIndex?: number; returnBase64?: boolean }) || {};
    if (typeof input.uid !== 'number') throw new Error('uid must be a number');
    const attachments = await getMailService().saveAttachment(input.uid, input.attachmentIndex);
    if (attachments.length === 0) {
      return JSON.stringify({ uid: input.uid, note: 'This email has no attachments.' }, null, 2);
    }

    const result: Array<{ filename: string; size: number; path?: string; base64?: string }> = [];
    if (input.returnBase64) {
      for (const att of attachments) {
        result.push({ filename: att.filename, size: att.size, base64: att.content });
      }
    } else {
      const saved = await saveAttachmentsToTemp(attachments);
      for (const s of saved) {
        result.push({ filename: s.filename, size: attachments.find((a) => a.filename === s.filename)?.size || 0, path: s.path });
      }
    }

    return JSON.stringify({ uid: input.uid, savedCount: result.length, files: result }, null, 2);
  }
}

// ─── Send ────────────────────────────────────────────────────────

export class MailSendEmailTool extends Tool {
  public readonly toolName = 'mail_send_email';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as {
      to?: string;
      subject?: string;
      text?: string;
      html?: string;
      cc?: string;
      bcc?: string;
      attachments?: string[];
    }) || {};
    if (!input.to) throw new Error('to is required');
    if (!input.subject) throw new Error('subject is required');
    if (!input.text && !input.html) throw new Error('Either text or html content is required');

    const { signal } = createAbortController(token);
    const result = await getMailService().sendEmail({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      cc: input.cc,
      bcc: input.bcc,
      attachments: input.attachments,
    }, signal);

    const resultObj = result as Record<string, unknown>;
    try {
      await saveSentMailRecord({
        from: typeof resultObj.from === 'string' ? resultObj.from : undefined,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        cc: input.cc,
        bcc: input.bcc,
        attachments: input.attachments,
        date: new Date().toISOString(),
        messageId: typeof resultObj.messageId === 'string' ? resultObj.messageId : undefined,
      });
    } catch (err) {
      mcpMailOutputChannel.warn('[MailTools] Failed to save sent mail record (send succeeded):', err instanceof Error ? err.message : String(err));
    }

    return JSON.stringify(result, null, 2);
  }
}

export class MailReplyToEmailTool extends Tool {
  public readonly toolName = 'mail_reply_to_email';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as {
      originalUid?: number;
      text?: string;
      html?: string;
      replyToAll?: boolean;
      includeOriginal?: boolean;
    }) || {};
    if (typeof input.originalUid !== 'number') throw new Error('originalUid must be a number');
    if (!input.text && !input.html) throw new Error('Either text or html content is required');

    const { signal } = createAbortController(token);
    const result = await getMailService().replyToEmail({
      originalUid: input.originalUid,
      text: input.text || '',
      html: input.html,
      replyToAll: input.replyToAll,
      includeOriginal: input.includeOriginal,
    }, signal);

    const resultObj = result as Record<string, unknown>;
    try {
      await saveSentMailRecord({
        from: typeof resultObj.from === 'string' ? resultObj.from : undefined,
        to: typeof resultObj.to === 'string' ? resultObj.to : (resultObj.replyTo as string) || '',
        subject: typeof resultObj.subject === 'string' ? resultObj.subject : '',
        text: input.text,
        html: input.html,
        date: new Date().toISOString(),
        messageId: typeof resultObj.messageId === 'string' ? resultObj.messageId : undefined,
      });
    } catch (err) {
      mcpMailOutputChannel.warn('[MailTools] Failed to save sent mail record (reply succeeded):', err instanceof Error ? err.message : String(err));
    }

    return JSON.stringify(result, null, 2);
  }
}
