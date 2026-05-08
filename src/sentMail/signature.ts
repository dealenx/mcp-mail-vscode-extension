import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';

export interface SignatureConfig {
  text: string;
  html: string;
  enabled: boolean;
}

export function getSignatureConfig(): SignatureConfig {
  const config = vscode.workspace.getConfiguration('mcpMail');
  const text = config.get<string>('signatureText', '').trim();
  const html = config.get<string>('signatureHtml', '').trim();
  const enabled = config.get<boolean>('signatureEnabled', true);
  mcpMailOutputChannel.debug('[Signature] Config loaded:', { textLength: text.length, htmlLength: html.length, enabled });
  return { text, html, enabled };
}
