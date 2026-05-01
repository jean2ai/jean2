# Step 2: Theme Addon

Build a Storybook decorator that lets you switch between all 10 theme combinations (2 modes × 5 schemes) from a toolbar dropdown.

## How the Theme System Works

Our theme system applies CSS classes to `<html>`:

```
html.dark.ocean     → Dark mode with Ocean color scheme
html.light.forest   → Light mode with Forest color scheme
html.dark.neutral   → Dark mode with Neutral color scheme (default)
```

The CSS variables cascade from these classes — each combination overrides `--background`, `--primary`, `--border`, etc. via `src/index.css`.

In the real app, `ThemeProvider` manages this. In Storybook, we bypass ThemeProvider entirely and apply classes directly to `document.documentElement`.

## 1. Create Theme Constants

```typescript
// packages/client/.storybook/theme-addon/constants.ts

export const THEME_MODES = ['light', 'dark'] as const;
export const THEME_SCHEMES = ['neutral', 'ocean', 'forest', 'sunset', 'amethyst'] as const;

export type StorybookThemeMode = (typeof THEME_MODES)[number];
export type StorybookThemeScheme = (typeof THEME_SCHEMES)[number];

export const SCHEME_LABELS: Record<StorybookThemeScheme, string> = {
  neutral: 'Neutral',
  ocean: 'Ocean',
  forest: 'Forest',
  sunset: 'Sunset',
  amethyst: 'Amethyst',
};
```

## 2. Create the Theme Decorator

This is a global decorator that reads toolbar globals and applies CSS classes.

```tsx
// packages/client/.storybook/theme-addon/ThemeDecorator.tsx
import { useEffect } from 'react';
import { useGlobals } from '@storybook/preview-api';
import type { StoryContext } from '@storybook/react';
import { THEME_MODES, THEME_SCHEMES } from './constants';
import type { StorybookThemeMode, StorybookThemeScheme } from './constants';

function isValidMode(value: string): value is StorybookThemeMode {
  return THEME_MODES.includes(value as StorybookThemeMode);
}

function isValidScheme(value: string): value is StorybookThemeScheme {
  return THEME_SCHEMES.includes(value as StorybookThemeScheme);
}

export function ThemeDecorator(Story: React.ComponentType, context: StoryContext) {
  const [globals, updateGlobals] = useGlobals();

  const mode = isValidMode(globals.themeMode) ? globals.themeMode : 'dark';
  const scheme = isValidScheme(globals.themeScheme) ? globals.themeScheme : 'neutral';

  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    root.classList.remove('light', 'dark');
    root.classList.remove(...THEME_SCHEMES);

    // Apply current theme classes
    root.classList.add(mode);
    root.classList.add(scheme);
  }, [mode, scheme]);

  return <Story />;
}
```

### Why not wrap in `<ThemeProvider>`?

`ThemeProvider` reads from `localStorage`, manages system theme detection, and provides a React context. For Storybook we want **toolbar control** — not localStorage state. Applying classes directly is simpler, more predictable, and avoids React context nesting issues.

## 3. Register the Toolbar

This adds the dropdown controls to the Storybook toolbar.

```typescript
// packages/client/.storybook/theme-addon/register.ts
import type { addons } from '@storybook/preview-api';
import { THEME_MODES, THEME_SCHEMES, SCHEME_LABELS } from './constants';

// Register the toolbar items
// Storybook toolbar items are declared via preset.ts globals

if (typeof window !== 'undefined') {
  // The actual registration happens via the preset below
  // This file is kept for any future runtime toolbar UI customization
}
```

> **Note:** The real toolbar configuration happens in `preview.ts` via the `globalTypes` field. The `register.ts` file exists as an entry point if we later want custom toolbar UI (e.g., color swatches instead of text dropdowns).

## 4. Create the Preset

This tells Storybook about our addon.

```typescript
// packages/client/.storybook/theme-addon/preset.ts
import type { StorybookConfig } from '@storybook/react-vite';
import { THEME_MODES, THEME_SCHEMES, SCHEME_LABELS } from './constants';

const preset: StorybookConfig = {
  previewAnnotations: (entry = []) => [...entry, require.resolve('./register.ts')],
};

module.exports = preset;
```

## 5. Wire Everything into `preview.ts`

Update the preview file to include the global toolbar types and decorator:

```typescript
// packages/client/.storybook/preview.ts
import type { Preview } from '@storybook/react';
import { ThemeDecorator } from './theme-addon/ThemeDecorator';
import { THEME_MODES, THEME_SCHEMES, SCHEME_LABELS } from './theme-addon/constants';
import '../src/index.css';

const preview: Preview = {
  decorators: [ThemeDecorator],
  globalTypes: {
    themeMode: {
      name: 'Theme Mode',
      description: 'Light or dark mode',
      defaultValue: 'dark',
      toolbar: {
        title: 'Mode',
        icon: 'circlehollow',
        items: [...THEME_MODES],
        dynamicTitle: true,
      },
    },
    themeScheme: {
      name: 'Color Scheme',
      description: 'Color palette',
      defaultValue: 'neutral',
      toolbar: {
        title: 'Scheme',
        icon: 'paintbrush',
        items: [
          { value: 'neutral', title: 'Neutral' },
          { value: 'ocean', title: 'Ocean' },
          { value: 'forest', title: 'Forest' },
          { value: 'sunset', title: 'Sunset' },
          { value: 'amethyst', title: 'Amethyst' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      disable: true,
    },
    options: {
      storySort: {
        method: 'alphabetical',
        order: [
          'UI Primitives',
          'Shared',
          'Visualizations',
          'Chat',
          'Layout',
          'Modals',
          'Composite',
        ],
      },
    },
  },
};

export default preview;
```

## 6. Create a Theme Grid Helper (Optional)

For side-by-side comparison of all 10 theme combos:

```tsx
// packages/client/.storybook/theme-addon/ThemeGrid.tsx
import { useState } from 'react';
import { THEME_MODES, THEME_SCHEMES } from './constants';

interface ThemeGridProps {
  children: React.ReactNode;
  label: string;
}

export function ThemeGrid({ children, label }: ThemeGridProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{label}</h2>
      <div className="grid grid-cols-5 gap-4">
        {THEME_MODES.map((mode) =>
          THEME_SCHEMES.map((scheme) => (
            <div
              key={`${mode}-${scheme}`}
              className={`${mode} ${scheme} rounded-lg border border-border overflow-hidden`}
            >
              <div className="text-xs px-2 py-1 bg-muted text-muted-foreground border-b border-border">
                {mode} / {scheme}
              </div>
              <div className="bg-background text-foreground p-3">
                {children}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

> **Caveat:** The ThemeGrid relies on CSS cascade. Each nested `div` with theme classes would need isolation to prevent class leaking. This works better with Shadow DOM or iframe-based isolation. For now, use the toolbar switcher as the primary mechanism.

## 7. Update `main.ts` to Include the Addon

```typescript
// Add to .storybook/main.ts addons array:
addons: [
  '@storybook/addon-essentials',
  './theme-addon/preset.ts',
],
```

## 8. Verification

After setup, the Storybook toolbar should show two new dropdowns:

1. **Mode** dropdown: `light` | `dark`
2. **Scheme** dropdown: `Neutral` | `Ocean` | `Forest` | `Sunset` | `Amethyst`

Switching either should immediately update the preview area's colors, matching the real app's theme behavior.

## Files Created

```
packages/client/
  .storybook/
    main.ts                          # Updated with addon
    preview.ts                       # Updated with decorator + globalTypes
    theme-addon/
      constants.ts                   # Theme mode/scheme constants
      ThemeDecorator.tsx             # Global decorator component
      register.ts                    # Addon registration entry
      preset.ts                      # Addon preset for Storybook
      ThemeGrid.tsx                  # Optional grid comparison helper
```
