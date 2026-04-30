"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SMTPClient = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
class SMTPClient {
    transporter = null;
    config;
    constructor(config) {
        this.config = config;
    }
    async connect() {
        this.transporter = nodemailer_1.default.createTransport({
            host: this.config.host,
            port: this.config.port,
            secure: this.config.secure || false,
            auth: {
                user: this.config.username,
                pass: this.config.password,
            },
        });
        // 验证连接
        try {
            if (this.transporter) {
                await this.transporter.verify();
            }
        }
        catch (error) {
            throw new Error(`SMTP connection failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async sendMail(options) {
        if (!this.transporter) {
            throw new Error('SMTP client not connected');
        }
        const mailOptions = {
            from: options.from || this.config.username,
            to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
            cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
            bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
            subject: options.subject,
            text: options.text,
            html: options.html,
            attachments: options.attachments,
        };
        try {
            const result = await this.transporter.sendMail(mailOptions);
            return {
                messageId: result.messageId,
                response: result.response,
                accepted: result.accepted || [],
                rejected: result.rejected || [],
            };
        }
        catch (error) {
            throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    getCurrentUsername() {
        return this.config?.username || null;
    }
    isConnected() {
        return this.transporter !== null;
    }
    async disconnect() {
        if (this.transporter) {
            try {
                this.transporter.close();
                console.error('[SMTP] Disconnected successfully');
            }
            catch (error) {
                console.error('[SMTP] Error during disconnect:', error instanceof Error ? error.message : String(error));
                // 即使关闭时出错，我们仍然要清理引用
            }
            finally {
                this.transporter = null;
            }
        }
    }
}
exports.SMTPClient = SMTPClient;
//# sourceMappingURL=smtp-client.js.map