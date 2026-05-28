import type { SMTPConfig, EmailOptions, EmailResult } from './types';
export type { SMTPConfig, EmailOptions, EmailResult };
export declare class SMTPClient {
    private transporter;
    private config;
    constructor(config: SMTPConfig);
    connect(): Promise<void>;
    sendMail(options: EmailOptions, signal?: AbortSignal): Promise<EmailResult>;
    getCurrentUsername(): string | null;
    isConnected(): boolean;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=smtp-client.d.ts.map