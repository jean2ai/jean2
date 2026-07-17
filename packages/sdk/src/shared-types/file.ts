export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'conflicted';

export interface GitDiffSummary {
  status: GitFileStatus;
  staged: boolean;
  unstaged: boolean;
  additions?: number;
  deletions?: number;
  oldPath?: string;
}

export interface GitAvailability {
  available: boolean;
  reason?: 'git_not_installed' | 'not_a_git_repo' | 'git_error';
  root?: string;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  extension?: string;
  git?: GitDiffSummary;
}

export interface FileListResponse {
  files: FileEntry[];
  currentPath: string;
  mode: 'browse' | 'search';
  git?: GitAvailability;
}

export interface FileSearchResult {
  files: FileEntry[];
  query: string;
  total: number;
  truncated: boolean;
}

export type FilePreviewKind =
  | 'code'
  | 'text'
  | 'markdown'
  | 'binary'
  | 'unsupported'
  | 'too_large';

export interface FilePreviewBase {
  path: string;
  name: string;
  extension?: string;
  size: number;
  kind: FilePreviewKind;
  readOnly: true;
  mimeType?: string;
  language?: string;
}

export interface FilePreviewContentResponse extends FilePreviewBase {
  kind: 'code' | 'text' | 'markdown';
  content: string;
}

export interface FilePreviewBinaryResponse extends FilePreviewBase {
  kind: 'binary';
  reason: string;
}

export interface FilePreviewUnsupportedResponse extends FilePreviewBase {
  kind: 'unsupported';
  reason: string;
}

export interface FilePreviewTooLargeResponse extends FilePreviewBase {
  kind: 'too_large';
  reason: string;
  maxBytes: number;
}

export type FilePreviewResponse =
  | FilePreviewContentResponse
  | FilePreviewBinaryResponse
  | FilePreviewUnsupportedResponse
  | FilePreviewTooLargeResponse;

export type GitFileDiffUnavailableReason =
  | 'git_not_installed'
  | 'not_a_git_repo'
  | 'not_changed'
  | 'path_outside_workspace'
  | 'file_not_found'
  | 'binary'
  | 'git_error';

export interface GitDiffChange {
  type: 'added' | 'removed' | 'context';
  content: string;
  lineNumber?: number;
  newLineNumber?: number;
}

export interface GitDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: GitDiffChange[];
}

export interface GitFileDiffResponse {
  path: string;
  diffAvailable: boolean;
  reason?: GitFileDiffUnavailableReason;
  status?: GitDiffSummary;
  hunks: GitDiffHunk[];
  additions: number;
  deletions: number;
  language?: string;
}

export interface FileRevisionConflictDetails {
  path: string;
  expectedRevision: string;
  actualRevision: string;
  currentContent: string;
}

export interface EditableFileResponse {
  path: string;
  name: string;
  extension?: string;
  size: number;
  content: string;
  revision: string;
  readOnly: false;
  mimeType?: string;
  language?: string;
  encoding: 'utf-8';
}

export interface SaveFileRequest {
  path: string;
  content: string;
  expectedRevision: string;
  root?: string;
  force?: boolean;
}

export interface SaveFileResponse {
  path: string;
  revision: string;
  size: number;
  modifiedAt: string;
}
