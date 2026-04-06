/**
 * Windows PowerShell does not translate \n to \r\n even in cooked mode,
 * unlike CMD. This causes progressive rightward cursor drift (staircase)
 * with @clack/prompts' log.step(), spinner.stop(), etc., which all use
 * process.stdout.write(text + '\n').
 *
 * Additionally, @clack/core's block() and Prompt.close() intentionally
 * leave stdin in raw mode on Windows (workaround for clack#176), which
 * further desyncs PSReadLine's cursor tracking.
 *
 * This module patches stdout to ensure \r\n line endings on Windows
 * and provides restoreTerminalState() to exit raw mode after prompts.
 */

// Patch stdout on Windows to translate \n → \r\n.
// Only activates when stdout is a TTY (interactive terminal).
// Uses lookbehind to avoid double-translating existing \r\n.
if (process.platform === 'win32' && process.stdout.isTTY) {
  type WriteFn = (data: string | Uint8Array, ...args: unknown[]) => boolean;
  const _origWrite: WriteFn = process.stdout.write.bind(process.stdout) as unknown as WriteFn;
  (process.stdout as unknown as { write: WriteFn }).write = (data: string | Uint8Array, ...args: unknown[]): boolean => {
    if (typeof data === 'string') {
      data = data.replace(/(?<!\r)\n/g, '\r\n');
    }
    return _origWrite(data, ...args);
  };
}

/**
 * On Windows, @clack/core's block() and Prompt.close() intentionally leave
 * stdin in raw mode (workaround for clack#176). Call this after every
 * await confirm/select/multiselect and after every spinner.stop().
 */
export function restoreTerminalState(): void {
  if (process.platform === 'win32' && process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // Ignore — may fail if stdin was already restored or is not a TTY
    }
  }
}
