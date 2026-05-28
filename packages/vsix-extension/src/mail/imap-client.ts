import Imap from 'imap';
import { EventEmitter } from 'events';
import { simpleParser } from 'mailparser';

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

export class IMAPClient extends EventEmitter {
  private imap: Imap | null = null;
  private config: IMAPConfig;
  private connected = false;
  private authenticated = false;
  private currentBox: string | null = null;

  constructor(config: IMAPConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.error(`[IMAP] Connecting to ${this.config.host}:${this.config.port} (TLS: ${this.config.tls})`);

      const imapConfig: Imap.Config & { socketTimeout?: number } = {
        user: this.config.username,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls || false,
        tlsOptions: {
          rejectUnauthorized: false,
          servername: this.config.host,
        },
        connTimeout: this.config.connTimeout ?? 60000,
        authTimeout: this.config.authTimeout ?? 30000,
        socketTimeout: this.config.socketTimeout ?? 60000,
        keepalive: this.config.keepalive !== false,
      };

      this.imap = new Imap(imapConfig);

      this.imap.once('ready', async () => {
        console.error('[IMAP] Connection ready');
        this.connected = true;
        this.authenticated = true;
        try {
          await this.openBox('INBOX', true);
          console.error('[IMAP] Auto-opened INBOX');
        } catch (error) {
          console.error('[IMAP] Failed to auto-open INBOX:', error instanceof Error ? error.message : String(error));
        }
        resolve();
      });

      this.imap.once('error', (error: Error) => {
        console.error('[IMAP] Connection error:', error.message);
        reject(new Error(`IMAP connection failed: ${error.message}`));
      });

      this.imap.once('end', () => {
        console.error('[IMAP] Connection ended');
        this.connected = false;
        this.authenticated = false;
        this.currentBox = null;
      });

      this.imap.connect();
    });
  }

  async openBox(boxName: string = 'INBOX', readOnly: boolean = false): Promise<MailboxInfo> {
    if (!this.imap || !this.authenticated) {
      throw new Error('Not connected or authenticated');
    }

    return new Promise((resolve, reject) => {
      this.imap!.openBox(boxName, readOnly, (error, box) => {
        if (error) {
          console.error(`[IMAP] Failed to open box ${boxName}:`, error.message);
          reject(new Error(`Failed to open mailbox: ${error.message}`));
          return;
        }

        console.error(`[IMAP] Opened box ${boxName}`);
        this.currentBox = boxName;

        const mailboxInfo: MailboxInfo = {
          name: boxName,
          messages: {
            total: box.messages.total,
            new: box.messages.new,
            unseen: box.messages.unseen,
          },
          permFlags: box.permFlags,
          uidvalidity: box.uidvalidity,
          uidnext: box.uidnext,
        };

        resolve(mailboxInfo);
      });
    });
  }

  async getBoxes(): Promise<any> {
    if (!this.imap || !this.authenticated) {
      throw new Error('Not connected or authenticated');
    }

    return new Promise((resolve, reject) => {
      this.imap!.getBoxes((error, boxes) => {
        if (error) {
          reject(new Error(`Failed to get boxes: ${error.message}`));
          return;
        }
        resolve(boxes);
      });
    });
  }

  async search(criteria: any[] = ['ALL']): Promise<number[]> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }

    if (!this.currentBox) {
      await this.openBox('INBOX', true);
    }

    return new Promise((resolve, reject) => {
      this.imap!.search(criteria, (error, results) => {
        if (error) {
          console.error('[IMAP] Search failed:', error.message);
          reject(new Error(`Search failed: ${error.message}`));
          return;
        }

        console.error(`[IMAP] Search found ${results.length} messages`);
        resolve(results);
      });
    });
  }

  async fetchMessages(uids: number[], options: any = {}): Promise<EmailMessage[]> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }

    if (!this.currentBox) {
      await this.openBox('INBOX', true);
    }

    const fetchOptions = {
      bodies: options.bodies || ['HEADER', 'TEXT'],
      struct: options.struct !== false,
      envelope: options.envelope !== false,
      markSeen: options.markSeen || false,
      ...options,
    };

    return new Promise((resolve, reject) => {
      const messages: EmailMessage[] = [];
      const pendingMessages: Map<
        number,
        {
          message: Partial<EmailMessage>;
          headers: Record<string, string>;
          body: string;
          rawBuffer: Buffer;
        }
      > = new Map();

      if (uids.length === 0) {
        resolve(messages);
        return;
      }

      const fetch = this.imap!.fetch(uids, fetchOptions);

      fetch.on('message', (msg, seqno) => {
        console.error(`[IMAP] Processing message ${seqno}`);

        let headers: Record<string, string> = {};
        let body = '';
        const rawChunks: Buffer[] = [];
        const message: Partial<EmailMessage> = {
          uid: 0,
          id: seqno,
          flags: [],
          date: '',
          size: 0,
        };

        msg.on('body', (stream, info) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            rawChunks.push(chunk);
          });

          stream.once('end', () => {
            const buffer = Buffer.concat(chunks);

            if (info.which === 'HEADER') {
              const bufferString = buffer.toString('utf8');
              headers = this.parseHeaders(bufferString);
            } else if (info.which === 'TEXT') {
              body = buffer.toString('utf8');
            }
          });
        });

        msg.once('attributes', (attrs) => {
          message.uid = attrs.uid;
          message.flags = attrs.flags || [];
          const date = attrs.date || new Date();
          message.date = (date instanceof Date ? date : new Date(date)).toISOString();
          message.size = attrs.size || 0;
        });

        msg.once('end', () => {
          console.error(`[IMAP] Message ${seqno} processed, preparing for parse`);
          pendingMessages.set(seqno, {
            message,
            headers,
            body,
            rawBuffer: Buffer.concat(rawChunks),
          });
        });
      });

      fetch.once('error', (error) => {
        console.error('[IMAP] Fetch error:', error.message);
        reject(new Error(`Fetch failed: ${error.message}`));
      });

      fetch.once('end', async () => {
        console.error(`[IMAP] Fetch completed, parsing ${pendingMessages.size} messages`);

        for (const [seqno, data] of pendingMessages) {
          try {
            const parsedMail = await simpleParser(data.rawBuffer);

            const extractEmailAddress = (addressObj: any): string => {
              if (!addressObj) return '';
              if (Array.isArray(addressObj)) {
                return addressObj.map((addr) => this.extractSingleEmail(addr)).filter(Boolean).join(', ');
              }
              return this.extractSingleEmail(addressObj);
            };

            const attachmentsMeta: AttachmentMeta[] = (parsedMail.attachments || []).map((att, idx) => ({
              index: idx,
              filename:
                att.filename ||
                `attachment_${idx + 1}${att.contentType ? '.' + att.contentType.split('/')[1]?.split(';')[0] || '' : ''}`,
              contentType: att.contentType || 'application/octet-stream',
              size: att.size || (att.content ? att.content.length : 0),
              contentId: att.contentId || undefined,
              contentDisposition: att.contentDisposition || undefined,
            }));

            messages.push({
              ...data.message,
              subject: parsedMail.subject || 'No Subject',
              from: extractEmailAddress(parsedMail.from),
              to: extractEmailAddress(parsedMail.to),
              cc: extractEmailAddress(parsedMail.cc) || undefined,
              bcc: extractEmailAddress(parsedMail.bcc) || undefined,
              text: parsedMail.text,
              html: parsedMail.html,
              attachments: attachmentsMeta.length > 0 ? attachmentsMeta : undefined,
            } as EmailMessage);
          } catch (error) {
            console.error(`[IMAP] Failed to parse message ${seqno}:`, error);
            messages.push({
              ...data.message,
              subject: data.headers['subject'] || 'Parse Failed',
              from: data.headers['from'] || '',
              to: data.headers['to'] || '',
              cc: data.headers['cc'] || undefined,
              bcc: data.headers['bcc'] || undefined,
              text: data.body.trim(),
            } as EmailMessage);
          }
        }

        console.error(`[IMAP] All messages parsed, returning ${messages.length} messages`);
        resolve(messages);
      });
    });
  }

  private extractSingleEmail(addr: any): string {
    if (!addr) return '';
    if (typeof addr === 'string') {
      const emailMatch = addr.match(/<([^>]+)>/) || addr.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      return emailMatch ? emailMatch[1] : addr;
    }
    if (addr && typeof addr === 'object') {
      if (addr.address) return addr.address;
      if (addr.text) {
        const emailMatch = addr.text.match(/<([^>]+)>/) || addr.text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        return emailMatch ? emailMatch[1] : addr.text;
      }
    }
    return '';
  }

  async getMessage(uid: number): Promise<EmailMessage> {
    const messages = await this.fetchMessages([uid]);
    if (messages.length === 0) {
      throw new Error(`Message with UID ${uid} not found`);
    }
    return messages[0];
  }

  async fetchMessageAttachments(uid: number): Promise<AttachmentData[]> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }

    if (!this.currentBox) {
      await this.openBox('INBOX', true);
    }

    return new Promise((resolve, reject) => {
      const rawChunks: Buffer[] = [];

      const fetch = this.imap!.fetch([uid], {
        bodies: ['HEADER', 'TEXT'],
        struct: true,
        markSeen: false,
      });

      fetch.on('message', (msg) => {
        msg.on('body', (stream) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            rawChunks.push(chunk);
          });
        });
      });

      fetch.once('error', (error) => {
        reject(new Error(`Fetch attachments failed: ${error.message}`));
      });

      fetch.once('end', async () => {
        try {
          const rawBuffer = Buffer.concat(rawChunks);
          const parsedMail = await simpleParser(rawBuffer);

          const attachments: AttachmentData[] = (parsedMail.attachments || []).map((att, idx) => ({
            index: idx,
            filename:
              att.filename ||
              `attachment_${idx + 1}${att.contentType ? '.' + att.contentType.split('/')[1]?.split(';')[0] || '' : ''}`,
            contentType: att.contentType || 'application/octet-stream',
            size: att.size || (att.content ? att.content.length : 0),
            contentId: att.contentId || undefined,
            contentDisposition: att.contentDisposition || undefined,
            content: att.content,
          }));

          resolve(attachments);
        } catch (error) {
          reject(new Error(`Failed to parse attachments: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
    });
  }

  async deleteMessage(uid: number): Promise<void> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }

    await this.openBox(this.currentBox || 'INBOX', false);

    return new Promise((resolve, reject) => {
      this.imap!.addFlags(uid, ['\\Deleted'], (error) => {
        if (error) {
          console.error(`[IMAP] Failed to mark message ${uid} as deleted:`, error.message);
          reject(new Error(`Failed to delete message: ${error.message}`));
          return;
        }

        console.error(`[IMAP] Message ${uid} marked for deletion`);

        this.imap!.expunge((expungeError) => {
          if (expungeError) {
            console.error('[IMAP] Failed to expunge:', expungeError.message);
            reject(new Error(`Failed to expunge deleted messages: ${expungeError.message}`));
            return;
          }

          console.error(`[IMAP] Message ${uid} deleted successfully`);
          resolve();
        });
      });
    });
  }

  async getMessageCount(): Promise<number> {
    const boxInfo = await this.openBox('INBOX', true);
    return boxInfo.messages.total;
  }

  async getUnseenMessages(limit: number = 50): Promise<EmailMessage[]> {
    await this.openBox('INBOX', true);
    const unseenUids = await this.search(['UNSEEN']);
    const limitedUids = unseenUids.slice(-limit);
    return this.fetchMessages(limitedUids);
  }

  async getRecentMessages(limit: number = 50): Promise<EmailMessage[]> {
    await this.openBox('INBOX', true);
    const allUids = await this.search(['ALL']);
    const limitedUids = allUids.slice(-limit);
    return this.fetchMessages(limitedUids);
  }

  private parseHeaders(headerText: string): Record<string, string> {
    const headers: Record<string, string> = {};
    const lines = headerText.split('\r\n');
    let currentHeader = '';
    let currentValue = '';

    for (const line of lines) {
      if (line.match(/^\s/) && currentHeader) {
        currentValue += ' ' + line.trim();
      } else {
        if (currentHeader) {
          headers[currentHeader.toLowerCase()] = currentValue.trim();
        }

        const colonIndex = line.indexOf(':');
        if (colonIndex > -1) {
          currentHeader = line.substring(0, colonIndex).trim();
          currentValue = line.substring(colonIndex + 1).trim();
        } else {
          currentHeader = '';
          currentValue = '';
        }
      }
    }

    if (currentHeader) {
      headers[currentHeader.toLowerCase()] = currentValue.trim();
    }

    return headers;
  }

  async disconnect(): Promise<void> {
    if (!this.imap) {
      return;
    }

    if (!this.connected) {
      this.imap = null;
      this.authenticated = false;
      this.currentBox = null;
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error('[IMAP] Disconnect timeout, forcing cleanup');
        this.connected = false;
        this.authenticated = false;
        this.currentBox = null;
        this.imap = null;
        resolve();
      }, 5000);

      this.imap!.once('end', () => {
        clearTimeout(timeout);
        console.error('[IMAP] Disconnected');
        this.connected = false;
        this.authenticated = false;
        this.currentBox = null;
        this.imap = null;
        resolve();
      });

      this.imap!.once('error', (error: Error) => {
        clearTimeout(timeout);
        console.error('[IMAP] Disconnect error:', error.message);
        this.connected = false;
        this.authenticated = false;
        this.currentBox = null;
        this.imap = null;
        resolve();
      });

      try {
        this.imap!.end();
      } catch (error) {
        clearTimeout(timeout);
        console.error('[IMAP] Error calling end():', error);
        this.connected = false;
        this.authenticated = false;
        this.currentBox = null;
        this.imap = null;
        resolve();
      }
    });
  }

  isConnected(): boolean {
    return this.connected && this.authenticated;
  }

  getCurrentBox(): string | null {
    return this.currentBox;
  }

  getCurrentUsername(): string | null {
    return this.config?.username || null;
  }

  async saveMessageToFolder(messageContent: string, folderName: string): Promise<void> {
    if (!this.connected) {
      throw new Error('IMAP client is not connected');
    }

    return new Promise((resolve, reject) => {
      this.imap!.openBox(folderName, false, (err) => {
        if (err) {
          reject(new Error(`Failed to open folder ${folderName}: ${err.message}`));
          return;
        }
        this.saveToOpenedFolder(messageContent, folderName, resolve, reject);
      });
    });
  }

  private saveToOpenedFolder(
    messageContent: string,
    folderName: string,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    this.imap!.append(messageContent, { mailbox: folderName }, (err) => {
      if (err) {
        console.error(`[IMAP] Failed to save message to ${folderName}:`, err.message);
        reject(new Error(`Failed to save message to ${folderName}: ${err.message}`));
      } else {
        console.log(`[IMAP] Message successfully saved to ${folderName}`);
        resolve();
      }
    });
  }
}
