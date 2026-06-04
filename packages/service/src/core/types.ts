export interface IMAPConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  tls?: boolean;
  connTimeout?: number;
  authTimeout?: number;
  socketTimeout?: number;
  keepalive?: boolean;
}

export interface SMTPConfig {
  host: string;
  port: number;
  secure?: boolean;
  username: string;
  password: string;
  fromAddress?: string;
}

export interface MailConfig {
  IMAP: {
    host: string;
    port: number;
    username: string;
    password: string;
    tls: boolean;
  };
  SMTP: {
    host: string;
    port: number;
    username: string;
    password: string;
    secure: boolean;
    fromAddress: string;
  };
}

export interface EmailOptions {
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface EmailResult {
  messageId: string;
  response: string;
  accepted: string[];
  rejected: string[];
}

export interface AttachmentMeta {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  contentDisposition?: string;
}

export interface AttachmentData extends AttachmentMeta {
  content: Buffer;
}

export interface EmailMessage {
  uid: number;
  id?: number;
  flags: string[];
  date: string;
  size: number;
  subject: string;
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  text?: string;
  html?: string;
  attachments?: AttachmentMeta[];
}

export interface MailboxInfo {
  name: string;
  messages: {
    total: number;
    new: number;
    unseen: number;
  };
  permFlags: string[];
  uidvalidity: number;
  uidnext: number;
}

export interface SearchResult {
  searchType: string;
  searchValue: string;
  searchCriteria: any[];
  mailboxesSearched: Array<{
    mailbox: string;
    matchingUIDs: number[];
    messageCount: number;
    error?: string;
  }>;
  totalMatches: number;
  messages: EmailMessage[];
  note?: string;
  warning?: string;
}

export interface SendMode {
  mode: 'local' | 'remote';
  remoteUrl: string;
}