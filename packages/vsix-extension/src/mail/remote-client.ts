import { mcpMailOutputChannel } from '../logger';
import { getMailConfig, getSendMode, getRemoteUrl } from './config';
import { getDefaultAttachmentsConfig } from '../sentMail/attachments';
import { getSignatureConfig, stripHtml } from '../sentMail/signature';
import { DebugSink, maskSensitive } from '../debug/debugRunner';
import { randomUUID } from 'crypto';

export class RemoteMailClient {
  private sessionId: string | null = null;
  private baseUrl: string;
  private imapConnected = false;
  private smtpConnected = false;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private debugSink: DebugSink | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || getRemoteUrl();
    mcpMailOutputChannel.info(`[RemoteClient] 🌐 Remote mode active — proxy: ${this.baseUrl}`);
  }

  setDebugCapture(sink: DebugSink | null): void {
    this.debugSink = sink;
    mcpMailOutputChannel.debug(`[RemoteClient] Debug capture ${sink ? 'enabled' : 'disabled'}`);
  }

  private sink(line: string): void {
    if (this.debugSink) this.debugSink(line);
  }

  private summarizeBody(body: any): string {
    if (body === undefined || body === null) return '(empty)';
    try {
      const json = JSON.stringify(maskSensitive(body));
      if (json.length <= 500) return json;
      return `${json.substring(0, 500)}... [+${json.length - 500} bytes]`;
    } catch {
      const s = String(body);
      return s.length <= 500 ? s : `${s.substring(0, 500)}... [+${s.length - 500} bytes]`;
    }
  }

  private async request(path: string, body: any, method: string = 'POST', signal?: AbortSignal): Promise<any> {
    const url = `${this.baseUrl}/api/${path}`;
    mcpMailOutputChannel.debug(`[RemoteClient] ${method} ${url}`);
    this.sink(`→ ${method} ${url}`);

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
        const bodyStr = JSON.stringify(body);
        options.body = bodyStr;
        this.sink(`  body: ${this.summarizeBody(body)}`);
        this.sink(`  body bytes: ${bodyStr.length}`);
      } else if (body && body.sessionId) {
        const params = new URLSearchParams({ sessionId: body.sessionId });
        const urlWithParams = `${url}?${params.toString()}`;
        const response = await fetch(urlWithParams, options);
        clearTimeout(timeoutId);
        return this.handleResponse(response, urlWithParams);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      return this.handleResponse(response, url);
    } catch (error) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted && signal?.aborted) {
        this.sink(`✗ Request cancelled: ${method} ${url}`);
        throw new Error(`Remote service request cancelled: ${method} ${url}`);
      }
      const err = error as any;
      const cause = err?.cause;
      if (cause?.code) {
        this.sink(`✗ Network error code=${cause.code} syscall=${cause.syscall ?? 'n/a'} address=${cause.address ?? 'n/a'}:${cause.port ?? 'n/a'}`);
      } else {
        this.sink(`✗ ${method} ${url} — ${err instanceof Error ? err.message : String(err)}`);
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      mcpMailOutputChannel.error(`[RemoteClient] Request failed: ${method} ${url} - ${errMsg}`);
      throw new Error(`Remote service request failed: ${errMsg}`);
    }
  }

  private async handleResponse(response: Response, url: string): Promise<any> {
    const startedAt = Date.now();
    this.sink(`← response from ${url}`);
    const text = await response.text();
    const duration = Date.now() - startedAt;
    this.sink(`  status: ${response.status} ${response.statusText}`);
    this.sink(`  duration: ${duration} ms`);
    this.sink(`  body bytes: ${text.length}`);

    let data: any;
    try {
      data = JSON.parse(text);
      this.sink(`  body[0..500]: ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`);
    } catch {
      this.sink(`  body[0..500] (non-JSON): ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`);
      mcpMailOutputChannel.error(`[RemoteClient] Invalid JSON response from ${url}: status=${response.status} body=${text.substring(0, 200)}`);
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        const friendly = `Remote service is temporarily unavailable (HTTP ${response.status} ${response.statusText}). ` +
          `This usually means the proxy is restarting or the upstream service is down. ` +
          `Please retry in 5–10 seconds. The email may not have been sent — check your outbox before retrying to avoid duplicates.`;
        this.sink(`✗ ${friendly}`);
        throw new Error(friendly);
      }
      throw new Error(`Remote service returned invalid JSON (HTTP ${response.status}): ${text.substring(0, 200)}`);
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
        fromAddress: config.SMTP.fromAddress,
        fromName: config.SMTP.fromName,
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

    const config = getMailConfig();
    const remoteFromName = config.SMTP.fromName?.trim();
    const remoteFromHeader = remoteFromName
      ? `${remoteFromName} <${config.SMTP.fromAddress}>`
      : config.SMTP.fromAddress;
    mcpMailOutputChannel.info(`[FIX-FROMNAME] Remote sendEmail fromName="${config.SMTP.fromName || ''}" fromHeader="${remoteFromHeader}"`);

    return this.requestNoRetry('send-email', {
      sessionId: this.sessionId,
      from: remoteFromHeader,
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

    const config = getMailConfig();
    const remoteReplyFromName = config.SMTP.fromName?.trim();
    const remoteReplyFromHeader = remoteReplyFromName
      ? `${remoteReplyFromName} <${config.SMTP.fromAddress}>`
      : config.SMTP.fromAddress;
    mcpMailOutputChannel.info(`[FIX-FROMNAME] Remote replyEmail fromName="${config.SMTP.fromName || ''}" fromHeader="${remoteReplyFromHeader}"`);

    return this.requestNoRetry('reply-email', {
      sessionId: this.sessionId,
      from: remoteReplyFromHeader,
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