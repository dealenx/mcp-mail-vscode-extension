import * as vscode from 'vscode';
import { mcpMailOutputChannel } from './logger';
import { getSendMode, getRemoteUrl } from './mail/config';

export class SendModeProvider implements vscode.TreeDataProvider<SendModeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SendModeItem | undefined | null | void> =
    new vscode.EventEmitter<SendModeItem | undefined | null | void>();
  onDidChangeTreeData: vscode.Event<SendModeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SendModeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SendModeItem): Thenable<SendModeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    const sendMode = getSendMode();
    const remoteUrl = getRemoteUrl();

    const localItem = new SendModeItem(
      '🖥️ Локальный режим',
      'mcpMail.setLocalMode',
      sendMode === 'local'
        ? '✅ Активно — подключение напрямую через IMAP/SMTP'
        : 'Нажмите, чтобы переключиться на локальный режим (IMAP/SMTP напрямую)',
      vscode.TreeItemCollapsibleState.None,
      'device-desktop'
    );
    if (sendMode === 'local') {
      localItem.description = '✓';
      localItem.iconPath = new vscode.ThemeIcon('device-desktop', new vscode.ThemeColor('problemsInfoIcon.foreground'));
    }

    const remoteItem = new SendModeItem(
      '🌐 Удалённый режим',
      'mcpMail.setRemoteMode',
      sendMode === 'remote'
        ? `✅ Активно — подключение через удалённый сервис (${remoteUrl})`
        : `Нажмите, чтобы переключиться на удалённый режим (${remoteUrl})`,
      vscode.TreeItemCollapsibleState.None,
      'globe'
    );
    if (sendMode === 'remote') {
      remoteItem.description = '✓';
      remoteItem.iconPath = new vscode.ThemeIcon('globe', new vscode.ThemeColor('problemsInfoIcon.foreground'));
    }

    return Promise.resolve([localItem, remoteItem]);
  }
}

export class SendModeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly commandId: string,
    public readonly tooltipText: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly iconName: string
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltipText;
    this.command = {
      command: commandId,
      title: label,
    };
    this.iconPath = new vscode.ThemeIcon(iconName);
  }
}