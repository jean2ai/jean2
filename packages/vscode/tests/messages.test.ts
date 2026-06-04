import { describe, test, expect } from 'bun:test';
import { MessageType } from '../src/messages';

describe('messages', () => {
  test('all message types are defined', () => {
    expect(MessageType.Init).toBe('jean2:init');
    expect(MessageType.ThemeChanged).toBe('jean2:themeChanged');
    expect(MessageType.WorkspaceChanged).toBe('jean2:workspaceChanged');
    expect(MessageType.Ready).toBe('jean2:ready');
    expect(MessageType.OpenFile).toBe('jean2:openFile');
    expect(MessageType.ToggleTerminal).toBe('jean2:toggleTerminal');
    expect(MessageType.ToggleExplorer).toBe('jean2:toggleExplorer');
    expect(MessageType.Connected).toBe('jean2:connected');
    expect(MessageType.Disconnected).toBe('jean2:disconnected');
  });

  test('no duplicate values', () => {
    const values = Object.values(MessageType);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  test('every message type has a jean2: prefix', () => {
    for (const value of Object.values(MessageType)) {
      expect(value.startsWith('jean2:')).toBe(true);
    }
  });
});
