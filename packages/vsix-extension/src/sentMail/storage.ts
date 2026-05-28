import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';

const SENT_MAIL_DIR = 'sent-emails';

/**
 * Возвращает путь к директории для хранения отправленных писем.
 */
export function getSentMailStoragePath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.globalStorageUri, SENT_MAIL_DIR).fsPath;
}

/**
 * Создаёт директорию хранилища, если она не существует.
 */
export async function ensureStorageDir(dirPath: string): Promise<void> {
  try {
    const fs = await import('fs/promises');
    await fs.mkdir(dirPath, { recursive: true });
    mcpMailOutputChannel.info(`[SentMailStorage] Directory ensured: ${dirPath}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    mcpMailOutputChannel.error(`[SentMailStorage] Failed to ensure directory ${dirPath}:`, msg);
    throw new Error(`Failed to ensure sent-mail storage directory: ${msg}`);
  }
}
