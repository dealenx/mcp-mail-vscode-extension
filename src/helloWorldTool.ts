import * as vscode from "vscode";
import { Tool } from "./tool";

/**
 * Простой MCP инструмент который показывает "Hello World" в alert окне
 */
export class HelloWorldTool extends Tool {
  public readonly toolName = "hello_world_tool";

  async call(
    _options: vscode.LanguageModelToolInvocationOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<string> {
    // Показываем alert окно в VS Code
    vscode.window.showInformationMessage("Hello World");

    // Возвращаем результат для AI модели
    return JSON.stringify({
      success: true,
      message: "Hello World alert was shown successfully",
    });
  }
}
