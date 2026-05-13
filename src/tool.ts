import * as vscode from "vscode";
import { CancellationError, throwIfCancelled } from "./cancellation";

export { CancellationError, throwIfCancelled } from "./cancellation";

export function createAbortController(token: vscode.CancellationToken): AbortController {
  if (token.isCancellationRequested) {
    const ac = new AbortController();
    ac.abort();
    return ac;
  }
  const ac = new AbortController();
  token.onCancellationRequested(() => ac.abort());
  return ac;
}

export abstract class Tool implements vscode.LanguageModelTool<object> {
  abstract toolName: string;

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<object>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const response = await this.call(options, token);
      if (token.isCancellationRequested) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify({ cancelled: true, message: 'Operation was cancelled' })),
        ]);
      }
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(response),
      ]);
    } catch (error) {
      if (error instanceof CancellationError) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify({ cancelled: true, message: 'Operation was cancelled' })),
        ]);
      }
      const errorPayload = {
        isError: true,
        message: error instanceof Error ? error.message : String(error),
      };
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(errorPayload)),
      ]);
    }
  }

  abstract call(
    options: vscode.LanguageModelToolInvocationOptions<object>,
    token: vscode.CancellationToken
  ): Promise<string>;
}
