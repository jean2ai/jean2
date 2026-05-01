# Step 5: Tier 1 — UI Primitive Stories

Write stories for all 24 shadcn/ui primitives. These are the simplest stories — zero store deps, zero SDK deps. Pure Tailwind + CSS variables.

## Why Start Here

- **Zero external dependencies** — no stores, no SDK, no context providers
- **Immediate visual feedback** — see all variants, sizes, and states
- **Validates theme system** — switching themes in the toolbar instantly shows how every primitive responds to CSS variable changes
- **Foundation for higher tiers** — all other components are built on these primitives

## Component List (24 total)

| Component | Key Variants | Key Sizes |
|-----------|-------------|-----------|
| Alert | default, destructive | — |
| Badge | default, secondary, outline, destructive | — |
| Button | default, outline, secondary, ghost, destructive, link | xs, sm, default, lg, icon, icon-xs, icon-sm, icon-lg |
| Checkbox | checked, unchecked, disabled | — |
| Collapsible | open, closed | — |
| Command | with items, empty, loading | — |
| ConfirmationDialog | default, destructive | — |
| Dialog | open, closed | — |
| DropdownMenu | with items, with icons | — |
| Input | default, disabled, with placeholder | — |
| InputGroup | with label, with icon | — |
| Label | default | — |
| Popover | open, closed | — |
| Progress | 0%, 50%, 100% | — |
| ScrollArea | short content, overflow content | — |
| Select | with options, disabled | — |
| Separator | horizontal, vertical | — |
| Sheet | left, right, top, bottom | — |
| Sidebar | collapsed, expanded | — |
| Skeleton | text, avatar, card | — |
| Switch | on, off, disabled | — |
| Tabs | with content, dynamic tabs | — |
| Textarea | default, disabled, with value | — |
| Tooltip | default, with delay | — |

## Story Template

Use this template for each component. Stories go **alongside the component** in the same directory.

```typescript
// packages/client/src/components/ui/button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';
import { Mail, Plus, ChevronRight } from 'lucide-react';

const meta: Meta<typeof Button> = {
  title: 'UI Primitives/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'],
    },
    disabled: {
      control: 'boolean',
    },
    children: {
      control: 'text',
    },
  },
  args: {
    children: 'Button',
    variant: 'default',
    size: 'default',
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

// --- Basic Variants ---

export const Default: Story = {
  args: { variant: 'default', children: 'Default' },
};

export const Outline: Story = {
  args: { variant: 'outline', children: 'Outline' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Secondary' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Ghost' },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Destructive' },
};

export const Link: Story = {
  args: { variant: 'link', children: 'Link Button' },
};

// --- Sizes ---

export const ExtraSmall: Story = {
  args: { size: 'xs', children: 'XS' },
};

export const Small: Story = {
  args: { size: 'sm', children: 'Small' },
};

export const Large: Story = {
  args: { size: 'lg', children: 'Large' },
};

// --- With Icons ---

export const WithIconStart: Story = {
  args: { children: <><Plus className="size-4" data-icon="inline-start" />Add Item</> },
};

export const WithIconEnd: Story = {
  args: { children: <>Next<ChevronRight className="size-4" data-icon="inline-end" /></> },
};

export const IconOnly: Story = {
  args: { size: 'icon', children: <Mail className="size-4" /> },
};

// --- States ---

export const Disabled: Story = {
  args: { disabled: true, children: 'Disabled' },
};

// --- All Variants Grid ---

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Button variant="default">Default</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

// --- All Sizes Grid ---

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 items-center">
      <Button size="xs">XS</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon-xs"><Mail className="size-3" /></Button>
      <Button size="icon-sm"><Mail className="size-3.5" /></Button>
      <Button size="icon"><Mail className="size-4" /></Button>
      <Button size="icon-lg"><Mail className="size-4" /></Button>
    </div>
  ),
};
```

## Minimal Components (Quick Stories)

Some primitives are very simple and only need one or two stories:

```typescript
// packages/client/src/components/ui/separator.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Separator } from './separator';

const meta: Meta<typeof Separator> = {
  title: 'UI Primitives/Separator',
  component: Separator,
};

export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-full max-w-md">
      <p>Content above</p>
      <Separator className="my-4" />
      <p>Content below</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex items-center h-8 gap-4">
      <span>Left</span>
      <Separator orientation="vertical" />
      <span>Right</span>
    </div>
  ),
};
```

## Batch Writing Strategy

Since there are 24 components, use this efficient approach:

1. **Start with the template** above for each component
2. **Identify variants** from the component's `cva()` or prop types
3. **Create a grid story** for side-by-side variant comparison
4. **Add state stories** (disabled, loading, error) where applicable
5. **Skip autodocs** if the component has complex internal logic — write manual stories instead

Components that take <5 minutes each to write stories for:
- Alert, Badge, Checkbox, Input, Label, Progress, ScrollArea, Select, Separator, Skeleton, Switch, Textarea, Tooltip

Components that need more thought (10-15 min each):
- Button (many variants/sizes), Command (complex), Dialog (open/close state), DropdownMenu (items), Popover (positioning), Sheet (sides), Sidebar (full layout context), Tabs (dynamic content), ConfirmationDialog (custom dialog wrapper), InputGroup (label/icon composition), Collapsible (open/close animation)

## Files Created

```
packages/client/src/components/ui/
  alert.stories.tsx
  badge.stories.tsx
  button.stories.tsx
  checkbox.stories.tsx
  collapsible.stories.tsx
  command.stories.tsx
  confirmation-dialog.stories.tsx
  dialog.stories.tsx
  dropdown-menu.stories.tsx
  input-group.stories.tsx
  input.stories.tsx
  label.stories.tsx
  popover.stories.tsx
  progress.stories.tsx
  scroll-area.stories.tsx
  select.stories.tsx
  separator.stories.tsx
  sheet.stories.tsx
  sidebar.stories.tsx
  skeleton.stories.tsx
  switch.stories.tsx
  tabs.stories.tsx
  textarea.stories.tsx
  tooltip.stories.tsx
```
