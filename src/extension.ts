import * as vscode from 'vscode';
import { HelloWorldTool } from './helloWorldTool';
import {
  MailConnectTool,
  MailDisconnectTool,
  MailConnectionStatusTool,
  MailListMailboxesTool,
  MailOpenMailboxTool,
  MailGetMessageCountTool,
  MailGetUnseenMessagesTool,
  MailGetRecentMessagesTool,
  MailSearchBySenderTool,
  MailSearchBySubjectTool,
  MailSearchByBodyTool,
  MailSearchSinceDateTool,
  MailSearchAllMessagesTool,
  MailGetMessagesTool,
  MailGetMessageTool,
  MailDeleteMessageTool,
  MailGetAttachmentsTool,
  MailSaveAttachmentTool,
  MailSendEmailTool,
  MailReplyToEmailTool,
} from './mailTools';
import { MailSidebarProvider, registerSidebarCommands } from './mailSidebar';

export function activate(context: vscode.ExtensionContext) {
  console.log('MCP Mail VS Code extension is now active!');

  const disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World!');
  });
  context.subscriptions.push(disposable);

  // Register sidebar
  const mailSidebarProvider = new MailSidebarProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('mcpMailSidebar', mailSidebarProvider)
  );
  registerSidebarCommands(context);

  const tools = [
    new HelloWorldTool(),
    new MailConnectTool(),
    new MailDisconnectTool(),
    new MailConnectionStatusTool(),
    new MailListMailboxesTool(),
    new MailOpenMailboxTool(),
    new MailGetMessageCountTool(),
    new MailGetUnseenMessagesTool(),
    new MailGetRecentMessagesTool(),
    new MailSearchBySenderTool(),
    new MailSearchBySubjectTool(),
    new MailSearchByBodyTool(),
    new MailSearchSinceDateTool(),
    new MailSearchAllMessagesTool(),
    new MailGetMessagesTool(),
    new MailGetMessageTool(),
    new MailDeleteMessageTool(),
    new MailGetAttachmentsTool(),
    new MailSaveAttachmentTool(),
    new MailSendEmailTool(),
    new MailReplyToEmailTool(),
  ];

  for (const tool of tools) {
    context.subscriptions.push(vscode.lm.registerTool(tool.toolName, tool));
    console.log('MCP tool registered:', tool.toolName);
  }
}

export function deactivate() {
  // Extension deactivation cleanup
}
