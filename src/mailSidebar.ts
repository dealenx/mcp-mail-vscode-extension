import * as vscode from 'vscode';
import { mcpMailOutputChannel } from './logger';

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

  getChildren(element?: MailSidebarItem): Thenable<MailSidebarItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    mcpMailOutputChannel.info('[MCP Mail] getChildren called (root)');
    try {
      const items = [
        new MailSidebarItem(
          'Проверь подключение',
          'mcpMail.checkConnection',
          'Проверка подключения IMAP/SMTP',
          vscode.TreeItemCollapsibleState.None,
          'plug'
        ),
        new MailSidebarItem(
          'Открыть настройки',
          'mcpMail.openSettings',
          'Настройки MCP Mail',
          vscode.TreeItemCollapsibleState.None,
          'settings-gear'
        ),
      ];
      mcpMailOutputChannel.info('[MCP Mail] Returning', items.length, 'sidebar items');
      return Promise.resolve(items);
    } catch (error) {
      mcpMailOutputChannel.error('[MCP Mail] getChildren error:', String(error));
      return Promise.resolve([]);
    }
  }
}

export class MailSidebarItem extends vscode.TreeItem {
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

export function registerSidebarCommands(context: vscode.ExtensionContext): void {
  mcpMailOutputChannel.info('[MCP Mail] Registering sidebar commands...');

  context.subscriptions.push(
    vscode.commands.registerCommand('mcpMail.openSettings', () => {
      mcpMailOutputChannel.info('[MCP Mail] openSettings command triggered');
      vscode.commands.executeCommand('workbench.action.openSettings', 'mcpMail');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mcpMail.checkConnection', async () => {
      mcpMailOutputChannel.info('[MCP Mail] checkConnection command triggered');
      try {
        const { getMailConfig } = require('./mail/config');
        const { IMAPClient } = require('./mail/imap-client');
        const { SMTPClient } = require('./mail/smtp-client');

        const config = getMailConfig();
        mcpMailOutputChannel.info('[MCP Mail] Config loaded:', config.IMAP.host, config.SMTP.host);

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Проверка подключения к почтовым серверам...',
            cancellable: false,
          },
          async () => {
            const results: string[] = [];

            mcpMailOutputChannel.info('[MCP Mail] Testing IMAP...');
            try {
              const imapClient = new IMAPClient({
                host: config.IMAP.host,
                port: config.IMAP.port,
                username: config.IMAP.username,
                password: config.IMAP.password,
                tls: config.IMAP.tls,
              });
              await imapClient.connect();
              results.push(`✅ IMAP: ${config.IMAP.host}:${config.IMAP.port}`);
              mcpMailOutputChannel.info('[MCP Mail] IMAP OK');
              await imapClient.disconnect();
            } catch (imapError) {
              const msg = imapError instanceof Error ? imapError.message : String(imapError);
              results.push(`❌ IMAP: ${config.IMAP.host}:${config.IMAP.port} — ${msg}`);
              mcpMailOutputChannel.error('[MCP Mail] IMAP failed:', msg);
            }

            mcpMailOutputChannel.info('[MCP Mail] Testing SMTP...');
            try {
              const smtpClient = new SMTPClient(config.SMTP);
              await smtpClient.connect();
              results.push(`✅ SMTP: ${config.SMTP.host}:${config.SMTP.port}`);
              mcpMailOutputChannel.info('[MCP Mail] SMTP OK');
              await smtpClient.disconnect();
            } catch (smtpError) {
              const msg = smtpError instanceof Error ? smtpError.message : String(smtpError);
              results.push(`❌ SMTP: ${config.SMTP.host}:${config.SMTP.port} — ${msg}`);
              mcpMailOutputChannel.error('[MCP Mail] SMTP failed:', msg);
            }

            vscode.window.showInformationMessage(results.join('  |  '), { modal: false });
          }
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        mcpMailOutputChannel.error('[MCP Mail] checkConnection error:', msg);
        vscode.window.showErrorMessage(`❌ Ошибка: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mcpMail.checkSmtpConfig', async () => {
      mcpMailOutputChannel.info('[MCP Mail] checkSmtpConfig command triggered');
      try {
        const { getMailConfig } = require('./mail/config');
        const { SMTPClient } = require('./mail/smtp-client');
        const config = getMailConfig();
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Проверка SMTP...',
            cancellable: false,
          },
          async () => {
            const client = new SMTPClient(config.SMTP);
            await client.connect();
            vscode.window.showInformationMessage(`✅ SMTP OK: ${config.SMTP.host}:${config.SMTP.port}`);
            await client.disconnect();
          }
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`❌ Ошибка SMTP: ${msg}`);
      }
    })
  );

  mcpMailOutputChannel.info('[MCP Mail] Sidebar commands registered');
}