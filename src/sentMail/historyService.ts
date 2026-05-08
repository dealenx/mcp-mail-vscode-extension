import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';
import { SentMailRecord } from './types';

function generateFileId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${datePart}_${randomPart}`;
}

export class SentMailHistoryService {
  constructor(private readonly storageUri: vscode.Uri) {}

  async save(record: SentMailRecord): Promise<void> {
    const id = record.id || generateFileId();
    record.id = id;
    const fileUri = vscode.Uri.joinPath(this.storageUri, `${id}.json`);
    const data = new TextEncoder().encode(JSON.stringify(record, null, 2));

    try {
      await vscode.workspace.fs.writeFile(fileUri, data);
      mcpMailOutputChannel.info(`[SentMailHistory] Saved record ${id} to ${fileUri.fsPath}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      mcpMailOutputChannel.error(`[SentMailHistory] Failed to save record ${id}:`, msg);
      throw new Error(`Failed to save sent mail record: ${msg}`);
    }
  }

  async loadAll(): Promise<SentMailRecord[]> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(this.storageUri);
      const jsonFiles = entries
        .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.json'))
        .map(([name]) => name);

      const records: SentMailRecord[] = [];
      for (const fileName of jsonFiles) {
        const fileUri = vscode.Uri.joinPath(this.storageUri, fileName);
        try {
          const bytes = await vscode.workspace.fs.readFile(fileUri);
          const text = new TextDecoder().decode(bytes);
          const record = JSON.parse(text) as SentMailRecord;
          if (!record.id) {
            record.id = fileName.replace('.json', '');
          }
          records.push(record);
        } catch (parseError) {
          const msg = parseError instanceof Error ? parseError.message : String(parseError);
          mcpMailOutputChannel.error(`[SentMailHistory] Failed to parse ${fileName}:`, msg);
        }
      }

      records.sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateB - dateA;
      });

      mcpMailOutputChannel.info(`[SentMailHistory] Loaded ${records.length} records from ${this.storageUri.fsPath}`);
      return records;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      mcpMailOutputChannel.error(`[SentMailHistory] Failed to load all records:`, msg);
      // Если директории нет — возвращаем пустой массив
      if (msg.includes('ENOENT') || msg.includes('no such file')) {
        return [];
      }
      throw new Error(`Failed to load sent mail records: ${msg}`);
    }
  }

  async load(id: string): Promise<SentMailRecord | null> {
    const fileUri = vscode.Uri.joinPath(this.storageUri, `${id}.json`);
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      const text = new TextDecoder().decode(bytes);
      const record = JSON.parse(text) as SentMailRecord;
      if (!record.id) {
        record.id = id;
      }
      mcpMailOutputChannel.info(`[SentMailHistory] Loaded record ${id}`);
      return record;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      mcpMailOutputChannel.error(`[SentMailHistory] Failed to load record ${id}:`, msg);
      return null;
    }
  }
}
