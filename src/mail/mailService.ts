import * as vscode from 'vscode';
import { IMAPClient, EmailMessage, AttachmentData, AttachmentMeta } from './imap-client';
import { SMTPClient, EmailOptions } from './smtp-client';
import { getMailConfig, MailConfig } from './config';

const COMMON_SENT_MAILBOX_NAMES = ['INBOX.Sent', 'Sent', 'SENT', 'Sent Items', 'Sent Messages', '已发送'];
const COMMON_MAILBOX_NAMES = ['INBOX', ...COMMON_SENT_MAILBOX_NAMES];

interface ExtendedEmailMessage extends EmailMessage {
  sourceMailbox: string;
}

interface SearchResult {
  searchType: string;
  searchValue: string;
  searchCriteria: any[];
  mailboxesSearched: Array<{ mailbox: string; matchingUIDs: number[]; messageCount: number; error?: string }>;
  totalMatches: number;
  messages: ExtendedEmailMessage[];
  note?: string;
  warning?: string;
}

export class MailService {
  private imapClient: IMAPClient | null = null;
  private smtpClient: SMTPClient | null = null;
  private isInitializing = false;
  private isSmtpInitializing = false;
  private sentMailboxName: string | null | undefined = undefined;

  async ensureIMAPConnection(): Promise<void> {
    if (this.imapClient && this.imapClient.isConnected()) {
      return;
    }
    if (this.isInitializing) {
      const deadline = Date.now() + 30000;
      while (this.isInitializing) {
        if (Date.now() > deadline) throw new Error('IMAP connection initialization timed out');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!this.imapClient || !this.imapClient.isConnected()) {
        throw new Error('IMAP connection initialization failed');
      }
      return;
    }
    this.isInitializing = true;
    try {
      const config = getMailConfig().IMAP;
      console.error(`[IMAP] Auto-connecting to ${config.host}:${config.port}`);
      this.imapClient = new IMAPClient(config);
      this.sentMailboxName = undefined;
      await this.imapClient.connect();
      console.error('[IMAP] Auto-connection successful');
    } finally {
      this.isInitializing = false;
    }
  }

  async ensureSMTPConnection(): Promise<void> {
    if (this.smtpClient) return;
    if (this.isSmtpInitializing) {
      const deadline = Date.now() + 30000;
      while (this.isSmtpInitializing) {
        if (Date.now() > deadline) throw new Error('SMTP connection initialization timed out');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!this.smtpClient) throw new Error('SMTP connection initialization failed');
      return;
    }
    this.isSmtpInitializing = true;
    try {
      const config = getMailConfig().SMTP;
      console.error(`[SMTP] Auto-connecting to ${config.host}:${config.port}`);
      this.smtpClient = new SMTPClient(config);
      await this.smtpClient.connect();
      console.error('[SMTP] Auto-connection successful');
    } finally {
      this.isSmtpInitializing = false;
    }
  }

  async ensureRequiredConnections(requireIMAP = false, requireSMTP = false): Promise<void> {
    if (requireIMAP) await this.ensureIMAPConnection();
    if (requireSMTP) await this.ensureSMTPConnection();
  }

  disconnectAll(): void {
    if (this.imapClient) {
      this.imapClient.disconnect().catch((err) => console.error('[IMAP] Disconnect error:', err));
      this.imapClient = null;
      this.sentMailboxName = undefined;
    }
    if (this.smtpClient) {
      this.smtpClient.disconnect().catch((err) => console.error('[SMTP] Disconnect error:', err));
      this.smtpClient = null;
    }
  }

  async getConnectionStatus(): Promise<object> {
    const config = getMailConfig();
    return {
      imap: {
        connected: !!this.imapClient && this.imapClient.isConnected(),
        currentBox: this.imapClient?.getCurrentBox() ?? null,
        server: `${config.IMAP.host}:${config.IMAP.port}`,
      },
      smtp: {
        connected: !!this.smtpClient && this.smtpClient.isConnected(),
        server: `${config.SMTP.host}:${config.SMTP.port}`,
      },
    };
  }

  private async findSentMailbox(): Promise<string | null> {
    if (this.sentMailboxName !== undefined) return this.sentMailboxName;
    if (!this.imapClient) throw new Error('IMAP not connected');

    try {
      const boxes = await this.imapClient.getBoxes();
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
      if (byAttrib) {
        this.sentMailboxName = byAttrib;
        return byAttrib;
      }
    } catch (e) {
      console.error('[IMAP] getBoxes failed during sent mailbox detection:', e);
    }

    for (const name of COMMON_SENT_MAILBOX_NAMES) {
      try {
        await this.imapClient.openBox(name, true);
        this.sentMailboxName = name;
        return name;
      } catch {
        // continue
      }
    }
    this.sentMailboxName = null;
    return null;
  }

  private isDateOnly(dateString: string): boolean {
    const patterns = [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{2}-\w{3}-\d{4}$/,
      /^\w{3}\s+\d{1,2},?\s+\d{4}$/,
    ];
    return patterns.some((p) => p.test(dateString.trim()));
  }

  private filterMessagesByDateRange(messages: ExtendedEmailMessage[], startDate?: string, endDate?: string): ExtendedEmailMessage[] {
    if (!startDate && !endDate) return messages;
    let start: Date | null = null;
    let end: Date | null = null;
    if (startDate) {
      start = new Date(startDate);
      if (isNaN(start.getTime())) start = null;
    }
    if (endDate) {
      end = new Date(endDate);
      if (isNaN(end.getTime())) {
        end = null;
      } else if (this.isDateOnly(endDate)) {
        end.setHours(23, 59, 59, 999);
      }
    }
    return messages.filter((msg) => {
      if (!msg.date) return true;
      const msgDate = new Date(msg.date);
      if (isNaN(msgDate.getTime())) return true;
      if (start && msgDate < start) return false;
      if (end && msgDate > end) return false;
      return true;
    });
  }

  async searchInMultipleMailboxes(
    criteria: any[],
    searchType: string,
    searchValue: string,
    startDate = '',
    endDate = '',
    inboxOnly = false,
    limit?: number
  ): Promise<SearchResult> {
    await this.ensureIMAPConnection();
    const sentMailbox = inboxOnly ? null : await this.findSentMailbox();
    const candidateMailboxes = sentMailbox ? ['INBOX', sentMailbox] : ['INBOX'];

    const searchResults: SearchResult = {
      searchType,
      searchValue,
      searchCriteria: criteria,
      mailboxesSearched: [],
      totalMatches: 0,
      messages: [],
    };

    for (const mailboxName of candidateMailboxes) {
      try {
        console.error(`[IMAP] Searching in mailbox: ${mailboxName}`);
        await this.imapClient!.openBox(mailboxName, true);
        const uids = await this.imapClient!.search(criteria);
        console.error(`[IMAP] Found ${uids.length} messages in ${mailboxName}`);

        if (uids.length > 0) {
          const limitedUIDs = limit ? uids.slice(-limit) : uids;
          const messages = await this.imapClient!.fetchMessages(limitedUIDs);
          let messagesWithMailbox: ExtendedEmailMessage[] = messages.map((msg) => ({
            ...msg,
            sourceMailbox: mailboxName,
          }));

          if (startDate || endDate) {
            messagesWithMailbox = this.filterMessagesByDateRange(messagesWithMailbox, startDate, endDate);
          }

          searchResults.messages.push(...messagesWithMailbox);
          searchResults.mailboxesSearched.push({
            mailbox: mailboxName,
            matchingUIDs: messagesWithMailbox.map((m) => m.uid),
            messageCount: messagesWithMailbox.length,
          });
        } else {
          searchResults.mailboxesSearched.push({
            mailbox: mailboxName,
            matchingUIDs: [],
            messageCount: 0,
          });
        }
      } catch (error) {
        console.error(`[IMAP] Error searching in ${mailboxName}:`, error);
        searchResults.mailboxesSearched.push({
          mailbox: mailboxName,
          matchingUIDs: [],
          messageCount: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    searchResults.messages.sort((a: any, b: any) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return dateB.getTime() - dateA.getTime();
    });

    if (limit && searchResults.messages.length > limit) {
      searchResults.messages = searchResults.messages.slice(0, limit);
    }

    searchResults.totalMatches = searchResults.messages.length;
    if (searchResults.totalMatches > 0) {
      let note = `Found and retrieved ${searchResults.totalMatches} messages`;
      if (startDate || endDate) note += ` (filtered by date range)`;
      searchResults.note = note;
    } else {
      searchResults.note = `No messages found in any of the searched mailboxes`;
    }
    if (!sentMailbox) {
      searchResults.warning = 'Could not find sent mailbox - only searched INBOX';
    }
    return searchResults;
  }

  // Public API methods used by tools

  async listMailboxes(): Promise<any> {
    await this.ensureIMAPConnection();
    return this.imapClient!.getBoxes();
  }

  async openMailbox(mailboxName = 'INBOX', readOnly = false): Promise<any> {
    await this.ensureIMAPConnection();
    return this.imapClient!.openBox(mailboxName, readOnly);
  }

  async getMessageCount(): Promise<number> {
    await this.ensureIMAPConnection();
    return this.imapClient!.getMessageCount();
  }

  async getUnseenMessages(limit = 50): Promise<EmailMessage[]> {
    await this.ensureIMAPConnection();
    return this.imapClient!.getUnseenMessages(limit);
  }

  async getRecentMessages(limit = 50): Promise<EmailMessage[]> {
    await this.ensureIMAPConnection();
    return this.imapClient!.getRecentMessages(limit);
  }

  async searchBySender(sender: string, startDate?: string, endDate?: string, inboxOnly = false, limit?: number): Promise<SearchResult> {
    const criteria = [['FROM', sender]];
    return this.searchInMultipleMailboxes(criteria, 'By Sender', sender, startDate, endDate, inboxOnly, limit);
  }

  async searchBySubject(subject: string, startDate?: string, endDate?: string, inboxOnly = false, limit?: number): Promise<SearchResult> {
    const criteria = [['SUBJECT', subject]];
    return this.searchInMultipleMailboxes(criteria, 'By Subject', subject, startDate, endDate, inboxOnly, limit);
  }

  async searchByBody(text: string, startDate?: string, endDate?: string, inboxOnly = false, limit?: number): Promise<SearchResult> {
    const criteria = [['BODY', text]];
    return this.searchInMultipleMailboxes(criteria, 'By Body Text', text, startDate, endDate, inboxOnly, limit);
  }

  async searchSinceDate(date: string, inboxOnly = false, limit?: number): Promise<SearchResult> {
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) throw new Error(`Invalid date format: ${date}`);
    const criteria = [['SINCE', parsedDate]];
    return this.searchInMultipleMailboxes(criteria, 'Since Date', date, '', '', inboxOnly, limit);
  }

  async searchAllMessages(startDate?: string, endDate?: string, inboxOnly = false, limit = 50): Promise<SearchResult> {
    return this.searchInMultipleMailboxes(['ALL'], 'All Messages', '*', startDate, endDate, inboxOnly, limit);
  }

  async getMessages(uids: number[], markSeen = false): Promise<EmailMessage[]> {
    await this.ensureIMAPConnection();
    const messages: EmailMessage[] = [];
    for (const mailboxName of COMMON_MAILBOX_NAMES) {
      if (uids.length === 0) break;
      try {
        await this.imapClient!.openBox(mailboxName, true);
        const fetched = await this.imapClient!.fetchMessages(uids, { markSeen });
        messages.push(...fetched);
        const foundUids = new Set(fetched.map((m) => m.uid));
        uids = uids.filter((uid) => !foundUids.has(uid));
      } catch (e) {
        console.error(`[GetMessages] Failed to search in ${mailboxName}:`, e);
      }
    }
    return messages;
  }

  async getMessage(uid: number, markSeen = false): Promise<EmailMessage | null> {
    await this.ensureIMAPConnection();
    for (const mailboxName of COMMON_MAILBOX_NAMES) {
      try {
        await this.imapClient!.openBox(mailboxName, true);
        const msg = await this.imapClient!.getMessage(uid);
        if (markSeen) {
          try { await this.imapClient!.fetchMessages([uid], { markSeen: true }); } catch {}
        }
        return msg;
      } catch {
        // continue
      }
    }
    return null;
  }

  async deleteMessage(uid: number): Promise<void> {
    await this.ensureIMAPConnection();
    const found = await this.getMessage(uid);
    if (!found) throw new Error(`Message with UID ${uid} not found`);
    await this.imapClient!.deleteMessage(uid);
  }

  async getAttachmentsMeta(uid: number): Promise<AttachmentMeta[] | undefined> {
    const msg = await this.getMessage(uid);
    return msg?.attachments;
  }

  async saveAttachment(uid: number, attachmentIndex?: number): Promise<Array<{ filename: string; content: string; size: number }>> {
    await this.ensureIMAPConnection();
    const allAttachments = await this.imapClient!.fetchMessageAttachments(uid);
    if (allAttachments.length === 0) return [];

    const toSave = attachmentIndex !== undefined ? [allAttachments[attachmentIndex]] : allAttachments;
    const results: Array<{ filename: string; content: string; size: number }> = [];

    for (const att of toSave) {
      results.push({
        filename: att.filename,
        content: att.content.toString('base64'),
        size: att.size,
      });
    }
    return results;
  }

  async sendEmail(args: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    cc?: string;
    bcc?: string;
    attachments?: string[];
  }): Promise<object> {
    await this.ensureSMTPConnection();
    const config = getMailConfig();

    const emailOptions: EmailOptions = {
      to: args.to.split(',').map((e) => e.trim()),
      subject: args.subject,
      text: args.text,
      html: args.html,
      cc: args.cc ? args.cc.split(',').map((e) => e.trim()) : undefined,
      bcc: args.bcc ? args.bcc.split(',').map((e) => e.trim()) : undefined,
    };

    if (!emailOptions.text && !emailOptions.html) {
      throw new Error('Either text or html content is required');
    }

    if (args.attachments && args.attachments.length > 0) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const attachmentList: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
      for (const filePath of args.attachments) {
        const content = await fs.readFile(filePath);
        attachmentList.push({ filename: path.basename(filePath), content });
      }
      emailOptions.attachments = attachmentList;
    }

    const result = await this.smtpClient!.sendMail(emailOptions);
    const sentFolderSaved = await this.saveSentMessage(emailOptions, result.messageId);

    return {
      ...result,
      sentFolderSaved,
    };
  }

  async replyToEmail(args: {
    originalUid: number;
    text: string;
    html?: string;
    replyToAll?: boolean;
    includeOriginal?: boolean;
  }): Promise<object> {
    await this.ensureRequiredConnections(true, true);
    const original = await this.getMessage(args.originalUid);
    if (!original) throw new Error(`Original message with UID ${args.originalUid} not found`);

    const originalFrom = this.extractEmailFromAddress(original.from);
    if (!originalFrom) throw new Error('Could not extract sender email from original message');

    const config = getMailConfig();
    let toRecipients: string[] = [originalFrom];
    let ccRecipients: string[] = [];

    if (args.replyToAll) {
      const originalTo = this.extractEmailsFromAddressField(original.to);
      const originalCc = this.extractEmailsFromAddressField(original.cc);
      const filtered = [...originalTo, ...originalCc].filter(
        (email) => email !== config.IMAP.username && email !== originalFrom
      );
      if (filtered.length > 0) ccRecipients = filtered;
    }

    const subject = `Re: ${original.subject || ''}`;
    const includeOriginal = args.includeOriginal !== false;

    let finalText = args.text;
    let finalHtml = args.html;

    if (includeOriginal) {
      const originalDate = original.date ? new Date(original.date).toLocaleString() : 'Unknown Date';
      const quotedText = `On ${originalDate}, ${original.from || 'Unknown Sender'} wrote:\n${(original.text || '')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')}`;
      finalText = `${args.text || ''}\n\n${quotedText}`;

      if (args.html || original.html) {
        const quotedHtml = `<div style="border-left: 3px solid #ccc; padding-left: 10px; margin-left: 10px; color: #666;"><p><strong>On ${originalDate}, ${original.from || 'Unknown Sender'} wrote:</strong></p><div>${(original.html || original.text || '').replace(/\n/g, '<br>')}</div></div>`;
        finalHtml = `${args.html || args.text?.replace(/\n/g, '<br>') || ''}<br><br>${quotedHtml}`;
      }
    }

    const emailOptions: EmailOptions = {
      to: toRecipients,
      cc: ccRecipients.length > 0 ? ccRecipients : undefined,
      subject,
      text: finalText,
      html: finalHtml,
    };

    const result = await this.smtpClient!.sendMail(emailOptions);
    const sentFolderSaved = await this.saveSentMessage(emailOptions, result.messageId);

    return {
      ...result,
      replyTo: originalFrom,
      replyToAll: args.replyToAll || false,
      sentFolderSaved,
    };
  }

  private async saveSentMessage(emailOptions: EmailOptions, messageId?: string): Promise<boolean> {
    try {
      await this.ensureIMAPConnection();
      const sentFolder = await this.findSentMailbox();
      if (!sentFolder) return false;
      const rawMessage = this.buildRawEmailMessage(emailOptions, messageId);
      await this.imapClient!.saveMessageToFolder(rawMessage, sentFolder);
      return true;
    } catch (error) {
      console.error('[Email] Failed to save to sent folder:', error);
      return false;
    }
  }

  private extractEmailFromAddress(addressField: any): string | null {
    if (!addressField) return null;
    if (typeof addressField === 'string') {
      const match = addressField.match(/<([^>]+)>/) || addressField.match(/([^\s<>>]+@[^\s<>>]+)/);
      return match ? match[1] : addressField;
    }
    return null;
  }

  private extractEmailsFromAddressField(addressField: any): string[] {
    if (!addressField) return [];
    if (typeof addressField === 'string') {
      return addressField.split(',').map((e) => e.trim()).filter(Boolean);
    }
    return [];
  }

  private buildRawEmailMessage(emailOptions: EmailOptions, messageId?: string): string {
    const config = getMailConfig();
    const now = new Date();
    const msgId = messageId || `<${Date.now()}.${Math.random().toString(36)}@${config.IMAP.host}>`;

    let raw = '';
    raw += `Message-ID: ${msgId}\r\n`;
    raw += `Date: ${now.toUTCString()}\r\n`;
    raw += `From: ${config.IMAP.username}\r\n`;
    raw += `To: ${Array.isArray(emailOptions.to) ? emailOptions.to.join(', ') : emailOptions.to}\r\n`;

    if (emailOptions.cc) {
      raw += `Cc: ${Array.isArray(emailOptions.cc) ? emailOptions.cc.join(', ') : emailOptions.cc}\r\n`;
    }
    if (emailOptions.bcc) {
      raw += `Bcc: ${Array.isArray(emailOptions.bcc) ? emailOptions.bcc.join(', ') : emailOptions.bcc}\r\n`;
    }

    raw += `Subject: ${emailOptions.subject}\r\n`;
    raw += `MIME-Version: 1.0\r\n`;

    if (emailOptions.html && emailOptions.text) {
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36)}`;
      raw += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
      raw += `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${emailOptions.text}\r\n\r\n`;
      raw += `--${boundary}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${emailOptions.html}\r\n\r\n`;
      raw += `--${boundary}--\r\n`;
    } else if (emailOptions.html) {
      raw += `Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${emailOptions.html}\r\n`;
    } else {
      raw += `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${emailOptions.text || ''}\r\n`;
    }

    return raw;
  }
}
