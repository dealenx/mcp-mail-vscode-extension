import * as vscode from 'vscode';
import { mcpMailOutputChannel } from './logger';
import { SentMailHistoryService } from './sentMail/historyService';
import { getSignatureConfig, stripHtml } from './sentMail/signature';
import { getDefaultAttachmentsConfig } from './sentMail/attachments';
import { getSendMode, getRemoteUrl } from './mail/config';

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
      const sendMode = getSendMode();
      const remoteUrl = getRemoteUrl();
      const modeItem = new MailSidebarItem(
        sendMode === 'remote'
          ? `🌐 Удалённый режим (${remoteUrl})`
          : `🖥️ Локальный режим`,
        sendMode === 'remote' ? 'mcpMail.openSettings' : 'mcpMail.openSettings',
        sendMode === 'remote'
          ? `Отправка через удалённый сервис: ${remoteUrl}\nНажмите, чтобы изменить настройки`
          : `Отправка напрямую через IMAP/SMTP\nНажмите, чтобы изменить настройки`,
        vscode.TreeItemCollapsibleState.None,
        sendMode === 'remote' ? 'globe' : 'device-desktop'
      );
      modeItem.contextValue = 'sendMode';

      const items = [
        modeItem,
        new MailSidebarItem(
          'Проверь подключение',
          'mcpMail.checkConnection',
          'Проверка подключения IMAP/SMTP',
          vscode.TreeItemCollapsibleState.None,
          'plug'
        ),
        new MailSidebarItem(
          'Отправить тестовое письмо',
          'mcpMail.sendTestEmail',
          'Отправить тестовое письмо на указанный адрес',
          vscode.TreeItemCollapsibleState.None,
          'send'
        ),
        new MailSidebarItem(
          'Открыть настройки',
          'mcpMail.openSettings',
          'Настройки MCP Mail',
          vscode.TreeItemCollapsibleState.None,
          'settings-gear'
        ),
        new MailSidebarItem(
          'Настроить подпись',
          'mcpMail.openSignatureEditor',
          'Открыть редактор подписи',
          vscode.TreeItemCollapsibleState.None,
          'edit'
        ),
        new MailSidebarItem(
          'Прикрепленные файлы',
          'mcpMail.openAttachmentEditor',
          'Открыть редактор прикрепленных файлов',
          vscode.TreeItemCollapsibleState.None,
          'file'
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

export function registerSidebarCommands(context: vscode.ExtensionContext, sentMailHistory?: SentMailHistoryService): void {
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
        const { getSendMode } = require('./mail/config');
        const config = getMailConfig();
        const sendMode = getSendMode();
        mcpMailOutputChannel.info('[MCP Mail] Config loaded:', config.IMAP.host, config.SMTP.host, 'mode:', sendMode);

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: sendMode === 'remote' ? 'Проверка подключения к удалённому сервису...' : 'Проверка подключения к почтовым серверам...',
            cancellable: false,
          },
          async () => {
            if (sendMode === 'remote') {
              const { getMailService } = require('./mailTools');
              const service = getMailService();
              const results: string[] = [];

              mcpMailOutputChannel.info('[MCP Mail] Testing remote connection...');
              try {
                await service.ensureIMAPConnection();
                results.push(`✅ IMAP (remote): ${config.remoteUrl}`);
                mcpMailOutputChannel.info('[MCP Mail] Remote IMAP OK');
              } catch (imapError) {
                const msg = imapError instanceof Error ? imapError.message : String(imapError);
                results.push(`❌ IMAP (remote): ${msg}`);
                mcpMailOutputChannel.error('[MCP Mail] Remote IMAP failed:', msg);
              }

              try {
                await service.ensureSMTPConnection();
                results.push(`✅ SMTP (remote): ${config.remoteUrl}`);
                mcpMailOutputChannel.info('[MCP Mail] Remote SMTP OK');
              } catch (smtpError) {
                const msg = smtpError instanceof Error ? smtpError.message : String(smtpError);
                results.push(`❌ SMTP (remote): ${msg}`);
                mcpMailOutputChannel.error('[MCP Mail] Remote SMTP failed:', msg);
              }

              vscode.window.showInformationMessage(results.join('  |  '), { modal: false });
            } else {
              const { IMAPClient } = require('./mail/imap-client');
              const { SMTPClient } = require('./mail/smtp-client');
              const results: string[] = [];

              mcpMailOutputChannel.info('[MCP Mail] Testing IMAP locally...');
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

              mcpMailOutputChannel.info('[MCP Mail] Testing SMTP locally...');
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
        const { getSendMode } = require('./mail/config');
        const config = getMailConfig();
        const sendMode = getSendMode();

        if (sendMode === 'remote') {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Проверка SMTP (удалённый сервис)...',
              cancellable: false,
            },
            async () => {
              const { getMailService } = require('./mailTools');
              const service = getMailService();
              await service.ensureSMTPConnection();
              vscode.window.showInformationMessage(`✅ SMTP OK (remote): ${config.remoteUrl}`);
            }
          );
        } else {
          const { SMTPClient } = require('./mail/smtp-client');
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
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`❌ Ошибка SMTP: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mcpMail.sendTestEmail', async () => {
      mcpMailOutputChannel.info('[MCP Mail] sendTestEmail command triggered');

      const recipient = await vscode.window.showInputBox({
        prompt: 'Укажите email получателя тестового письма',
        placeHolder: 'example@yandex.ru',
        title: 'Отправить тестовое письмо',
        validateInput: (value: string) => {
          if (!value || !value.includes('@')) {
            return 'Введите корректный email-адрес';
          }
          return undefined;
        },
      });

      if (!recipient) {
        mcpMailOutputChannel.info('[MCP Mail] sendTestEmail cancelled by user');
        return;
      }

      mcpMailOutputChannel.info('[MCP Mail] Sending test email to:', recipient);

      try {
        const { getMailConfig } = require('./mail/config');
        const { getSendMode } = require('./mail/config');
        const config = getMailConfig();
        const sendMode = getSendMode();

        const sig = getSignatureConfig();
        let mailText = 'Это тестовое письмо от расширения MCP Mail для VS Code.\n\nЕсли вы получили это письмо, значит SMTP-подключение работает корректно!';
        let mailHtml = '<p>Это тестовое письмо от расширения MCP Mail для VS Code.</p><p>Если вы получили это письмо, значит SMTP-подключение работает корректно!</p>';
        if (sig.enabled && sig.html) {
          mailText += `\n\n---\n${stripHtml(sig.html)}`;
          mailHtml += `<br><br><hr><div style="white-space: pre-wrap; word-break: break-word;">${sig.html}</div>`;
          mcpMailOutputChannel.info('[MCP Mail] Signature appended to test email');
        }

        const defaultAtt = getDefaultAttachmentsConfig();
        let attachmentPaths: string[] | undefined;
        if (defaultAtt.enabled && defaultAtt.files.length > 0) {
          const fs = await import('fs/promises');
          const path = await import('path');
          const validPaths: string[] = [];
          for (const filePath of defaultAtt.files) {
            try {
              await fs.access(filePath);
              validPaths.push(filePath);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              mcpMailOutputChannel.warn(`[MCP Mail] Failed to read default attachment ${filePath}:`, msg);
            }
          }
          attachmentPaths = validPaths.length > 0 ? validPaths : undefined;
          mcpMailOutputChannel.info(`[MCP Mail] ${validPaths.length} default attachment(s) appended to test email`);
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: sendMode === 'remote' ? `Отправка тестового письма через удалённый сервис на ${recipient}...` : `Отправка тестового письма на ${recipient}...`,
            cancellable: false,
          },
          async () => {
            if (sendMode === 'remote') {
              mcpMailOutputChannel.info('[MCP Mail] Sending test email via remote service');
              const { getMailService } = require('./mailTools');
              const service = getMailService();
              await service.ensureSMTPConnection();
              const result = await service.sendEmail({
                to: recipient,
                subject: 'Тестовое письмо — MCP Mail',
                text: mailText,
                html: mailHtml,
                attachments: attachmentPaths,
              });
              mcpMailOutputChannel.info('[MCP Mail] Test email sent via remote service:', JSON.stringify(result));
            } else {
              const { SMTPClient } = require('./mail/smtp-client');
              const client = new SMTPClient(config.SMTP);
              await client.connect();

              const mailAttachments: Array<{ filename: string; content: Buffer }> = [];
              if (attachmentPaths) {
                const fs = await import('fs/promises');
                const path = await import('path');
                for (const filePath of attachmentPaths) {
                  try {
                    const content = await fs.readFile(filePath);
                    mailAttachments.push({ filename: path.basename(filePath), content });
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    mcpMailOutputChannel.warn(`[MCP Mail] Failed to read attachment ${filePath}:`, msg);
                  }
                }
              }

              await client.sendMail({
                from: config.SMTP.username,
                to: recipient,
                subject: 'Тестовое письмо — MCP Mail',
                text: mailText,
                html: mailHtml,
                attachments: mailAttachments.length > 0 ? mailAttachments : undefined,
              });
              await client.disconnect();
            }

            vscode.window.showInformationMessage(`✅ Тестовое письмо отправлено на ${recipient}${sendMode === 'remote' ? ' (через удалённый сервис)' : ''}`);
            mcpMailOutputChannel.info('[MCP Mail] Test email sent successfully');

            if (sentMailHistory) {
              try {
                await sentMailHistory.save({
                  from: config.SMTP.username,
                  to: recipient,
                  subject: 'Тестовое письмо — MCP Mail',
                  text: mailText,
                  html: mailHtml,
                  attachments: defaultAtt.enabled ? defaultAtt.files : undefined,
                  date: new Date().toISOString(),
                });
                mcpMailOutputChannel.info('[MCP Mail] Test email saved to local history');
              } catch (saveErr) {
                const saveMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
                mcpMailOutputChannel.error('[MCP Mail] Failed to save test email to history:', saveMsg);
              }
            }
          }
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        mcpMailOutputChannel.error('[MCP Mail] sendTestEmail error:', msg);
        vscode.window.showErrorMessage(`❌ Ошибка отправки: ${msg}`);
      }
    })
  );

  mcpMailOutputChannel.info('[MCP Mail] Sidebar commands registered');
}
