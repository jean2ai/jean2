const isMac = typeof navigator !== 'undefined' &&
  ((navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform === 'macOS' ||
   /mac|iphone|ipad|ipod/i.test(navigator.userAgent));
const mod = isMac ? '⌘' : 'Ctrl';
const alt = isMac ? '⌥' : 'Alt';

const SHORTCUTS = [
  { keys: [mod, '1'], description: 'Open session list' },
  { keys: [mod, '2'], description: 'Open files panel' },
  { keys: [mod, 'T'], description: 'Open terminal' },
  { keys: [mod, 'O'], description: 'Toggle overview mode' },
  { keys: [mod, 'N'], description: 'New session' },
  { keys: [mod, 'Shift', 'N'], description: 'New window' },
  { keys: [mod, 'Shift', 'F'], description: 'Toggle follow/free mode' },
  { keys: [mod, 'Click'], description: 'Open session alongside' },
  { keys: [mod, 'Enter'], description: 'Open selected session alongside' },
  { keys: [alt, '1–6'], description: 'Focus session pane' },
  { keys: [alt, 'Shift', '←'], description: 'Focus previous pane' },
  { keys: [alt, 'Shift', '→'], description: 'Focus next pane' },
  { keys: ['Shift', 'Esc'], description: 'Close focused panel' },
  { keys: ['Shift', 'Enter'], description: 'New line in input' },
  { keys: ['Enter'], description: 'Send message' },
  { keys: ['↑', '↓', '←', '→'], description: 'Navigate sessions' },
  { keys: ['Esc'], description: 'Focus chat input' },
  { keys: ['Esc', 'Esc'], description: 'Stop streaming (chat input focused)' },
];

export function KeybindsPanel() {
  return (
    <div className="p-3 sm:p-4 flex flex-col gap-2">
      {SHORTCUTS.map((shortcut, index) => (
        <div key={index} className="flex items-center justify-between py-1">
          <div className="flex items-center gap-1 flex-wrap">
            {shortcut.keys.map((key, keyIndex) => (
              <span key={keyIndex}>
                <kbd className="font-mono bg-muted rounded px-2 py-1 text-xs">
                  {key}
                </kbd>
                {keyIndex < shortcut.keys.length - 1 && (
                  <span className="mx-1 text-muted-foreground">+</span>
                )}
              </span>
            ))}
          </div>
          <span className="text-sm text-muted-foreground text-right">
            {shortcut.description}
          </span>
        </div>
      ))}
    </div>
  );
}
