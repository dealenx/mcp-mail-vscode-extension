import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';

function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Редактор подписи</title>
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
    textarea {
      width: 100%;
      min-height: 120px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 8px;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: var(--vscode-editor-font-size);
      resize: vertical;
      box-sizing: border-box;
    }
    .hint {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
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
  <h2>✉️ Редактор подписи</h2>

  <div class="section">
    <label for="sigText">Plain text подпись</label>
    <textarea id="sigText" placeholder="С уважением, Андрей Бумагин&#10;Основатель &amp; CEO, MimikkAI&#10;&#10;mimikkai.ru"></textarea>
    <div class="hint">Будет добавлена в конец plain text писем</div>
  </div>

  <div class="section">
    <label for="sigHtml">HTML подпись</label>
    <textarea id="sigHtml" placeholder="&lt;p&gt;С уважением, &lt;b&gt;Андрей Бумагин&lt;/b&gt;&lt;/p&gt;&#10;&lt;p&gt;Основатель &amp; CEO, MimikkAI&lt;/p&gt;&#10;&lt;p&gt;&lt;a href='https://mimikkai.ru'&gt;mimikkai.ru&lt;/a&gt;&lt;/p&gt;"></textarea>
    <div class="hint">Поддерживает HTML: ссылки, изображения, стили. Будет добавлена в HTML письма.</div>
  </div>

  <div class="checkbox-row">
    <input type="checkbox" id="sigEnabled">
    <label for="sigEnabled">Автоматически добавлять подпись к исходящим письмам</label>
  </div>

  <div class="actions">
    <button id="saveBtn">💾 Сохранить</button>
    <button id="previewBtn" class="secondary">👁 Предпросмотр</button>
  </div>

  <div class="status" id="status"></div>

  <div class="preview" id="previewBox" style="display:none">
    <div class="preview-title">Предпросмотр HTML подписи:</div>
    <div id="previewContent"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const sigText = document.getElementById('sigText');
    const sigHtml = document.getElementById('sigHtml');
    const sigEnabled = document.getElementById('sigEnabled');
    const saveBtn = document.getElementById('saveBtn');
    const previewBtn = document.getElementById('previewBtn');
    const status = document.getElementById('status');
    const previewBox = document.getElementById('previewBox');
    const previewContent = document.getElementById('previewContent');

    // Load current config
    vscode.postMessage({ command: 'getConfig' });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'config') {
        sigText.value = msg.text || '';
        sigHtml.value = msg.html || '';
        sigEnabled.checked = msg.enabled;
      }
      if (msg.command === 'saved') {
        status.textContent = '✅ Подпись сохранена';
        status.className = 'status success';
        setTimeout(() => {
          status.textContent = '';
          status.className = 'status';
        }, 3000);
      }
    });

    saveBtn.addEventListener('click', () => {
      status.textContent = 'Сохранение...';
      status.className = 'status';
      vscode.postMessage({
        command: 'save',
        text: sigText.value,
        html: sigHtml.value,
        enabled: sigEnabled.checked,
      });
    });

    previewBtn.addEventListener('click', () => {
      if (sigHtml.value.trim()) {
        previewContent.innerHTML = sigHtml.value;
        previewBox.style.display = 'block';
      } else if (sigText.value.trim()) {
        previewContent.innerText = sigText.value;
        previewBox.style.display = 'block';
      } else {
        status.textContent = 'Нет данных для предпросмотра';
        status.className = 'status error';
      }
    });
  </script>
</body>
</html>`;
}

export function openSignatureEditorPanel(): void {
  const panel = vscode.window.createWebviewPanel(
    'mcpMailSignatureEditor',
    'Редактор подписи',
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
          text: config.get<string>('signatureText', ''),
          html: config.get<string>('signatureHtml', ''),
          enabled: config.get<boolean>('signatureEnabled', true),
        });
        break;
      case 'save':
        await config.update('signatureText', message.text, true);
        await config.update('signatureHtml', message.html, true);
        await config.update('signatureEnabled', message.enabled, true);
        mcpMailOutputChannel.info('[SignatureEditor] Signature saved via panel');
        panel.webview.postMessage({ command: 'saved' });
        break;
    }
  });

  mcpMailOutputChannel.info('[SignatureEditor] Panel opened');
}
