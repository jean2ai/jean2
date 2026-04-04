export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  extension?: string;
}

export interface FileListResponse {
  files: FileEntry[];
  currentPath: string;
  mode: 'browse' | 'search';
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
