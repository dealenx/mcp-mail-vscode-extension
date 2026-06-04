import { mcpMailOutputChannel } from '../logger';
import { getMailConfig, getSendMode, getRemoteUrl } from './config';
import { getDefaultAttachmentsConfig } from '../sentMail/attachments';
import { getSignatureConfig, stripHtml } from '../sentMail/signature';
import { randomUUID } from 'crypto';

export class RemoteMailClient {
  private sessionId: string | null = null;
  private baseUrl: string;
  private imapConnected = false;
  private smtpConnected = false;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || getRemoteUrl();
    mcpMailOutputChannel.info(`[RemoteClient] 🌐 Remote mode active — proxy: ${this.baseUrl}`);
  }

  private async request(path: string, body: any, method: string = 'POST', signal?: AbortSignal): Promise<any> {
    const url = `${this.baseUrl}/api/${path}`;
    mcpMailOutputChannel.debug(`[RemoteClient] ${method} ${url}`);

    const timeoutMs = 120_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const options: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      };
      if (method !== 'GET') {
        options.body = JSON.stringify(body);
      } else if (body && body.sessionId) {
        const params = new URLSearchParams({ sessionId: body.sessionId });
        const urlWithParams = `${url}?${params.toString()}`;
        const response = await fetch(urlWithParams, options);
        clearTimeout(timeoutId);
        return this.handleResponse(response, url);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      return this.handleResponse(response, url);
    } catch (error) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted && signal?.aborted) {
        throw new Error(`Remote service request cancelled: ${method} ${url}`);
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      mcpMailOutputChannel.error(`[RemoteClient] Request failed: ${method} ${url} - ${errMsg}`);
      throw new Error(`Remote service request failed: ${errMsg}`);
    }
  }

  private async handleResponse(response: Response, url: string): Promise<any> {
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      mcpMailOutputChannel.error(`[RemoteClient] Invalid JSON response from ${url}: ${text.substring(0, 200)}`);
      throw new Error(`Remote service returned invalid JSON: ${text.substring(0, 200)}`);
    }

    if (!response.ok) {
      const errorMsg = data.error || data.message || `HTTP ${response.status}`;
      mcpMailOutputChannel.error(`[RemoteClient] Error from ${url}: ${errorMsg}`);

      if (errorMsg.includes('Session not found') || errorMsg.includes('sessionId')) {
        this.sessionId = null;
        this.imapConnected = false;
        this.smtpConnected = false;
        mcpMailOutputChannel.warn('[RemoteClient] Session expired, will need to reconnect');
      }

      throw new Error(`Remote service error: ${errorMsg}`);
    }

    mcpMailOutputChannel.debug(`[RemoteClient] Response OK from ${url}`);
    return data;
  }

  private async requestWithRetry(path: string, body: any, method: string = 'POST', signal?: AbortSignal): Promise<any> {
    try {
      return await this.request(path, body, method, signal);
    } catch (error) {
      const isSessionError = error instanceof Error &&
        (error.message.includes('Session not found') || error.message.includes('sessionId'));
      if (isSessionError) {
        mcpMailOutputChannel.info('[RemoteClient] [FIX] Session expired, reconnecting and retrying...');
        await this.connect();
        const newBody = { ...body, sessionId: this.sessionId };
        return this.request(path, newBody, method, signal);
      }
      throw error;
    }
  }

  private async requestNoRetry(path: string, body: any, method: string = 'POST', signal?: AbortSignal): Promise<any> {
    try {
      return await this.request(path, body, method, signal);
    } catch (error) {
      const isSessionError = error instanceof Error &&
        (error.message.includes('Session not found') || error.message.includes('sessionId'));
      if (isSessionError) {
        this.sessionId = null;
        this.imapConnected = false;
        this.smtpConnected = false;
        mcpMailOutputChannel.error('[RemoteClient] Session expired during mutation request. Email may have been sent. Check your mailbox before retrying.');
        throw new Error('Session expired during send. The email may have already been sent — please check your mailbox before retrying to avoid duplicates.');
      }
      throw error;
    }
  }

  async ensureIMAPConnection(): Promise<void> {
    if (this.imapConnected && this.sessionId) return;
    await this.connect();
  }

  async ensureSMTPConnection(_signal?: AbortSignal): Promise<void> {
    if (this.smtpConnected && this.sessionId) return;
    await this.connect();
  }

  async ensureRequiredConnections(requireIMAP = false, requireSMTP = false): Promise<void> {
    if (this.sessionId && ((requireIMAP && this.imapConnected) || (requireSMTP && this.smtpConnected))) return;
    await this.connect();
  }

  private async connect(): Promise<void> {
    const config = getMailConfig();
    mcpMailOutputChannel.info(`[RemoteClient] Connecting to ${this.baseUrl} with IMAP ${config.IMAP.host}:${config.IMAP.port}`);

    const data = await this.request('connect', {
      imap: {
        host: config.IMAP.host,
        port: config.IMAP.port,
        username: config.IMAP.username,
        password: config.IMAP.password,
        tls: config.IMAP.tls,
      },
      smtp: {
        host: config.SMTP.host,
        port: config.SMTP.port,
        username: config.SMTP.username,
        password: config.SMTP.password,
        secure: config.SMTP.secure,
      },
    });

    if (data.sessionId) {
      this.sessionId = data.sessionId;
      this.imapConnected = data.results.some((r: string) => r.includes('IMAP: Connected'));
      this.smtpConnected = data.results.some((r: string) => r.includes('SMTP: Connected'));
      mcpMailOutputChannel.info(`[RemoteClient] Connected, sessionId: ${this.sessionId}`);
    } else {
      throw new Error('Remote service did not return sessionId');
    }
  }

  private async autoReconnect(): Promise<void> {
    if (!this.sessionId) {
      mcpMailOutputChannel.info('[RemoteClient] No active session, reconnecting...');
      await this.connect();
      return;
    }
    try {
      await this.request('status', { sessionId: this.sessionId }, 'GET');
      mcpMailOutputChannel.debug('[RemoteClient] Session still alive');
    } catch {
      mcpMailOutputChannel.info('[RemoteClient] [FIX] Session invalid, reconnecting...');
      this.sessionId = null;
      this.imapConnected = false;
      this.smtpConnected = false;
      await this.connect();
    }
  }

  startKeepalive(): void {
    if (this.keepaliveInterval) return;
    this.keepaliveInterval = setInterval(async () => {
      if (this.sessionId) {
        try {
          await this.request('status', { sessionId: this.sessionId }, 'GET');
          mcpMailOutputChannel.debug('[RemoteClient] Keepalive: session alive');
        } catch {
          mcpMailOutputChannel.info('[RemoteClient] Keepalive: session expired, clearing state');
          this.sessionId = null;
          this.imapConnected = false;
          this.smtpConnected = false;
        }
      }
    }, 5 * 60 * 1000);
    mcpMailOutputChannel.info('[RemoteClient] Keepalive started (5 min interval)');
  }

  stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
      mcpMailOutputChannel.info('[RemoteClient] Keepalive stopped');
    }
  }

  disconnectAll(): void {
    this.stopKeepalive();
    if (this.sessionId) {
      this.request('disconnect', { sessionId: this.sessionId }).catch((err) => {
        mcpMailOutputChannel.warn('[RemoteClient] Disconnect error:', err instanceof Error ? err.message : String(err));
      });
    }
    this.sessionId = null;
    this.imapConnected = false;
    this.smtpConnected = false;
    mcpMailOutputChannel.info('[RemoteClient] Disconnected');
  }

  async getConnectionStatus(): Promise<object> {
    await this.autoReconnect();
    const data = await this.requestWithRetry('status', { sessionId: this.sessionId });
    return data;
  }

  async listMailboxes(): Promise<any> {
    await this.autoReconnect();
    return this.requestWithRetry('mailboxes', { sessionId: this.sessionId });
  }

  async openMailbox(mailboxName = 'INBOX', readOnly = false): Promise<any> {
    await this.autoReconnect();
    return this.requestWithRetry('messages/open-mailbox', { sessionId: this.sessionId, mailboxName, readOnly });
  }

  async getMessageCount(): Promise<number> {
    await this.autoReconnect();
    const data = await this.requestWithRetry('messages/count', { sessionId: this.sessionId });
    return data.totalMessages;
  }

  async getUnseenMessages(limit = 50): Promise<any[]> {
    await this.autoReconnect();
    const data = await this.requestWithRetry('messages/unseen', { sessionId: this.sessionId, limit });
    return data.messages;
  }

  async getRecentMessages(limit = 50): Promise<any[]> {
    await this.autoReconnect();
    const data = await this.requestWithRetry('messages/recent', { sessionId: this.sessionId, limit });
    return data.messages;
  }

  async searchBySender(sender: string, startDate?: string, endDate?: string, inboxOnly?: boolean, limit?: number): Promise<any> {
    await this.autoReconnect();
    return this.requestWithRetry('search/sender', { sessionId: this.sessionId, sender, startDate, endDate, inboxOnly, limit });
  }

  async searchBySubject(subject: string, startDate?: string, endDate?: string, inboxOnly?: boolean, limit?: number): Promise<any> {
    await this.autoReconnect();
    return this.requestWithRetry('search/subject', { sessionId: this.sessionId, subject, startDate, endDate, inboxOnly, limit });
  }

  async searchByBody(text: string, startDate?: string, endDate?: string, inboxOnly?: boolean, limit?: number): Promise<any> {
    await this.autoReconnect();
    return this.requestWithRetry('search/body', { sessionId: this.sessionId, text, startDate, endDate, inboxOnly, limit });
  }

  async searchSinceDate(date: string, inboxOnly?: boolean, limit?: number): Promise<any> {
    await this.autoReconnect();
    return this.requestWithRetry('search/since', { sessionId: this.sessionId, date, inboxOnly, limit });
  }

  async searchAllMessages(startDate?: string, endDate?: string, inboxOnly?: boolean, limit?: number): Promise<any> {
    await this.autoReconnect();
    return this.requestWithRetry('search/all', { sessionId: this.sessionId, startDate, endDate, inboxOnly, limit: limit || 50 });
  }

  async getMessages(uids: number[], markSeen = false): Promise<any[]> {
    await this.autoReconnect();
    const data = await this.requestWithRetry('messages/list', { sessionId: this.sessionId, uids, markSeen });
    return data.messages;
  }

  async getMessage(uid: number, markSeen = false): Promise<any | null> {
    await this.autoReconnect();
    const data = await this.requestWithRetry('messages/get', { sessionId: this.sessionId, uid, markSeen });
    return data.message;
  }

  async deleteMessage(uid: number): Promise<void> {
    await this.autoReconnect();
    await this.requestWithRetry('messages/delete', { sessionId: this.sessionId, uid });
  }

  async getAttachmentsMeta(uid: number): Promise<any[] | undefined> {
    await this.autoReconnect();
    const data = await this.requestWithRetry('attachments/meta', { sessionId: this.sessionId, uid });
    return data.attachments;
  }

  async saveAttachment(uid: number, attachmentIndex?: number): Promise<Array<{ filename: string; content: string; size: number }>> {
    await this.autoReconnect();
    const data = await this.requestWithRetry('attachments/save', { sessionId: this.sessionId, uid, attachmentIndex });
    return data.files || [];
  }

  async sendEmail(args: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    cc?: string;
    bcc?: string;
    attachments?: string[];
  }, signal?: AbortSignal): Promise<object> {
    await this.autoReconnect();

    let htmlContent = args.html;
    let textContent = args.text;

    const sig = getSignatureConfig();
    if (sig.enabled && sig.html) {
      if (htmlContent) {
        htmlContent += `<br><br><hr><div style="white-space: pre-wrap; word-break: break-word;">${sig.html}</div>`;
        mcpMailOutputChannel.info('[RemoteClient] [FIX] HTML signature appended');
      }
      if (textContent) {
        textContent += `\n\n---\n${stripHtml(sig.html)}`;
        mcpMailOutputChannel.info('[RemoteClient] [FIX] Text signature appended');
      }
    }

    const remoteAttachments: Array<{ filename: string; content: string; contentType?: string }> = [];
    const existingPaths = new Set<string>();
    const fs = await import('fs/promises');
    const path = await import('path');

    if (args.attachments && args.attachments.length > 0) {
      for (const filePath of args.attachments) {
        existingPaths.add(filePath);
        mcpMailOutputChannel.info(`[RemoteClient] [FIX] Reading attachment: ${filePath}`);
        try {
          const content = await fs.readFile(filePath);
          mcpMailOutputChannel.info(`[RemoteClient] [FIX] Attachment read: ${path.basename(filePath)} (${content.length} bytes)`);
          remoteAttachments.push({
            filename: path.basename(filePath),
            content: content.toString('base64'),
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          mcpMailOutputChannel.error(`[RemoteClient] [FIX] Failed to read attachment ${filePath}: ${errMsg}`);
          throw new Error(`Failed to read attachment ${filePath}: ${errMsg}`);
        }
      }
    }

    const defaultAtt = getDefaultAttachmentsConfig();
    if (defaultAtt.enabled && defaultAtt.files.length > 0) {
      for (const filePath of defaultAtt.files) {
        if (existingPaths.has(filePath)) {
          mcpMailOutputChannel.debug(`[RemoteClient] [FIX] Skipping duplicate default attachment: ${filePath}`);
          continue;
        }
        try {
          const content = await fs.readFile(filePath);
          remoteAttachments.push({
            filename: path.basename(filePath),
            content: content.toString('base64'),
          });
          mcpMailOutputChannel.info(`[RemoteClient] [FIX] Default attachment added: ${path.basename(filePath)} (${content.length} bytes)`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          mcpMailOutputChannel.warn(`[RemoteClient] [FIX] Failed to read default attachment ${filePath}: ${msg}`);
        }
      }
    }

    const idempotencyKey = `send-${Date.now()}-${randomUUID()}`;
    mcpMailOutputChannel.info(`[RemoteClient] Idempotency key: ${idempotencyKey}`);

    return this.requestNoRetry('send-email', {
      sessionId: this.sessionId,
      to: args.to,
      subject: args.subject,
      text: textContent,
      html: htmlContent,
      cc: args.cc,
      bcc: args.bcc,
      attachments: remoteAttachments.length > 0 ? remoteAttachments : undefined,
      idempotencyKey,
    }, undefined, signal);
  }

  async replyToEmail(args: {
    originalUid: number;
    text?: string;
    html?: string;
    replyToAll?: boolean;
    includeOriginal?: boolean;
  }, signal?: AbortSignal): Promise<object> {
    await this.autoReconnect();

    let htmlContent = args.html;
    let textContent = args.text;

    const sig = getSignatureConfig();
    if (sig.enabled && sig.html) {
      if (htmlContent) {
        htmlContent += `<br><br><hr><div style="white-space: pre-wrap; word-break: break-word;">${sig.html}</div>`;
        mcpMailOutputChannel.info('[RemoteClient] [FIX] HTML signature appended to reply');
      }
      if (textContent) {
        textContent += `\n\n---\n${stripHtml(sig.html)}`;
        mcpMailOutputChannel.info('[RemoteClient] [FIX] Text signature appended to reply');
      }
    }

    const remoteAttachments: Array<{ filename: string; content: string; contentType?: string }> = [];

    const defaultAtt = getDefaultAttachmentsConfig();
    if (defaultAtt.enabled && defaultAtt.files.length > 0) {
      const fs = await import('fs/promises');
      const path = await import('path');
      for (const filePath of defaultAtt.files) {
        try {
          const content = await fs.readFile(filePath);
          remoteAttachments.push({
            filename: path.basename(filePath),
            content: content.toString('base64'),
          });
          mcpMailOutputChannel.info(`[RemoteClient] [FIX] Default attachment added to reply: ${path.basename(filePath)} (${content.length} bytes)`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          mcpMailOutputChannel.warn(`[RemoteClient] [FIX] Failed to read default attachment ${filePath}: ${msg}`);
        }
      }
    }

    const idempotencyKey = `reply-${Date.now()}-${randomUUID()}`;
    mcpMailOutputChannel.info(`[RemoteClient] Idempotency key: ${idempotencyKey}`);

    return this.requestNoRetry('reply-email', {
      sessionId: this.sessionId,
      originalUid: args.originalUid,
      text: textContent,
      html: htmlContent,
      replyToAll: args.replyToAll,
      includeOriginal: args.includeOriginal,
      attachments: remoteAttachments.length > 0 ? remoteAttachments : undefined,
      idempotencyKey,
    }, undefined, signal);
  }
}