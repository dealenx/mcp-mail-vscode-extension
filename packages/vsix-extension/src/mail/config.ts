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
    fromAddress: string;
  };
  sendMode: 'local' | 'remote';
  remoteUrl: string;
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

  const sendMode = cfg.get<'local' | 'remote'>('sendMode', 'local');
  const remoteUrl = cfg.get<string>('remoteUrl', 'https://smtp-service.mimikkai.ru');

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

  const imapUsername = cfg.get<string>('imapUsername') || user;
  const fromAddress  = cfg.get<string>('fromAddress')  || user;

  console.error(`[Config] Resolved credentials: imapUsername=${imapUsername}, smtpUsername=${user}, fromAddress=${fromAddress}`);

  return {
    IMAP: {
      host,
      port,
      username: imapUsername,
      password: pass,
      tls,
    },
    SMTP: {
      host: smtpHost,
      port: smtpPort,
      username: user,
      password: pass,
      secure: smtpSecure,
      fromAddress,
    },
    sendMode,
    remoteUrl: remoteUrl || 'https://smtp-service.mimikkai.ru',
  };
}

export function getSendMode(): 'local' | 'remote' {
  const cfg = vscode.workspace.getConfiguration('mcpMail');
  return cfg.get<'local' | 'remote'>('sendMode', 'local');
}

export function getRemoteUrl(): string {
  const cfg = vscode.workspace.getConfiguration('mcpMail');
  return cfg.get<string>('remoteUrl', 'https://smtp-service.mimikkai.ru') || 'https://smtp-service.mimikkai.ru';
}
