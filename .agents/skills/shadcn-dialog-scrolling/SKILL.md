---
name: shadcn-dialog-scrolling
description: Dialog/modal layout patterns in jean2 client — responsive flex scrolling, mobile PWA safe-area, padding. Load when building or fixing dialogs (DialogContent, ScrollArea not scrolling, mobile overflow/clipping, notched PWA close button).
---

# Dialog Layout Patterns (jean2 client)

Procedural guide for building/fixing dialogs in `packages/client/src/components/modals/`.

## Key files

- Base component: `packages/client/src/components/ui/dialog.tsx` — `DialogContent` already handles safe-area centering + mobile max-height. **Do not override its mobile `max-h`** (see Pitfall #1).
- Utility: `packages/client/src/lib/utils.ts` — `cn()` = `twMerge(clsx(...))`. Conflicting Tailwind classes are merged with **last-wins** per property group.

## Step 0: Classify the dialog

| Type | When | Width class example |
|------|------|---------------------|
| **Simple** | Content always fits viewport (confirm, short forms) | `sm:max-w-[425px]` |
| **Scrolling** | Content may exceed viewport (lists, settings, config) | `sm:max-w-[800px] sm:max-h-[85vh]` + flex layout |

Simple dialogs: just pass width to `DialogContent`, done. No flex, no scroll wrapper.

## Step 1: Scrolling dialog — the correct layout

```tsx
<DialogContent className="flex flex-col overflow-hidden p-3 sm:p-4 gap-3 sm:gap-4 max-w-[calc(100vw-0.5rem)] sm:max-w-[800px] sm:max-h-[85vh]">
  <DialogHeader className="shrink-0">
    <DialogTitle>Title</DialogTitle>
    <DialogDescription>Subtitle</DialogDescription>
  </DialogHeader>

  {/* Scrollable content — plain div, NOT ScrollArea */}
  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-lg border">
    {/* panel content */}
  </div>
</DialogContent>
```

**Every piece matters:**
- `flex flex-col overflow-hidden` on DialogContent — overrides base `grid` (tailwind-merge last-wins)
- `shrink-0` on header — prevents it from being squeezed
- `flex-1 min-h-0 overflow-y-auto` on the scroll container — **`min-h-0` is mandatory**; without it the flex item won't shrink below content height and will never scroll
- `overscroll-contain` — prevents scroll chaining to the page behind the dialog

## Step 2: Tabs + sidebar variant (Configuration/Settings pattern)

For dialogs with a left sidebar (desktop) + dropdown (mobile):

```tsx
<DialogContent className="flex flex-col overflow-hidden p-3 sm:p-4 gap-3 sm:gap-4 ... sm:max-h-[85vh]">
  <DialogHeader className="shrink-0">...</DialogHeader>

  {/* Mobile dropdown */}
  <SelectTrigger className="sm:hidden w-full shrink-0" />

  <Tabs orientation="vertical" className="mt-2 flex-1 min-h-0">
    <TabsList className="hidden sm:flex flex-col h-fit w-44 shrink-0 ..." />

    {/* Scrollable content area */}
    <div className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain rounded-lg border">
      <TabsContent value="x" className="mt-0">...</TabsContent>
    </div>
  </Tabs>
</DialogContent>
```

## Step 3: Mobile padding

Panels inside the scroll area should use `p-3 sm:p-4` (not bare `p-4`) to avoid clipping on narrow PWA screens. The dialog padding (`p-3 sm:p-4`) + panel padding stack, so on mobile you get 24px total instead of 32px.

## Pitfalls (all hit during this work)

### #1 — tailwind-merge kills base safe-area (CRITICAL)
`DialogContent` base has `max-h-[calc(100dvh-env(safe-area-inset-top,0px))]` for notch protection. If you pass `max-h-[calc(100dvh-2rem)]`, tailwind-merge sees the same `max-h` group and **keeps only yours** — silently discarding safe-area protection. The close button ends up behind the notch.
**Fix:** Never pass a mobile `max-h`. Only pass `sm:max-h-[85vh]` (different breakpoint, no conflict).

### #2 — Radix ScrollArea doesn't scroll in flex dialogs
`ScrollArea` (`@/components/ui/scroll-area`) Root/Viewport use `size-full` (percentage height). When the parent's height comes from flex/max-height clamping (not explicit `height`), percentage height resolves to `auto` → ScrollArea grows to full content → never constrains → never scrolls. This is **flaky across browsers**, especially mobile WebKit.
Tried and **all failed**: `h-full`, `flex-1 min-h-0`, `absolute inset-0` inside `relative` wrapper.
**Fix:** Replace `ScrollArea` with a plain `<div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">`. Remove the `ScrollArea` import.

### #3 — Fixed-pixel ScrollArea heights
Older dialogs (MCP, WorkspacePermissions) use `<ScrollArea className="h-[400px]">`. This works because fixed pixels ARE a definite height, but it's fragile (magic number, doesn't adapt). When touching these, convert to the flex pattern.

### #4 — Magic-number heights
Never use `h-[calc(100dvh-18rem)]` or `sm:h-[500px]`. These don't adapt to actual dialog size. Use `flex-1 min-h-0` to fill available space.

### #5 — Close button behind notch
Already handled in the base `DialogContent` via safe-region centering (`top-[calc(50dvh+env(safe-area-inset-top,0px)/2)]`). Only breaks if you override mobile `max-h` (see #1).

### #6 — Unstyled native scrollbar
Plain `<div className="overflow-y-auto">` shows the browser's default scrollbar (chunky, unstyled). Add the `.dialog-scrollbar` class (defined in `index.css`) to match the app's aesthetic: thin (6px), transparent track, `muted-foreground` thumb at 35% opacity, 55% on hover.

### #7 — Dialog height jumps when switching tabs
Using `sm:max-h-[85vh]` lets the dialog shrink to fit each panel's content, causing layout jumps when switching tabs. Use a **fixed height** `h-[85dvh] sm:h-[85vh]` instead so the dialog stays a constant size — only the inner scroll area changes.

## Verification

1. `cd packages/client && bunx tsc --noEmit -p tsconfig.json` — must pass (0 errors)
2. `bunx eslint <changed-files>` — must pass
3. Manual: open dialog on mobile PWA viewport — close button tappable, content scrolls, nothing clips

