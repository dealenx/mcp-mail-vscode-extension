import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';

function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Прикрепленные файлы</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
      line-height: 1.5;
    }
    h2 {
      margin-top: 0;
      margin-bottom: 16px;
      font-size: 18px;
      font-weight: 600;
    }
    .section {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 6px;
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      font-weight: 600;
    }
    .file-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .file-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      margin-bottom: 6px;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 13px;
    }
    .file-item .path {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 10px;
    }
    .file-item .remove-btn {
      background: transparent;
      border: none;
      color: var(--vscode-charts-red);
      cursor: pointer;
      font-size: 16px;
      padding: 0 4px;
      flex: none;
    }
    .file-item .remove-btn:hover {
      opacity: 0.8;
    }
    .empty-hint {
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 8px 0;
    }
    .hint {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 6px;
      line-height: 1.4;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 16px 0;
    }
    .checkbox-row input {
      cursor: pointer;
      width: 16px;
      height: 16px;
    }
    .checkbox-row label {
      margin: 0;
      cursor: pointer;
      font-weight: normal;
      color: var(--vscode-editor-foreground);
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    button {
      flex: 1;
      padding: 10px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
      font-weight: 500;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background: var(--vscode-secondaryButton-background, var(--vscode-button-secondaryBackground));
      color: var(--vscode-secondaryButton-foreground, var(--vscode-button-secondaryForeground));
    }
    .status {
      margin-top: 12px;
      padding: 8px;
      border-radius: 4px;
      font-size: 13px;
      text-align: center;
      min-height: 20px;
    }
    .status.success {
      background: var(--vscode-charts-green);
      color: #fff;
    }
    .status.error {
      background: var(--vscode-charts-red);
      color: #fff;
    }
    .preview {
      margin-top: 20px;
      padding: 12px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      border-radius: 4px;
    }
    .preview-title {
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <h2>📎 Прикрепленные файлы</h2>

  <div class="section">
    <label>Список файлов, прикрепляемых ко всем исходящим письмам</label>
    <ul class="file-list" id="fileList"></ul>
    <div class="empty-hint" id="emptyHint">Нет прикрепленных файлов</div>
    <button id="addFilesBtn" class="secondary" style="margin-top:8px;width:auto;flex:none;padding:8px 14px;">➕ Добавить файлы</button>
    <div class="hint">
      💡 Указанные файлы будут автоматически прикрепляться к каждому отправляемому письму.
    </div>
  </div>

  <div class="checkbox-row">
    <input type="checkbox" id="attachmentsEnabled">
    <label for="attachmentsEnabled">Автоматически прикреплять файлы к исходящим письмам</label>
  </div>

  <div class="actions">
    <button id="saveBtn">💾 Сохранить</button>
    <button id="previewBtn" class="secondary">👁 Предпросмотр</button>
  </div>

  <div class="status" id="status"></div>

  <div class="preview" id="previewBox" style="display:none">
    <div class="preview-title">Список файлов для прикрепления:</div>
    <ul id="previewContent" style="margin:0;padding-left:18px;"></ul>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const fileList = document.getElementById('fileList');
    const emptyHint = document.getElementById('emptyHint');
    const addFilesBtn = document.getElementById('addFilesBtn');
    const attachmentsEnabled = document.getElementById('attachmentsEnabled');
    const saveBtn = document.getElementById('saveBtn');
    const previewBtn = document.getElementById('previewBtn');
    const status = document.getElementById('status');
    const previewBox = document.getElementById('previewBox');
    const previewContent = document.getElementById('previewContent');

    let files = [];

    function renderList() {
      fileList.innerHTML = '';
      if (files.length === 0) {
        emptyHint.style.display = 'block';
      } else {
        emptyHint.style.display = 'none';
        files.forEach((f, idx) => {
          const li = document.createElement('li');
          li.className = 'file-item';
          li.innerHTML = '<span class="path" title="' + f + '">' + f + '</span><button class="remove-btn" data-idx="' + idx + '">✕</button>';
          fileList.appendChild(li);
        });
        document.querySelectorAll('.remove-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.idx, 10);
            files.splice(idx, 1);
            renderList();
          });
        });
      }
    }

    vscode.postMessage({ command: 'getConfig' });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'config') {
        files = msg.files || [];
        attachmentsEnabled.checked = msg.enabled;
        renderList();
      }
      if (msg.command === 'addFiles') {
        if (msg.paths && msg.paths.length > 0) {
          msg.paths.forEach(p => {
            if (!files.includes(p)) files.push(p);
          });
          renderList();
        }
      }
      if (msg.command === 'saved') {
        status.textContent = '✅ Список файлов сохранен';
        status.className = 'status success';
        setTimeout(() => {
          status.textContent = '';
          status.className = 'status';
        }, 3000);
      }
    });

    addFilesBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'selectFiles' });
    });

    saveBtn.addEventListener('click', () => {
      status.textContent = 'Сохранение...';
      status.className = 'status';
      vscode.postMessage({
        command: 'save',
        files: files,
        enabled: attachmentsEnabled.checked,
      });
    });

    previewBtn.addEventListener('click', () => {
      if (files.length > 0) {
        previewContent.innerHTML = files.map(f => '<li>' + f + '</li>').join('');
        previewBox.style.display = 'block';
      } else {
        status.textContent = 'Нет файлов для предпросмотра';
        status.className = 'status error';
      }
    });
  </script>
</body>
</html>`;
}

export function openAttachmentEditorPanel(): void {
  const panel = vscode.window.createWebviewPanel(
    'mcpMailAttachmentEditor',
    'Прикрепленные файлы',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = getHtml();

  panel.webview.onDidReceiveMessage(async (message) => {
    const config = vscode.workspace.getConfiguration('mcpMail');
    switch (message.command) {
      case 'getConfig':
        panel.webview.postMessage({
          command: 'config',
          files: config.get<string[]>('defaultAttachments', []),
          enabled: config.get<boolean>('defaultAttachmentsEnabled', true),
        });
        break;
      case 'selectFiles': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: true,
          openLabel: 'Добавить',
        });
        if (uris && uris.length > 0) {
          panel.webview.postMessage({
            command: 'addFiles',
            paths: uris.map(u => u.fsPath),
          });
        }
        break;
      }
      case 'save':
        await config.update('defaultAttachments', message.files || [], true);
        await config.update('defaultAttachmentsEnabled', message.enabled, true);
        mcpMailOutputChannel.info('[AttachmentEditor] Default attachments saved via panel');
        panel.webview.postMessage({ command: 'saved' });
        break;
    }
  });

  mcpMailOutputChannel.info('[AttachmentEditor] Panel opened');
}
