import * as vscode from 'vscode';
import { getMailConfig } from './mail/config';
import { SMTPClient } from './mail/smtp-client';

export class MailSidebarProvider implements vscode.TreeDataProvider<MailSidebarItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<MailSidebarItem | undefined | null | void> =
    new vscode.EventEmitter<MailSidebarItem | undefined | null | void>();
  onDidChangeTreeData: vscode.Event<MailSidebarItem | undefined | null | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MailSidebarItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<MailSidebarItem[]> {
    return Promise.resolve([
      new MailSidebarItem(
        'Проверить SMTP конфиг',
        {
          command: 'mcpMail.checkSmtpConfig',
          title: 'Проверить SMTP конфиг',
        },
        vscode.TreeItemCollapsibleState.None,
        '$(testing-passed-icon)',
      ),
      new MailSidebarItem(
        'Открыть настройки',
        {
          command: 'mcpMail.openSettings',
          title: 'Открыть настройки',
        },
        vscode.TreeItemCollapsibleState.None,
        '$(gear)',
      ),
    ]);
  }
}

export class MailSidebarItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly command?: { command: string; title: string; arguments?: any[] },
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly icon: string = ''
  ) {
    super(label, collapsibleState);
    this.tooltip = label;
    if (command) {
      this.command = command;
    }
    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon.replace('$(', '').replace(')', ''));
    }
  }
}

export function registerSidebarCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('mcpMail.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'mcpMail');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mcpMail.checkSmtpConfig', async () => {
      try {
        const config = getMailConfig();
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Проверка SMTP соединения...',
            cancellable: false,
          },
          async () => {
            const client = new SMTPClient(config.SMTP);
            await client.connect();
            vscode.window.showInformationMessage(
              `✅ SMTP подключение успешно!\nСервер: ${config.SMTP.host}:${config.SMTP.port}`
            );
            await client.disconnect();
          }
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`❌ Ошибка SMTP: ${msg}`);
      }
    })
  );
}
