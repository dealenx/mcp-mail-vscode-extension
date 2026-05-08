import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';

const SENT_MAIL_DIR = 'sent-emails';

/**
 * Возвращает URI директории для хранения отправленных писем.
 */
export function getSentMailStorageUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, SENT_MAIL_DIR);
}

/**
 * Создаёт директорию хранилища, если она не существует.
 */
export async function ensureStorageDir(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.createDirectory(uri);
    mcpMailOutputChannel.info(`[SentMailStorage] Directory ensured: ${uri.fsPath}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    mcpMailOutputChannel.error(`[SentMailStorage] Failed to ensure directory ${uri.fsPath}:`, msg);
    throw new Error(`Failed to ensure sent-mail storage directory: ${msg}`);
  }
}
