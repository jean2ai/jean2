import { create } from 'zustand';

export interface FilePreviewTarget {
  workspaceId: string;
  path: string;
  name: string;
}

interface FilePreviewState {
  filePreviewTarget: FilePreviewTarget | null;
}

interface FilePreviewActions {
  openFilePreview: (target: FilePreviewTarget) => void;
  closeFilePreview: () => void;
}

type FilePreviewStore = FilePreviewState & FilePreviewActions;

export const useFilePreviewStore = create<FilePreviewStore>((set) => ({
  filePreviewTarget: null,

  openFilePreview: (target) => set({ filePreviewTarget: target }),
  closeFilePreview: () => set({ filePreviewTarget: null }),
}));
