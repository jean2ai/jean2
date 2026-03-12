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
