// Backward-compat re-exports — new code should import from the specific stores
export { useDialogStore } from './dialogStore';
export { useChatLayoutStore, type SidebarViewMode } from './chatLayoutStore';
export { useCompletionStore, type CompletionRecord, selectCompletionRecord, selectIsFlashing, selectIsSticky, COMPLETION_FLASH_DURATION_MS } from './completionStore';
export { useFilePreviewStore, type FilePreviewTarget } from './filePreviewStore';
