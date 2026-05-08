import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';

export interface SignatureConfig {
  html: string;
  enabled: boolean;
}

export function getSignatureConfig(): SignatureConfig {
  const config = vscode.workspace.getConfiguration('mcpMail');
  const html = config.get<string>('signature', '').trim();
  const enabled = config.get<boolean>('signatureEnabled', true);
  mcpMailOutputChannel.debug('[Signature] Config loaded:', { htmlLength: html.length, enabled });
  return { html, enabled };
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
