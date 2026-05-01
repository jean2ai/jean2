import { useEffect } from 'react';
import { useGlobals } from 'storybook/preview-api';
import type { StoryContext } from 'storybook/internal/csf';
import { THEME_MODES, THEME_SCHEMES } from './constants';
import type { StorybookThemeMode, StorybookThemeScheme } from './constants';

function isValidMode(value: string): value is StorybookThemeMode {
  return THEME_MODES.includes(value as StorybookThemeMode);
}

function isValidScheme(value: string): value is StorybookThemeScheme {
  return THEME_SCHEMES.includes(value as StorybookThemeScheme);
}

export function ThemeDecorator(Story: React.ComponentType, context: StoryContext) {
  const [globals] = useGlobals();

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
