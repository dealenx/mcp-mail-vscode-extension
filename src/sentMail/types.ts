export interface SentMailRecord {
  id?: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  cc?: string;
  bcc?: string;
  attachments?: string[];
  date: string;
  messageId?: string;
}
