import * as fs from 'fs/promises';
import * as path from 'path';
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
  constructor(private readonly storagePath: string) {}

  async save(record: SentMailRecord): Promise<void> {
    const id = record.id || generateFileId();
    record.id = id;
    const filePath = path.join(this.storagePath, `${id}.json`);
    const data = Buffer.from(JSON.stringify(record, null, 2), 'utf-8');

    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.writeFile(filePath, data);
      mcpMailOutputChannel.info(`[SentMailHistory] Saved record ${id} to ${filePath}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      mcpMailOutputChannel.error(`[SentMailHistory] Failed to save record ${id}:`, msg);
      throw new Error(`Failed to save sent mail record: ${msg}`);
    }
  }

  async loadAll(): Promise<SentMailRecord[]> {
    try {
      const entries = await fs.readdir(this.storagePath, { withFileTypes: true });
      const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => e.name);

      const records: SentMailRecord[] = [];
      for (const fileName of jsonFiles) {
        const filePath = path.join(this.storagePath, fileName);
        try {
          const text = await fs.readFile(filePath, 'utf-8');
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

      mcpMailOutputChannel.info(`[SentMailHistory] Loaded ${records.length} records from ${this.storagePath}`);
      return records;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      mcpMailOutputChannel.error(`[SentMailHistory] Failed to load all records:`, msg);
      if (msg.includes('ENOENT') || msg.includes('no such file')) {
        return [];
      }
      throw new Error(`Failed to load sent mail records: ${msg}`);
    }
  }

  async load(id: string): Promise<SentMailRecord | null> {
    const filePath = path.join(this.storagePath, `${id}.json`);
    try {
      const text = await fs.readFile(filePath, 'utf-8');
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
