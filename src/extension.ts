import * as vscode from 'vscode';
import { mcpMailOutputChannel } from './logger';
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
  mcpMailOutputChannel.info('[MCP Mail] Extension activating...');

  const disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World!');
  });
  context.subscriptions.push(disposable);

  // Register sidebar using createTreeView
  mcpMailOutputChannel.info('[MCP Mail] Creating TreeView mcpMailTreeView...');
  const mailSidebarProvider = new MailSidebarProvider();
  const treeView = vscode.window.createTreeView('mcpMailTreeView', {
    treeDataProvider: mailSidebarProvider,
    showCollapseAll: false,
    canSelectMany: false,
  });
  context.subscriptions.push(treeView);
  mcpMailOutputChannel.info('[MCP Mail] TreeView registered successfully');

  // Refresh after a short delay to ensure view is ready
  setTimeout(() => {
    mcpMailOutputChannel.info('[MCP Mail] Triggering initial refresh');
    mailSidebarProvider.refresh();
  }, 500);
  
  registerSidebarCommands(context);
  
  mcpMailOutputChannel.info('[MCP Mail] Extension activation complete');
  
  // Set context key to make sidebar visible
  vscode.commands.executeCommand('setContext', 'mcpMail.extensionActive', true);

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
