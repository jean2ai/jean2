/**
 * On Windows, @clack/core's block() and Prompt.close() intentionally leave
 * stdin in raw mode (workaround for clack#176). This causes PSReadLine's
 * rendering to desync, producing garbled CLI output in PowerShell.
 *
 * Call restoreTerminalState() after every await confirm/select/multiselect
 * and after every spinner.stop() to return to cooked mode.
 */

export function restoreTerminalState(): void {
  if (process.platform === 'win32' && process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
      process.stdout.write('\r');
    } catch {
      // Ignore — may fail if stdin was already restored or is not a TTY
    }
  }
}
