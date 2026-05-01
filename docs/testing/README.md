# Testing & Component Development

## Storybook Integration

Visual component development environment for `@jean2/client`.

### Overview

Storybook lets us develop and test UI components in isolation — without running the full app or backend server. It's especially valuable for Jean2 because of our **two-axis theme system** (light/dark × 5 color schemes = 10 combinations).

### What We'll Get

- **Theme toolbar** — toggle between all 10 theme combos from a Storybook toolbar dropdown
- **Component stories** — every component rendered in isolation with multiple state variations
- **Mock data** — reusable fixtures for SDK types (messages, sessions, models, etc.)
- **Store mocking** — Zustand stores overridden per-story with controlled state

### Implementation Steps

| Step | File | Description |
|------|------|-------------|
| 1 | [01-initial-setup.md](./storybook/01-initial-setup.md) | Install Storybook, configure Vite builder + aliases |
| 2 | [02-theme-addon.md](./storybook/02-theme-addon.md) | Build the theme-switching toolbar decorator |
| 3 | [03-mock-data.md](./storybook/03-mock-data.md) | Create mock SDK types and fixture factories |
| 4 | [04-store-mocking.md](./storybook/04-store-mocking.md) | Zustand store override patterns for stories |
| 5 | [05-tier1-ui-primitives.md](./storybook/05-tier1-ui-primitives.md) | Stories for 24 shadcn/ui primitives |
| 6 | [06-tier2-shared-components.md](./storybook/06-tier2-shared-components.md) | Stories for shared + visualization components |
| 7 | [07-tier3-chat-components.md](./storybook/07-tier3-chat-components.md) | Stories for chat components |
| 8 | [08-tier4-composite-blocks.md](./storybook/08-tier4-composite-blocks.md) | Stories for layouts, modals, app-level blocks |
| 9 | [09-scripts-and-ci.md](./storybook/09-scripts-and-ci.md) | Package scripts, build, and CI integration |
| Ref | [10-file-structure.md](./storybook/10-file-structure.md) | Full directory structure reference |

### Dependency Graph

```
Step 1 (Initial Setup)
  ├── Step 2 (Theme Addon)
  │     └── Steps 5, 6, 7, 8 all depend on this
  └── Step 3 (Mock Data)
        └── Step 4 (Store Mocking)
              └── Steps 6, 7, 8 depend on both 3 + 4

Step 5 (UI Primitives) ← can start as soon as Steps 1 + 2 are done
Steps 6, 7, 8 ← parallelizable once Steps 2, 3, 4 are done
Step 9 ← final, after everything works
```

### Component Inventory

| Tier | Category | Count | Store Deps | SDK Type Deps |
|------|----------|-------|------------|---------------|
| 1 | UI primitives (`ui/*`) | 24 | None | None |
| 2 | Shared + Visualizations | 12 | Minimal (2 use stores) | Yes (types) |
| 3 | Chat components | 15 | Yes (sessionStore) | Yes |
| 4 | Layouts + Modals + App | 20+ | Yes (multiple) | Yes |

### Quick Start (after setup)

```bash
# From repo root
bun run storybook

# Or from client package
cd packages/client
bun run storybook
```
