# Step 9: Scripts & CI Integration

Add npm scripts, configure the build, and optionally integrate with CI for visual regression testing.

## 1. Add Package Scripts

Update `packages/client/package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsr generate && tsc && vite build",
    "storybook": "storybook dev --port 6006",
    "build-storybook": "storybook build --output-dir storybook-static",
    "typecheck": "tsr generate && tsc --noEmit",
    "preview": "vite preview"
  }
}
```

Optionally add a root-level script in the monorepo `package.json`:

```json
{
  "scripts": {
    "storybook": "cd packages/client && bun run storybook",
    "build-storybook": "cd packages/client && bun run build-storybook"
  }
}
```

## 2. Add Storybook Dev Dependencies

```json
{
  "devDependencies": {
    "storybook": "^8.6.0",
    "@storybook/react-vite": "^8.6.0",
    "@storybook/addon-essentials": "^8.6.0",
    "@storybook/addon-toolbar": "^8.6.0",
    "@storybook/blocks": "^8.6.0"
  }
}
```

## 3. Install Command

```bash
cd packages/client
bun add -D storybook @storybook/react-vite @storybook/addon-essentials @storybook/addon-toolbar @storybook/blocks
```

## 4. `.gitignore` Additions

Add to `packages/client/.gitignore` (or root `.gitignore`):

```
# Storybook
storybook-static/
```

## 5. ESLint Configuration

Storybook files (`.stories.tsx`, `.mdx`) should follow the project's ESLint config. No special configuration needed since our `eslint.config.js` already covers `*.tsx` files.

If you want to disable certain rules in story files:

```javascript
// eslint.config.js (add to overrides)
{
  files: ['**/*.stories.tsx'],
  rules: {
    'react-hooks/rules-of-hooks': 'off', // Stories may conditionally use hooks
  },
}
```

## 6. TypeScript Configuration

Story files should be type-checked. Add to `packages/client/tsconfig.json`:

```json
{
  "include": [
    "src/**/*",
    "vite.config.ts",
    ".storybook/**/*.ts",
    ".storybook/**/*.tsx"
  ]
}
```

## 7. Build Verification

After everything is set up:

```bash
# Verify Storybook starts
bun run storybook

# Verify Storybook builds (for deployment or CI)
bun run build-storybook

# Verify type checking includes stories
bun run typecheck
```

## 8. CI Integration (Optional)

### Chromatic (Visual Regression)

If you want visual regression testing, [Chromatic](https://www.chromatic.com/) by the Storybook team is the easiest option:

```yaml
# .github/workflows/storybook.yml
name: Storybook
on:
  push:
    branches: [main]
    paths:
      - 'packages/client/src/**'
  pull_request:
    paths:
      - 'packages/client/src/**'

jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: cd packages/client && bun run build-storybook
      - uses: chromaui/action@v1
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          storybookBuildDir: packages/client/storybook-static
```

### Static Storybook Deploy (GitHub Pages)

```yaml
# .github/workflows/deploy-storybook.yml
name: Deploy Storybook
on:
  push:
    branches: [main]
    paths:
      - 'packages/client/src/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: cd packages/client && bun run build-storybook
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: packages/client/storybook-static
```

## 9. Recommended Workflow

1. **During development**: Run `bun run storybook` alongside `bun run dev:client`
2. **For theme work**: Use the toolbar to switch between all 10 theme combos
3. **For new components**: Write the story first, then build the component (TDD-style for UI)
4. **For PRs**: CI runs `build-storybook` to verify no build errors
5. **For visual reviews**: Share a Chromatic link or deploy Storybook statically
