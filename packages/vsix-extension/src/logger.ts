let _channel: any = null;

function getChannel(): any {
  if (_channel) return _channel;
  try {
    const vscode = require('vscode');
    _channel = vscode.window.createOutputChannel('MCP Mail', { log: true });
  } catch {
    _channel = {
      name: 'MCP Mail',
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }
  return _channel;
}

export const mcpMailOutputChannel = new Proxy({} as any, {
  get(_target, prop) {
    return (...args: any[]) => {
      const ch = getChannel();
      const fn = ch[prop];
      if (typeof fn === 'function') {
        fn.apply(ch, args);
      }
    };
  },
});
