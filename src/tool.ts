import * as vscode from "vscode";

/**
 * Базовый абстрактный класс для всех MCP инструментов
 */
export abstract class Tool implements vscode.LanguageModelTool<object> {
  abstract toolName: string;

  /**
   * Основной метод вызова инструмента
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<object>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const response = await this.call(options, token);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(response),
      ]);
    } catch (error) {
      const errorPayload = {
        isError: true,
        message: error instanceof Error ? error.message : String(error),
      };
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(errorPayload)),
      ]);
    }
  }

  /**
   * Реализуйте вашу бизнес-логику здесь
   */
  abstract call(
    options: vscode.LanguageModelToolInvocationOptions<object>,
    token: vscode.CancellationToken
  ): Promise<string>;
}
