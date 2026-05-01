import type { ComponentType } from 'react';
import { ThemeDecorator } from './theme-addon/ThemeDecorator';
import { THEME_MODES, THEME_SCHEMES, SCHEME_LABELS } from './theme-addon/constants';
import { resetAllStores } from './mocks/storeCleanup';
import '../src/index.css';

// Global decorator: reset all Zustand stores before each story to prevent state leaking
function StoreCleanupDecorator(Story: ComponentType) {
  resetAllStores();
  return <Story />;
}

export default {
  decorators: [StoreCleanupDecorator, ThemeDecorator],
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
        items: THEME_SCHEMES.map((scheme) => ({
          value: scheme,
          title: SCHEME_LABELS[scheme],
        })),
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
