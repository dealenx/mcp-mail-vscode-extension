import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';

export interface SignatureConfig {
  html: string;
  enabled: boolean;
}

export function getSignatureConfig(): SignatureConfig {
  const config = vscode.workspace.getConfiguration('mcpMail');
  // Fallback to old fields if new 'signature' is empty
  const html = config.get<string>('signature', '').trim() || config.get<string>('signatureHtml', '').trim();
  const enabled = config.get<boolean>('signatureEnabled', true);
  mcpMailOutputChannel.debug('[Signature] Config loaded:', { htmlLength: html.length, enabled });
  return { html, enabled };
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
