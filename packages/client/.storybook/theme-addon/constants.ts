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
