export { OPCODES, encodeFrame, decodeFrame } from './frames';
export type { Opcode } from './frames';
import { TerminalManager } from './manager';

let _instance: TerminalManager | null = null;

export function getTerminalManager(): TerminalManager {
  if (!_instance) {
    _instance = new TerminalManager();
  }
  return _instance;
}

export { TerminalManager };
