import type * as vscode from 'vscode';
import type * as http from 'node:http';

export interface ExtensionState {
  panel: vscode.WebviewPanel | null;
  statusBar: vscode.StatusBarItem | null;
  server: http.Server | null;
  serverPort: number;
  serverPromise: Promise<number> | null;
}

export const state: ExtensionState = {
  panel: null,
  statusBar: null,
  server: null,
  serverPort: 0,
  serverPromise: null,
};
