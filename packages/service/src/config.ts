export interface ConnectRequest {
  imap: {
    host: string;
    port: number;
    username: string;
    password: string;
    tls?: boolean;
  };
  smtp: {
    host: string;
    port: number;
    username: string;
    password: string;
    secure?: boolean;
  };
}

export interface SendEmailRequest {
  sessionId: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  cc?: string;
  bcc?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
}

export interface ReplyEmailRequest {
  sessionId: string;
  originalUid: number;
  text?: string;
  html?: string;
  replyToAll?: boolean;
  includeOriginal?: boolean;
}