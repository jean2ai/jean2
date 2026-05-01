# Reference: File Structure

Complete directory structure after all steps are implemented.

```
packages/client/
├── .storybook/
│   ├── main.ts                          # Core Storybook config (Vite builder, plugins, aliases)
│   ├── preview.ts                       # Global decorators, theme toolbar, CSS import
│   └── theme-addon/
│       ├── constants.ts                 # Theme mode/scheme constants
│       ├── ThemeDecorator.tsx           # Global decorator applying theme classes
│       ├── register.ts                  # Addon registration entry point
│       ├── preset.ts                    # Addon preset for Storybook
│       └── ThemeGrid.tsx                # Optional grid comparison helper
│
├── src/
│   ├── mocks/
│   │   ├── sdk.ts                       # SDK type factory functions
│   │   ├── stores.ts                    # Zustand store override decorators
│   │   └── store-cleanup.ts            # Reset utility between stories
│   │
│   ├── components/
│   │   ├── ui/                          # Tier 1: 24 shadcn/ui primitives
│   │   │   ├── alert.tsx
│   │   │   ├── alert.stories.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── badge.stories.tsx
│   │   │   ├── button.tsx
│   │   │   ├── button.stories.tsx
│   │   │   ├── checkbox.tsx
│   │   │   ├── checkbox.stories.tsx
│   │   │   ├── collapsible.tsx
│   │   │   ├── collapsible.stories.tsx
│   │   │   ├── command.tsx
│   │   │   ├── command.stories.tsx
│   │   │   ├── confirmation-dialog.tsx
│   │   │   ├── confirmation-dialog.stories.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dialog.stories.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── dropdown-menu.stories.tsx
│   │   │   ├── input.tsx
│   │   │   ├── input.stories.tsx
│   │   │   ├── input-group.tsx
│   │   │   ├── input-group.stories.tsx
│   │   │   ├── label.tsx
│   │   │   ├── label.stories.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── popover.stories.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── progress.stories.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── scroll-area.stories.tsx
│   │   │   ├── select.tsx
│   │   │   ├── select.stories.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── separator.stories.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── sheet.stories.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── sidebar.stories.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── skeleton.stories.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── switch.stories.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── tabs.stories.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── textarea.stories.tsx
│   │   │   ├── tooltip.tsx
│   │   │   └── tooltip.stories.tsx
│   │   │
│   │   ├── shared/                      # Tier 2: Shared utility components
│   │   │   ├── EmptyState.tsx
│   │   │   ├── EmptyState.stories.tsx
│   │   │   ├── LoadingSkeleton.tsx
│   │   │   ├── LoadingSkeleton.stories.tsx
│   │   │   ├── MarkdownRenderer.tsx
│   │   │   ├── MarkdownRenderer.stories.tsx
│   │   │   ├── OfflineState.tsx
│   │   │   ├── OfflineState.stories.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   └── ThemeToggle.stories.tsx
│   │   │
│   │   ├── visualizations/              # Tier 2: Visualization components
│   │   │   ├── CodeBlock.tsx
│   │   │   ├── CodeBlock.stories.tsx
│   │   │   ├── DiffViewer.tsx
│   │   │   ├── DiffViewer.stories.tsx
│   │   │   ├── FileListViewer.tsx
│   │   │   ├── FileListViewer.stories.tsx
│   │   │   ├── SuccessIndicator.tsx
│   │   │   ├── SuccessIndicator.stories.tsx
│   │   │   ├── TerminalOutput.tsx
│   │   │   ├── TerminalOutput.stories.tsx
│   │   │   ├── TodoList.tsx
│   │   │   ├── TodoList.stories.tsx
│   │   │   ├── VisualizationRenderer.tsx
│   │   │   └── VisualizationRenderer.stories.tsx
│   │   │
│   │   ├── chat/                        # Tier 3: Chat components
│   │   │   ├── AskQuestion.tsx
│   │   │   ├── AskQuestion.stories.tsx
│   │   │   ├── ChatHeader.tsx
│   │   │   ├── ChatHeader.stories.tsx
│   │   │   ├── ChatView.tsx
│   │   │   ├── FileMentionChip.tsx
│   │   │   ├── FileMentionChip.stories.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── MessageBubble.stories.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   ├── MessageInput.stories.tsx
│   │   │   ├── ModelSelector.tsx
│   │   │   ├── ModelSelector.stories.tsx
│   │   │   ├── PendingAttachment.tsx
│   │   │   ├── PendingAttachment.stories.tsx
│   │   │   ├── PreconfigSelector.tsx
│   │   │   ├── PreconfigSelector.stories.tsx
│   │   │   ├── PromptAutocomplete.tsx
│   │   │   ├── PromptAutocomplete.stories.tsx
│   │   │   ├── TokenMeter.tsx
│   │   │   ├── TokenMeter.stories.tsx
│   │   │   ├── ToolCall.tsx
│   │   │   ├── ToolCall.stories.tsx
│   │   │   ├── TypingIndicator.tsx
│   │   │   ├── TypingIndicator.stories.tsx
│   │   │   ├── VariantSelector.tsx
│   │   │   ├── VariantSelector.stories.tsx
│   │   │   ├── VirtualizedTranscript.tsx
│   │   │   └── VirtualizedTranscript.stories.tsx
│   │   │
│   │   ├── layout/                      # Tier 4: Layout components
│   │   │   ├── AppSidebar.tsx
│   │   │   ├── AppSidebar.stories.tsx
│   │   │   ├── FilesPanel.tsx
│   │   │   ├── FilesPanel.stories.tsx
│   │   │   ├── QuickSwitcher.tsx
│   │   │   ├── QuickSwitcher.stories.tsx
│   │   │   ├── ResizablePanel.tsx
│   │   │   ├── ResizablePanel.stories.tsx
│   │   │   ├── ServerSwitcher.tsx
│   │   │   ├── ServerSwitcher.stories.tsx
│   │   │   ├── SessionMenuButton.tsx
│   │   │   ├── SessionMenuButton.stories.tsx
│   │   │   ├── SidebarLayoutToggle.tsx
│   │   │   ├── SidebarLayoutToggle.stories.tsx
│   │   │   ├── TerminalPanel.tsx
│   │   │   ├── TerminalPanel.stories.tsx
│   │   │   ├── TerminalView.tsx
│   │   │   ├── TerminalView.stories.tsx
│   │   │   ├── WorkspaceOverview.tsx
│   │   │   ├── WorkspaceOverview.stories.tsx
│   │   │   ├── WorkspaceSessionContent.tsx
│   │   │   ├── WorkspaceSessionContent.stories.tsx
│   │   │   ├── WorkspaceSwitcher.tsx
│   │   │   └── WorkspaceSwitcher.stories.tsx
│   │   │
│   │   └── modals/                      # Tier 4: Modal components
│   │       ├── AddServerDialog.tsx
│   │       ├── AddServerDialog.stories.tsx
│   │       ├── ConfigurationDialog.tsx
│   │       ├── ConfigurationDialog.stories.tsx
│   │       ├── ConfirmDialog.tsx
│   │       ├── ConfirmDialog.stories.tsx
│   │       ├── FolderPickerDialog.tsx
│   │       ├── FolderPickerDialog.stories.tsx
│   │       ├── MCPManagementDialog.tsx
│   │       ├── MCPManagementDialog.stories.tsx
│   │       ├── PermissionListItem.tsx
│   │       ├── PermissionListItem.stories.tsx
│   │       ├── SettingsDialog.tsx
│   │       ├── SettingsDialog.stories.tsx
│   │       ├── ToolsDialog.tsx
│   │       ├── ToolsDialog.stories.tsx
│   │       ├── WorkspacePermissionsDialog.tsx
│   │       ├── WorkspacePermissionsDialog.stories.tsx
│   │       └── configuration/
│   │           ├── ModelsPanel.tsx
│   │           ├── ModelsPanel.stories.tsx
│   │           ├── OAuthProvidersPanel.tsx
│   │           ├── OAuthProvidersPanel.stories.tsx
│   │           ├── PreconfigsPanel.tsx
│   │           ├── PreconfigsPanel.stories.tsx
│   │           ├── ProviderCredentialsPanel.tsx
│   │           ├── ProviderCredentialsPanel.stories.tsx
│   │           ├── PromptsPanel.tsx
│   │           └── PromptsPanel.stories.tsx
│   │
│   ├── stores/                          # Zustand stores (existing)
│   ├── lib/                             # Utilities (existing)
│   └── index.css                        # Global styles (existing)
│
├── components.json                      # shadcn config (existing)
├── package.json                         # Updated with storybook scripts
├── tsconfig.json                        # Updated include paths
└── vite.config.ts                       # Vite config (existing, unchanged)
```

## File Count Summary

| Category | New Files |
|----------|-----------|
| Storybook config | 7 (`.storybook/`) |
| Mock data & stores | 3 (`src/mocks/`) |
| UI primitive stories | 24 |
| Shared component stories | 5 |
| Visualization stories | 7 |
| Chat component stories | 14 |
| Layout stories | 12 |
| Modal stories | 14 |
| **Total new files** | **~86** |

## No Modifications to Existing Files

The integration is non-invasive:

- **No changes** to any existing component files
- **No changes** to `vite.config.ts`
- **No changes** to `index.css`
- **Minimal changes** to `package.json` (just scripts + devDeps)
- **Minimal changes** to `tsconfig.json` (include `.storybook/`)
