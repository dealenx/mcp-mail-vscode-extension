import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';
import { SentMailHistoryService } from './historyService';
import { SentMailRecord } from './types';

function relativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffHour < 24) return `${diffHour} ч назад`;
  if (diffDay === 1) return 'вчера';
  if (diffDay < 7) return `${diffDay} дн назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function makePreview(record: SentMailRecord): string {
  const raw = record.text || record.html || '';
  const text = record.html ? stripHtml(raw) : raw;
  const preview = text.length > 200 ? text.substring(0, 200) + '…' : text;
  if (record.from) {
    return `От: ${record.from}\n${preview}`;
  }
  return preview;
}

export class SentMailTreeItem extends vscode.TreeItem {
  constructor(record: SentMailRecord) {
    const label = record.subject || '(без темы)';
    super(label, vscode.TreeItemCollapsibleState.None);
    const fromPart = record.from ? `${record.from} → ` : '';
    this.description = `${fromPart}${record.to}  •  ${relativeTime(record.date)}`;
    this.tooltip = makePreview(record);
    this.iconPath = new vscode.ThemeIcon('mail');
    this.command = {
      command: 'mcpMail.openSentMail',
      title: 'Открыть отправленное письмо',
      arguments: [record.id],
    };
  }
}

export class SentMailTreeDataProvider implements vscode.TreeDataProvider<SentMailTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SentMailTreeItem | undefined | null | void> =
    new vscode.EventEmitter<SentMailTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SentMailTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private refreshInterval: NodeJS.Timeout | null = null;

  constructor(private readonly historyService: SentMailHistoryService) {
    this.startAutoRefresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private startAutoRefresh(): void {
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, 7000);
  }

  dispose(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  getTreeItem(element: SentMailTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SentMailTreeItem): Promise<SentMailTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    try {
      const records = await this.historyService.loadAll();
      mcpMailOutputChannel.info(`[SentMailTreeView] Refreshed with ${records.length} items`);
      return records.map((record) => new SentMailTreeItem(record));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      mcpMailOutputChannel.error('[SentMailTreeView] Failed to load children:', msg);
      return [];
    }
  }
}
