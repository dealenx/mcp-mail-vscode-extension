import * as vscode from 'vscode';
import { Tool } from './tool';
import { MailService } from './mail/mailService';

const mailService = new MailService();

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

  async call(_options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const results: string[] = [];
    try {
      await mailService.ensureIMAPConnection();
      results.push('✅ IMAP: Connected successfully');
    } catch (e) {
      results.push(`❌ IMAP: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      await mailService.ensureSMTPConnection();
      results.push('✅ SMTP: Connected successfully');
    } catch (e) {
      results.push(`❌ SMTP: ${e instanceof Error ? e.message : String(e)}`);
    }
    return JSON.stringify({ results }, null, 2);
  }
}

export class MailDisconnectTool extends Tool {
  public readonly toolName = 'mail_disconnect_all';

  async call(_options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    mailService.disconnectAll();
    return JSON.stringify({ success: true, message: 'Disconnected from all mail services' }, null, 2);
  }
}

export class MailConnectionStatusTool extends Tool {
  public readonly toolName = 'mail_get_connection_status';

  async call(_options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const status = await mailService.getConnectionStatus();
    return JSON.stringify(status, null, 2);
  }
}

// ─── Mailbox Browse ──────────────────────────────────────────────

export class MailListMailboxesTool extends Tool {
  public readonly toolName = 'mail_list_mailboxes';

  async call(_options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const boxes = await mailService.listMailboxes();
    return JSON.stringify(boxes, null, 2);
  }
}

export class MailOpenMailboxTool extends Tool {
  public readonly toolName = 'mail_open_mailbox';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = options.input as { mailboxName?: string; readOnly?: boolean } || {};
    const info = await mailService.openMailbox(input.mailboxName || 'INBOX', input.readOnly || false);
    return JSON.stringify(info, null, 2);
  }
}

// ─── Message Count ─────────────────────────────────────────────

export class MailGetMessageCountTool extends Tool {
  public readonly toolName = 'mail_get_message_count';

  async call(_options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const count = await mailService.getMessageCount();
    return JSON.stringify({ totalMessages: count }, null, 2);
  }
}

export class MailGetUnseenMessagesTool extends Tool {
  public readonly toolName = 'mail_get_unseen_messages';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { limit?: number }) || {};
    const messages = await mailService.getUnseenMessages(input.limit || 50);
    return JSON.stringify({ messages }, null, 2);
  }
}

export class MailGetRecentMessagesTool extends Tool {
  public readonly toolName = 'mail_get_recent_messages';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { limit?: number }) || {};
    const messages = await mailService.getRecentMessages(input.limit || 50);
    return JSON.stringify({ messages }, null, 2);
  }
}

// ─── Search ──────────────────────────────────────────────────────

export class MailSearchBySenderTool extends Tool {
  public readonly toolName = 'mail_search_by_sender';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { sender?: string; startDate?: string; endDate?: string; inboxOnly?: boolean; limit?: number }) || {};
    if (!input.sender) throw new Error('sender parameter is required');
    const result = await mailService.searchBySender(input.sender, input.startDate, input.endDate, input.inboxOnly || false, input.limit);
    return JSON.stringify(result, null, 2);
  }
}

export class MailSearchBySubjectTool extends Tool {
  public readonly toolName = 'mail_search_by_subject';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { subject?: string; startDate?: string; endDate?: string; inboxOnly?: boolean; limit?: number }) || {};
    if (!input.subject) throw new Error('subject parameter is required');
    const result = await mailService.searchBySubject(input.subject, input.startDate, input.endDate, input.inboxOnly || false, input.limit);
    return JSON.stringify(result, null, 2);
  }
}

export class MailSearchByBodyTool extends Tool {
  public readonly toolName = 'mail_search_by_body';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { text?: string; startDate?: string; endDate?: string; inboxOnly?: boolean; limit?: number }) || {};
    if (!input.text) throw new Error('text parameter is required');
    const result = await mailService.searchByBody(input.text, input.startDate, input.endDate, input.inboxOnly || false, input.limit);
    return JSON.stringify(result, null, 2);
  }
}

export class MailSearchSinceDateTool extends Tool {
  public readonly toolName = 'mail_search_since_date';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { date?: string; inboxOnly?: boolean; limit?: number }) || {};
    if (!input.date) throw new Error('date parameter is required');
    const result = await mailService.searchSinceDate(input.date, input.inboxOnly || false, input.limit);
    return JSON.stringify(result, null, 2);
  }
}

export class MailSearchAllMessagesTool extends Tool {
  public readonly toolName = 'mail_search_all_messages';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { startDate?: string; endDate?: string; inboxOnly?: boolean; limit?: number }) || {};
    const result = await mailService.searchAllMessages(input.startDate, input.endDate, input.inboxOnly || false, input.limit || 50);
    return JSON.stringify(result, null, 2);
  }
}

// ─── Read ────────────────────────────────────────────────────────

export class MailGetMessagesTool extends Tool {
  public readonly toolName = 'mail_get_messages';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { uids?: number[]; markSeen?: boolean }) || {};
    if (!Array.isArray(input.uids)) throw new Error('uids must be an array of numbers');
    const messages = await mailService.getMessages(input.uids, input.markSeen || false);
    return JSON.stringify({ messages }, null, 2);
  }
}

export class MailGetMessageTool extends Tool {
  public readonly toolName = 'mail_get_message';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { uid?: number; markSeen?: boolean }) || {};
    if (typeof input.uid !== 'number') throw new Error('uid must be a number');
    const message = await mailService.getMessage(input.uid, input.markSeen || false);
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
    await mailService.deleteMessage(input.uid);
    return JSON.stringify({ success: true, deletedUid: input.uid }, null, 2);
  }
}

// ─── Attachments ───────────────────────────────────────────────

export class MailGetAttachmentsTool extends Tool {
  public readonly toolName = 'mail_get_attachments';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { uid?: number }) || {};
    if (typeof input.uid !== 'number') throw new Error('uid must be a number');
    const attachments = await mailService.getAttachmentsMeta(input.uid);
    return JSON.stringify({ uid: input.uid, attachmentCount: attachments?.length || 0, attachments: attachments || [] }, null, 2);
  }
}

export class MailSaveAttachmentTool extends Tool {
  public readonly toolName = 'mail_save_attachment';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as { uid?: number; attachmentIndex?: number; returnBase64?: boolean }) || {};
    if (typeof input.uid !== 'number') throw new Error('uid must be a number');
    const attachments = await mailService.saveAttachment(input.uid, input.attachmentIndex);
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

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
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
    const result = await mailService.sendEmail({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      cc: input.cc,
      bcc: input.bcc,
      attachments: input.attachments,
    });
    return JSON.stringify(result, null, 2);
  }
}

export class MailReplyToEmailTool extends Tool {
  public readonly toolName = 'mail_reply_to_email';

  async call(options: vscode.LanguageModelToolInvocationOptions<object>, _token: vscode.CancellationToken): Promise<string> {
    const input = (options.input as {
      originalUid?: number;
      text?: string;
      html?: string;
      replyToAll?: boolean;
      includeOriginal?: boolean;
    }) || {};
    if (typeof input.originalUid !== 'number') throw new Error('originalUid must be a number');
    if (!input.text && !input.html) throw new Error('Either text or html content is required');
    const result = await mailService.replyToEmail({
      originalUid: input.originalUid,
      text: input.text || '',
      html: input.html,
      replyToAll: input.replyToAll,
      includeOriginal: input.includeOriginal,
    });
    return JSON.stringify(result, null, 2);
  }
}
