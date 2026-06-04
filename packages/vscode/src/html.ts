import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { state } from './state';

/**
 * CSP rationale:
 * - script-src: local HTTP server (client bundle) + unsafe-inline/eval (React, Vite HMR)
 * - connect-src: localhost (Jean2 server) + https:/wss: (arbitrary LLM provider APIs —
 *   OpenAI, Anthropic, Google, OpenRouter, DeepSeek, etc. — each has its own origin)
 * - img-src: https: required for provider icons and web-sourced images in chat
 */

export function getProductionHtml(webview: vscode.Webview, clientDistDir: vscode.Uri): string {
  const serverUrl = `http://127.0.0.1:${state.serverPort}`;
  const indexPath = path.join(clientDistDir.fsPath, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf-8');

  html = html.replace(
    /(src|href)="(?:\.\/|\/)([^"]+)"/g,
    `$1="${serverUrl}/$2"`,
  );

  html = html.replace(/\s+crossorigin(?:="[^"]*")?/gi, '');

  html = html
    .replace(/<link\s+rel="manifest"[^>]*\/?>/gi, '')
    .replace(/<link\s+rel="icon"[^>]*\/?>/gi, '')
    .replace(/<script[^>]*registerSW\.js[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*modulepreload[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*\/?>/gi, '')
    .replace(/<script>\s*\(function\(\)[\s\S]*?<\/script>/gi, '');

  html = html.replace(
    '</head>',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${serverUrl} 'unsafe-inline' 'unsafe-eval'; script-src-elem ${serverUrl} 'unsafe-inline' 'unsafe-eval'; style-src ${serverUrl} 'unsafe-inline'; style-src-elem ${serverUrl} 'unsafe-inline'; font-src ${serverUrl} data:; img-src ${serverUrl} data: https:; connect-src http://localhost:* ws://localhost:* wss://localhost:* http://127.0.0.1:* ws://127.0.0.1:* ${serverUrl} https: wss:; media-src ${serverUrl} data: blob:">\n<style>body{margin:0;padding:0;background:var(--vscode-editor-background)}</style>\n</head>`,
  );

  return html;
}

export function getDevHtml(webview: vscode.Webview): string {
  const devServerUrl = 'http://localhost:5173';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src ${webview.cspSource} http://localhost:* https://localhost:* 'unsafe-inline' 'unsafe-eval';
             style-src ${webview.cspSource} 'unsafe-inline';
             font-src ${webview.cspSource} data:;
             img-src ${webview.cspSource} data: https:;
             connect-src http://localhost:* ws://localhost:* wss://localhost:* https: wss:;
             media-src ${webview.cspSource} data: blob:;"
  >
  <style>
    body { margin: 0; padding: 0; background: var(--vscode-editor-background); }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${devServerUrl}/@vite/client"></script>
  <script type="module" src="${devServerUrl}/src/main.tsx"></script>
</body>
</html>`;
}

export function getHtml(
  webview: vscode.Webview,
  isProduction: boolean,
  clientDistDir: vscode.Uri | null,
): string {
  if (isProduction && clientDistDir) {
    return getProductionHtml(webview, clientDistDir);
  }
  return getDevHtml(webview);
}
