import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';
import { SentMailRecord } from './types';

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function openSentMailDetail(record: SentMailRecord): void {
  const panel = vscode.window.createWebviewPanel(
    'mcpMailSentMailDetail',
    record.subject || 'Отправленное письмо',
    vscode.ViewColumn.One,
    { enableScripts: false }
  );

  const dateStr = new Date(record.date).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const metaRows: string[] = [];
  if (record.from) {
    metaRows.push(`<tr><td class="label">От кого:</td><td class="value">${escapeHtml(record.from)}</td></tr>`);
  }
  metaRows.push(`<tr><td class="label">Кому:</td><td class="value">${escapeHtml(record.to)}</td></tr>`);
  if (record.cc) {
    metaRows.push(`<tr><td class="label">Копия:</td><td class="value">${escapeHtml(record.cc)}</td></tr>`);
  }
  if (record.bcc) {
    metaRows.push(`<tr><td class="label">Скрытая копия:</td><td class="value">${escapeHtml(record.bcc)}</td></tr>`);
  }
  metaRows.push(`<tr><td class="label">Тема:</td><td class="value">${escapeHtml(record.subject || '(без темы)')}</td></tr>`);
  metaRows.push(`<tr><td class="label">Дата:</td><td class="value">${dateStr}</td></tr>`);
  if (record.messageId) {
    metaRows.push(`<tr><td class="label">Message-ID:</td><td class="value" style="font-size:11px;color:var(--vscode-descriptionForeground)">${escapeHtml(record.messageId)}</td></tr>`);
  }

  let bodyHtml = '';
  if (record.html) {
    bodyHtml = `<div class="html-body">${record.html}</div>`;
  } else if (record.text) {
    bodyHtml = `<pre class="text-body">${escapeHtml(record.text)}</pre>`;
  } else {
    bodyHtml = `<div class="empty-body">(без тела)</div>`;
  }

  const attachmentsHtml = record.attachments && record.attachments.length > 0
    ? `<div class="attachments">
         <div class="attachments-title">Вложения:</div>
         <ul>${record.attachments.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
       </div>`
    : '';

  panel.webview.html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(record.subject || 'Отправленное письмо')}</title>
  <style>
    body {
      font-family: var(--vscode-font-family), sans-serif;
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
      line-height: 1.5;
      margin: 0;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .meta-table td {
      padding: 4px 8px;
      vertical-align: top;
    }
    .meta-table .label {
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      width: 120px;
      font-weight: 600;
    }
    .meta-table .value {
      word-break: break-word;
    }
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 16px 0;
    }
    .html-body {
      max-width: 100%;
      overflow-x: auto;
    }
    .text-body {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: var(--vscode-editor-font-size);
    }
    .empty-body {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .attachments {
      margin-top: 20px;
      padding: 12px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      border-radius: 4px;
    }
    .attachments-title {
      font-weight: 600;
      margin-bottom: 6px;
    }
    .attachments ul {
      margin: 0;
      padding-left: 18px;
    }
    .attachments li {
      margin: 2px 0;
    }
  </style>
</head>
<body>
  <table class="meta-table">
    ${metaRows.join('')}
  </table>
  <hr class="divider" />
  ${bodyHtml}
  ${attachmentsHtml}
</body>
</html>`;

  mcpMailOutputChannel.info(`[SentMailDetail] Opened panel for ${record.id}`);
}
