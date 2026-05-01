import * as vscode from 'vscode';
import { getMailConfig } from './mail/config';
import { SMTPClient } from './mail/smtp-client';
import { IMAPClient } from './mail/imap-client';
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
    mcpMailOutputChannel.info('[MCP Mail] getChildren called, element:', element?.label || 'root');
    const items = [
      new MailSidebarItem(
        'Проверь подключение',
        {
          command: 'mcpMail.checkConnection',
          title: 'Проверь подключение',
        },
        vscode.TreeItemCollapsibleState.None,
        '$(plug)',
      ),
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
    ];
    mcpMailOutputChannel.info('[MCP Mail] Returning', items.length, 'sidebar items');
    return Promise.resolve(items);
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
    vscode.commands.registerCommand('mcpMail.checkConnection', async () => {
      mcpMailOutputChannel.info('[FIX] checkConnection command triggered');
      try {
        const config = getMailConfig();
        mcpMailOutputChannel.info('[FIX] Config loaded:', { 
          imapHost: config.IMAP.host, 
          smtpHost: config.SMTP.host,
          user: config.IMAP.username 
        });
        
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Проверка подключения к почтовым серверам...',
            cancellable: false,
          },
          async () => {
            const results: string[] = [];
            
            // Check IMAP
            mcpMailOutputChannel.info('[FIX] Testing IMAP connection...');
            try {
              const imapClient = new IMAPClient({
                host: config.IMAP.host,
                port: config.IMAP.port,
                username: config.IMAP.username,
                password: config.IMAP.password,
                tls: config.IMAP.tls,
              });
              await imapClient.connect();
              results.push(`✅ IMAP: ${config.IMAP.host}:${config.IMAP.port} — OK`);
              mcpMailOutputChannel.info('[FIX] IMAP connection successful');
              await imapClient.disconnect();
            } catch (imapError) {
              const msg = imapError instanceof Error ? imapError.message : String(imapError);
              results.push(`❌ IMAP: ${config.IMAP.host}:${config.IMAP.port} — ${msg}`);
              mcpMailOutputChannel.error('[FIX] IMAP connection failed:', msg);
            }
            
            // Check SMTP
            mcpMailOutputChannel.info('[FIX] Testing SMTP connection...');
            try {
              const smtpClient = new SMTPClient(config.SMTP);
              await smtpClient.connect();
              results.push(`✅ SMTP: ${config.SMTP.host}:${config.SMTP.port} — OK`);
              mcpMailOutputChannel.info('[FIX] SMTP connection successful');
              await smtpClient.disconnect();
            } catch (smtpError) {
              const msg = smtpError instanceof Error ? smtpError.message : String(smtpError);
              results.push(`❌ SMTP: ${config.SMTP.host}:${config.SMTP.port} — ${msg}`);
              mcpMailOutputChannel.error('[FIX] SMTP connection failed:', msg);
            }
            
            mcpMailOutputChannel.info('[FIX] Connection check results:', results);
            vscode.window.showInformationMessage(
              results.join('\n'),
              { modal: false }
            );
          }
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        mcpMailOutputChannel.error('[FIX] checkConnection error:', msg);
        vscode.window.showErrorMessage(`❌ Ошибка проверки: ${msg}`);
      }
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
