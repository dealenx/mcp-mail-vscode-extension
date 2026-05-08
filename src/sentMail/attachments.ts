import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';

export interface DefaultAttachmentsConfig {
  files: string[];
  enabled: boolean;
}

export function getDefaultAttachmentsConfig(): DefaultAttachmentsConfig {
  const config = vscode.workspace.getConfiguration('mcpMail');
  const files = config.get<string[]>('defaultAttachments', []);
  const enabled = config.get<boolean>('defaultAttachmentsEnabled', true);
  mcpMailOutputChannel.debug('[Attachments] Config loaded:', { fileCount: files.length, enabled });
  return { files, enabled };
}
