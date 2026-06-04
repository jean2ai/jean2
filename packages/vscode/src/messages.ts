/**
 * Message type constants for extension ↔ webview communication.
 *
 * Keep in sync with: packages/client/src/platform/adapters/vscode.ts
 * Every message type string must appear as a named constant in both files.
 */

// Extension → Webview
export const MessageType = {
  Init: 'jean2:init',
  ThemeChanged: 'jean2:themeChanged',
  WorkspaceChanged: 'jean2:workspaceChanged',
  // Webview → Extension
  Ready: 'jean2:ready',
  OpenFile: 'jean2:openFile',
  ToggleTerminal: 'jean2:toggleTerminal',
  ToggleExplorer: 'jean2:toggleExplorer',
  Connected: 'jean2:connected',
  Disconnected: 'jean2:disconnected',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
