# Step 1: Initial Setup

Install Storybook 8 with the Vite builder and configure it for our React 19 + Tailwind CSS v4 + Vite 8 stack.

## 1. Install Dependencies

Run from `packages/client/`:

```bash
bun add -D storybook @storybook/react-vite @storybook/addon-essentials @storybook/addon-toolbar @storybook/blocks
```

> **Note:** Do NOT use `bunx storybook init`. It's opinionated and may conflict with our Vite 8 + React 19 + Tailwind v4 setup. We'll create config files manually.

## 2. Create `.storybook/main.ts`

This is the core configuration. Key concerns:

- Use the `@storybook/react-vite` builder
- Include the same Vite plugins as our app (React with Compiler, Tailwind) but **exclude TanStack Router** — it has no routes in Storybook
- Resolve the `@/` path alias identically to `vite.config.ts`
- Resolve the `@jean2/sdk` workspace dependency

```typescript
// packages/client/.storybook/main.ts
import type { StorybookConfig } from '@storybook/react-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.tsx',
    '../src/**/*.mdx',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-toolbar',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (config) => {
    // Apply the same plugins as our app (minus TanStack Router)
    config.plugins = [
      react({
        reactCompiler: {
          target: '19',
        },
      }),
      tailwindcss(),
      ...(config.plugins || []),
    ];

    // Apply the same path aliases
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, '../src'),
    };

    // Ensure workspace packages resolve
    config.optimizeDeps = config.optimizeDeps || {};
    config.optimizeDeps.include = [
      '@jean2/sdk',
    ];

    return config;
  },
};

export default config;
```

### Why exclude TanStack Router?

The `TanStackRouterVite` plugin auto-generates route files from the `src/routes/` directory. In Storybook there are no routes — the plugin would either error or generate unnecessary code. All our components import directly, not through routes.

## 3. Create `.storybook/preview.ts`

This file controls what's rendered around every story.

```typescript
// packages/client/.storybook/preview.ts
import type { Preview } from '@storybook/react';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      // Disable Storybook's built-in background addon
      // Our theme system handles backgrounds via CSS variables
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

### Why import `index.css`?

Our `src/index.css` is the single source of truth for all theming:

- Tailwind CSS v4 base + utilities
- `tw-animate-css` animations
- `shadcn/tailwind.css` component tokens
- Geist Variable font
- All CSS custom properties (background, foreground, primary, etc.)
- The two-axis theme system (light/dark × 5 schemes)
- Scrollbar styles, code block styles, xterm styles

By importing it here, every story automatically inherits the full design system.

### Why disable Storybook's backgrounds?

Storybook's built-in background addon sets inline `background-color` on the preview iframe. This conflicts with our CSS-variable-driven theming where `--background` controls the page background. Our theme decorator (Step 2) handles background colors correctly.

## 4. Verification

After creating these two files, run:

```bash
cd packages/client
bunx storybook dev --port 6006
```

You should see:
- Storybook loads at `http://localhost:6006`
- No stories yet (expected — we haven't written any)
- No build errors
- The preview area uses our Geist font and base CSS variables

## 5. Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `Cannot find module @/lib/utils` | Path alias not resolving | Check `config.resolve.alias` in `main.ts` |
| `@tailwindcss/vite` plugin errors | Plugin ordering in `viteFinal` | Ensure `tailwindcss()` plugin is listed before other plugins |
| React Compiler errors | Missing `babel-plugin-react-compiler` | Ensure it's in `devDependencies` |
| `@jean2/sdk` not found | Workspace resolution | Check `config.optimizeDeps.include` |

## Files Created

```
packages/client/
  .storybook/
    main.ts      # Core Storybook config
    preview.ts   # Global preview config + CSS import
```
