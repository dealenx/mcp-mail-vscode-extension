import * as vscode from 'vscode';

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
  };
}

export function getMailConfig(): MailConfig {
  const cfg = vscode.workspace.getConfiguration('mcpMail');

  const host = cfg.get<string>('imapHost');
  const port = cfg.get<number>('imapPort');
  const user = cfg.get<string>('accountLogin');
  const pass = cfg.get<string>('accountPassword');
  const tls = cfg.get<boolean>('imapSecure');

  const smtpHost = cfg.get<string>('smtpHost');
  const smtpPort = cfg.get<number>('smtpPort');
  const smtpSecure = cfg.get<boolean>('smtpSecure');

  if (!host || !port || !user || !pass || tls === undefined) {
    throw new Error(
      'Настройки MCP Mail заполнены не полностью. Укажите все параметры mcpMail.* в настройках VS Code.'
    );
  }
  if (!smtpHost || !smtpPort || smtpSecure === undefined) {
    throw new Error(
      'Настройки SMTP заполнены не полностью. Укажите все параметры mcpMail.* в настройках VS Code.'
    );
  }

  return {
    IMAP: {
      host,
      port,
      username: user,
      password: pass,
      tls,
    },
    SMTP: {
      host: smtpHost,
      port: smtpPort,
      username: user,
      password: pass,
      secure: smtpSecure,
    },
  };
}
