import * as vscode from 'vscode';
import { mcpMailOutputChannel } from './logger';
import { MailSidebarProvider, registerSidebarCommands } from './mailSidebar';

export function activate(context: vscode.ExtensionContext) {
  mcpMailOutputChannel.info('[MCP Mail] Extension activating...');

  try {
    const disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World!');
    });
    context.subscriptions.push(disposable);

    // Register sidebar FIRST - this must never fail
    mcpMailOutputChannel.info('[MCP Mail] Creating TreeView mcpMailTreeView...');
    const mailSidebarProvider = new MailSidebarProvider();
    const treeView = vscode.window.createTreeView('mcpMailTreeView', {
      treeDataProvider: mailSidebarProvider,
      showCollapseAll: false,
    });
    context.subscriptions.push(treeView);
    mcpMailOutputChannel.info('[MCP Mail] TreeView registered successfully');

    registerSidebarCommands(context);

    // Set context key to make sidebar visible
    vscode.commands.executeCommand('setContext', 'mcpMail.extensionActive', true);

    // Refresh after a short delay
    setTimeout(() => {
      mcpMailOutputChannel.info('[MCP Mail] Triggering initial refresh');
      mailSidebarProvider.refresh();
    }, 500);

    // Register tools separately - sidebar should work even if tools fail
    try {
      const { HelloWorldTool } = require('./helloWorldTool');
      const mailTools = require('./mailTools');

      const tools = [
        new HelloWorldTool(),
        new mailTools.MailConnectTool(),
        new mailTools.MailDisconnectTool(),
        new mailTools.MailConnectionStatusTool(),
        new mailTools.MailListMailboxesTool(),
        new mailTools.MailOpenMailboxTool(),
        new mailTools.MailGetMessageCountTool(),
        new mailTools.MailGetUnseenMessagesTool(),
        new mailTools.MailGetRecentMessagesTool(),
        new mailTools.MailSearchBySenderTool(),
        new mailTools.MailSearchBySubjectTool(),
        new mailTools.MailSearchByBodyTool(),
        new mailTools.MailSearchSinceDateTool(),
        new mailTools.MailSearchAllMessagesTool(),
        new mailTools.MailGetMessagesTool(),
        new mailTools.MailGetMessageTool(),
        new mailTools.MailDeleteMessageTool(),
        new mailTools.MailGetAttachmentsTool(),
        new mailTools.MailSaveAttachmentTool(),
        new mailTools.MailSendEmailTool(),
        new mailTools.MailReplyToEmailTool(),
      ];

      for (const tool of tools) {
        context.subscriptions.push(vscode.lm.registerTool(tool.toolName, tool));
        mcpMailOutputChannel.info('[MCP Mail] Tool registered:', tool.toolName);
      }
    } catch (toolError) {
      mcpMailOutputChannel.error('[MCP Mail] Tool registration failed:', String(toolError));
      vscode.window.showWarningMessage(`MCP Mail: Some tools failed to load. Sidebar is still available. See Output > MCP Mail for details.`);
    }

    mcpMailOutputChannel.info('[MCP Mail] Extension activation complete');
  } catch (error) {
    mcpMailOutputChannel.error('[MCP Mail] Activation failed:', String(error));
    vscode.window.showErrorMessage(`MCP Mail activation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function deactivate() {
  mcpMailOutputChannel.info('[MCP Mail] Extension deactivating');
}