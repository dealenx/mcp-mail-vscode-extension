export interface IMailService {
  ensureIMAPConnection(): Promise<void>;
  ensureSMTPConnection(signal?: AbortSignal): Promise<void>;
  ensureRequiredConnections(requireIMAP?: boolean, requireSMTP?: boolean): Promise<void>;
  disconnectAll(): void;
  getConnectionStatus(): Promise<object>;
  listMailboxes(): Promise<any>;
  openMailbox(mailboxName?: string, readOnly?: boolean): Promise<any>;
  getMessageCount(): Promise<number>;
  getUnseenMessages(limit?: number): Promise<any[]>;
  getRecentMessages(limit?: number): Promise<any[]>;
  searchBySender(sender: string, startDate?: string, endDate?: string, inboxOnly?: boolean, limit?: number): Promise<any>;
  searchBySubject(subject: string, startDate?: string, endDate?: string, inboxOnly?: boolean, limit?: number): Promise<any>;
  searchByBody(text: string, startDate?: string, endDate?: string, inboxOnly?: boolean, limit?: number): Promise<any>;
  searchSinceDate(date: string, inboxOnly?: boolean, limit?: number): Promise<any>;
  searchAllMessages(startDate?: string, endDate?: string, inboxOnly?: boolean, limit?: number): Promise<any>;
  getMessages(uids: number[], markSeen?: boolean): Promise<any[]>;
  getMessage(uid: number, markSeen?: boolean): Promise<any | null>;
  deleteMessage(uid: number): Promise<void>;
  getAttachmentsMeta(uid: number): Promise<any[] | undefined>;
  saveAttachment(uid: number, attachmentIndex?: number): Promise<Array<{ filename: string; content: string; size: number }>>;
  sendEmail(args: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    cc?: string;
    bcc?: string;
    attachments?: string[];
  }, signal?: AbortSignal): Promise<object>;
  replyToEmail(args: {
    originalUid: number;
    text?: string;
    html?: string;
    replyToAll?: boolean;
    includeOriginal?: boolean;
  }, signal?: AbortSignal): Promise<object>;
}