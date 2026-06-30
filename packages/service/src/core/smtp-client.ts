import nodemailer, { Transporter } from 'nodemailer';
import type { SMTPConfig, EmailOptions, EmailResult } from './types';

export type { SMTPConfig, EmailOptions, EmailResult };

export class SMTPClient {
  private transporter: Transporter | null = null;
  private config: SMTPConfig;

  constructor(config: SMTPConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure || false,
      auth: {
        user: this.config.username,
        pass: this.config.password,
      },
    });

    try {
      if (this.transporter) {
        await this.transporter.verify();
      }
    } catch (error) {
      throw new Error(`SMTP connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async sendMail(options: EmailOptions, signal?: AbortSignal): Promise<EmailResult> {
    if (!this.transporter) {
      throw new Error('SMTP client not connected');
    }

    if (signal?.aborted) {
      throw new Error('Send mail cancelled before starting');
    }

    const fromHeader = options.from || this.config.fromAddress || this.config.username;
    console.error(`[FIX-FROMNAME] sendMail from header: ${fromHeader}`);

    const mailOptions = {
      from: fromHeader,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    };

    const SEND_TIMEOUT_MS = 30000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const timeoutOrCancelPromise = new Promise<never>((_, reject) => {
      const onAbort = () => {
        cancelled = true;
        reject(new Error('Send mail was cancelled'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        reject(new Error(`Send mail timed out after ${SEND_TIMEOUT_MS}ms`));
      }, SEND_TIMEOUT_MS);
      if (timer) timer.unref?.();
    });

    try {
      const sendPromise = this.transporter.sendMail(mailOptions);
      const result = await Promise.race([sendPromise, timeoutOrCancelPromise]);

      return {
        messageId: result.messageId,
        response: result.response,
        accepted: result.accepted || [],
        rejected: result.rejected || [],
      };
    } catch (error) {
      if (cancelled || signal?.aborted) {
        try { this.transporter.close(); } catch {}
        this.transporter = null;
        throw new Error('Send mail was cancelled');
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('timed out')) {
        try { this.transporter.close(); } catch {}
        this.transporter = null;
      }
      throw new Error(`Failed to send email: ${errMsg}`);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  getCurrentUsername(): string | null {
    return this.config?.username || null;
  }

  isConnected(): boolean {
    return this.transporter !== null;
  }

  async disconnect(): Promise<void> {
    if (this.transporter) {
      try {
        this.transporter.close();
        console.error('[SMTP] Disconnected successfully');
      } catch (error) {
        console.error('[SMTP] Error during disconnect:', error instanceof Error ? error.message : String(error));
      } finally {
        this.transporter = null;
      }
    }
  }
}