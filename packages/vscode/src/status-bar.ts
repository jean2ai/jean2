import * as vscode from 'vscode';
import { state } from './state';

export function createStatusBarItem(context: vscode.ExtensionContext): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.command = 'jean2.openChat';
  item.text = '$(comment-discussion) Jean2';
  item.tooltip = 'Open Jean2 Chat';
  item.show();
  context.subscriptions.push(item);
  state.statusBar = item;
  return item;
}

export function updateStatusBar(connected: boolean) {
  if (state.statusBar) {
    state.statusBar.text = connected
      ? '$(comment-discussion) Jean2'
      : '$(debug-disconnect) Jean2';
    state.statusBar.backgroundColor = connected
      ? undefined
      : new vscode.ThemeColor('statusBarItem.warningBackground');
  }
}
