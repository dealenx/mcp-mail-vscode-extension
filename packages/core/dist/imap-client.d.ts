import { EventEmitter } from 'events';
import type { IMAPConfig, EmailMessage, AttachmentMeta, AttachmentData, MailboxInfo } from './types';
export type { IMAPConfig, EmailMessage, AttachmentMeta, AttachmentData, MailboxInfo };
export declare class IMAPClient extends EventEmitter {
    private imap;
    private config;
    private connected;
    private authenticated;
    private currentBox;
    constructor(config: IMAPConfig);
    connect(): Promise<void>;
    openBox(boxName?: string, readOnly?: boolean): Promise<MailboxInfo>;
    getBoxes(): Promise<any>;
    search(criteria?: any[]): Promise<number[]>;
    fetchMessages(uids: number[], options?: any): Promise<EmailMessage[]>;
    private extractSingleEmail;
    getMessage(uid: number): Promise<EmailMessage>;
    fetchMessageAttachments(uid: number): Promise<AttachmentData[]>;
    deleteMessage(uid: number): Promise<void>;
    getMessageCount(): Promise<number>;
    getUnseenMessages(limit?: number): Promise<EmailMessage[]>;
    getRecentMessages(limit?: number): Promise<EmailMessage[]>;
    private parseHeaders;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    getCurrentBox(): string | null;
    getCurrentUsername(): string | null;
    saveMessageToFolder(messageContent: string, folderName: string): Promise<void>;
    private saveToOpenedFolder;
}
//# sourceMappingURL=imap-client.d.ts.map