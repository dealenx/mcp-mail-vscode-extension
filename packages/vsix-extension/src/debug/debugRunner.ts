import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';

export type DebugSink = (line: string) => void;

export interface DebugCapture {
  log: DebugSink;
  finish: () => Promise<string>;
}

const SENSITIVE_KEYS = ['password', 'Authorization', 'authorization', 'token', 'apikey', 'apiKey', 'api_key'];

function maskValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (SENSITIVE_KEYS.some((k) => key.toLowerCase() === k.toLowerCase()) && typeof value === 'string') {
    return value.length === 0 ? value : '***';
  }
  return value;
}

export function maskSensitive<T = unknown>(input: T): T {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map((v) => maskSensitive(v)) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some((sk) => k.toLowerCase() === sk.toLowerCase())) {
        out[k] = typeof v === 'string' && v.length > 0 ? '***' : v;
      } else if (v && typeof v === 'object') {
        out[k] = maskSensitive(v);
      } else {
        out[k] = v;
      }
    }
    return out as T;
  }
  return input;
}

export function createDebugCapture(command: string): DebugCapture {
  const lines: string[] = [];
  const startedAt = new Date();
  const header = [
    `MCP Mail — verbose debug log`,
    `Command:     ${command}`,
    `Started:     ${startedAt.toISOString()}`,
    `VS Code:     ${vscode.version}`,
    `Workspace:   ${vscode.workspace.name ?? '(none)'}`,
    `Send mode:   ${vscode.workspace.getConfiguration('mcpMail').get<string>('sendMode', 'local')}`,
    `Remote URL:  ${vscode.workspace.getConfiguration('mcpMail').get<string>('remoteUrl', 'https://smtp-service.mimikkai.ru')}`,
    `Node:        ${process.version}`,
    `Platform:    ${process.platform} ${process.arch}`,
    ``,
    `--- log ---`,
  ];
  for (const h of header) lines.push(h);

  const log: DebugSink = (line: string) => {
    const ts = new Date().toISOString();
    lines.push(`[${ts}] ${line}`);
  };

  const finish = async (): Promise<string> => {
    const finishedAt = new Date();
    lines.push(``);
    lines.push(`--- end ---`);
    lines.push(`Finished: ${finishedAt.toISOString()}`);
    lines.push(`Duration: ${finishedAt.getTime() - startedAt.getTime()} ms`);
    return lines.join('\n');
  };

  return { log, finish };
}

export async function askVerboseLog(command: string): Promise<boolean> {
  const choice = await vscode.window.showInformationMessage(
    `Открыть расширенные логи в редакторе для команды «${command}»?`,
    { modal: false, detail: 'Логи покажут URL запроса, заголовки, статус, длительность и первые 500 символов ответа сервера.' },
    'Да, открыть лог',
    'Нет',
  );
  return choice === 'Да, открыть лог';
}

export async function openDebugLogInEditor(content: string, command: string): Promise<void> {
  const tsLabel = new Date().toISOString().replace(/[:.]/g, '-');
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'log',
  });
  await vscode.window.showTextDocument(doc, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside,
  });
  mcpMailOutputChannel.info(`[DebugRunner] Opened debug log in editor: ${command} @ ${tsLabel}`);
}

export async function withDebugCapture<T>(
  command: string,
  supportsCapture: boolean,
  action: (sink: DebugSink) => Promise<T>,
): Promise<T> {
  if (!supportsCapture) {
    return action(() => {});
  }

  const wantsVerbose = await askVerboseLog(command);
  if (!wantsVerbose) {
    mcpMailOutputChannel.info(`[DebugRunner] ${command}: user declined verbose log`);
    return action(() => {});
  }

  const capture = createDebugCapture(command);
  capture.log(`User accepted verbose log`);
  mcpMailOutputChannel.info(`[DebugRunner] ${command}: verbose capture started`);

  let result: T;
  try {
    result = await action(capture.log);
    capture.log(`Action completed successfully`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    capture.log(`✗ Action failed: ${msg}`);
    if (stack) capture.log(`  stack: ${stack.split('\n').slice(0, 5).join(' | ')}`);
    const content = await capture.finish();
    await openDebugLogInEditor(content, command).catch((openErr) => {
      mcpMailOutputChannel.error(`[DebugRunner] Failed to open debug log: ${openErr instanceof Error ? openErr.message : String(openErr)}`);
    });
    throw err;
  }

  const content = await capture.finish();
  await openDebugLogInEditor(content, command).catch((openErr) => {
    mcpMailOutputChannel.error(`[DebugRunner] Failed to open debug log: ${openErr instanceof Error ? openErr.message : String(openErr)}`);
  });
  return result;
}
