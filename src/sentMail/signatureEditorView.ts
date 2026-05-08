import * as vscode from 'vscode';
import { mcpMailOutputChannel } from '../logger';

export class SignatureEditorViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mcpMailSignatureEditor';
  private _view?: vscode.WebviewView;

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      const config = vscode.workspace.getConfiguration('mcpMail');
      switch (message.command) {
        case 'getConfig':
          webviewView.webview.postMessage({
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
          mcpMailOutputChannel.info('[SignatureEditor] Signature saved');
          webviewView.webview.postMessage({ command: 'saved' });
          break;
      }
    });
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Подпись</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 12px;
      margin: 0;
    }
    label {
      display: block;
      margin-top: 10px;
      margin-bottom: 4px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      font-weight: 600;
    }
    textarea {
      width: 100%;
      min-height: 80px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 6px;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: var(--vscode-editor-font-size);
      resize: vertical;
      box-sizing: border-box;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      margin-top: 10px;
      gap: 6px;
    }
    .checkbox-row input {
      cursor: pointer;
    }
    .checkbox-row label {
      margin: 0;
      cursor: pointer;
      font-weight: normal;
    }
    button {
      margin-top: 14px;
      width: 100%;
      padding: 8px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .status {
      margin-top: 8px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      min-height: 18px;
    }
    .status.saved {
      color: var(--vscode-charts-green);
    }
  </style>
</head>
<body>
  <label for="sigText">Plain text подпись</label>
  <textarea id="sigText" placeholder="С уважением, ..."></textarea>

  <label for="sigHtml">HTML подпись</label>
  <textarea id="sigHtml" placeholder="<p>С уважением, ...</p>"></textarea>

  <div class="checkbox-row">
    <input type="checkbox" id="sigEnabled" checked>
    <label for="sigEnabled">Добавлять подпись к письмам</label>
  </div>

  <button id="saveBtn">Сохранить подпись</button>
  <div class="status" id="status"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const sigText = document.getElementById('sigText');
    const sigHtml = document.getElementById('sigHtml');
    const sigEnabled = document.getElementById('sigEnabled');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');

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
        status.textContent = '✓ Сохранено';
        status.className = 'status saved';
        setTimeout(() => {
          status.textContent = '';
          status.className = 'status';
        }, 2000);
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
  </script>
</body>
</html>`;
  }
}
