import type { HttpClient } from '../transport/http';
import type {
  BrowseFilesResponse,
  SearchFilesResponse,
  PreviewFileResponse,
  GitDiffFileResponse,
  GitStatusResponse,
  BrowseFsResponse,
  FsParentResponse,
  ListDrivesResponse,
  ReadEditableFileResponse,
  SaveFileResponse,
} from '../types/rest-responses';
import type { SaveFileRequest } from '../shared';

interface BrowseOptions {
  path?: string;
  showHidden?: boolean;
  limit?: number;
  root?: string;
  signal?: AbortSignal;
}

interface SearchOptions {
  limit?: number;
  showHidden?: boolean;
  root?: string;
  signal?: AbortSignal;
}

interface PreviewOptions {
  signal?: AbortSignal;
}

interface ReadEditableOptions {
  root?: string;
  signal?: AbortSignal;
}

interface SaveOptions {
  signal?: AbortSignal;
}

interface BrowseFsOptions {
  signal?: AbortSignal;
}

interface FsParentOptions {
  signal?: AbortSignal;
}

interface DrivesOptions {
  signal?: AbortSignal;
}

export class FilesRestNamespace {
  constructor(private http: HttpClient) {}

  async browse(workspaceId: string, path?: string, options?: BrowseOptions): Promise<BrowseFilesResponse> {
    const params: Record<string, string> = {};

    if (path !== undefined) {
      params.path = path;
    }
    if (options?.showHidden !== undefined) {
      params.showHidden = String(options.showHidden);
    }
    if (options?.limit !== undefined) {
      params.limit = String(options.limit);
    }
    if (options?.root !== undefined) {
      params.root = options.root;
    }

    return this.http.get(`/workspaces/${encodeURIComponent(workspaceId)}/files`, {
      params: Object.keys(params).length > 0 ? params : undefined,
      signal: options?.signal,
    });
  }

  async search(workspaceId: string, query: string, options?: SearchOptions): Promise<SearchFilesResponse> {
    const params: Record<string, string> = {
      search: query,
    };

    if (options?.limit !== undefined) {
      params.limit = String(options.limit);
    }
    if (options?.showHidden !== undefined) {
      params.showHidden = String(options.showHidden);
    }
    if (options?.root !== undefined) {
      params.root = options.root;
    }

    return this.http.get(`/workspaces/${encodeURIComponent(workspaceId)}/files`, {
      params,
      signal: options?.signal,
    });
  }

  async preview(workspaceId: string, path: string, options?: PreviewOptions & { root?: string }): Promise<PreviewFileResponse> {
    const params: Record<string, string> = { path };
    if (options?.root !== undefined) {
      params.root = options.root;
    }
    return this.http.get(`/workspaces/${encodeURIComponent(workspaceId)}/file-preview`, {
      params,
      signal: options?.signal,
    });
  }

  async readEditable(workspaceId: string, path: string, options?: ReadEditableOptions): Promise<ReadEditableFileResponse> {
    const params: Record<string, string> = { path };
    if (options?.root !== undefined) {
      params.root = options.root;
    }
    return this.http.get(`/workspaces/${encodeURIComponent(workspaceId)}/file`, {
      params,
      signal: options?.signal,
    });
  }

  async save(workspaceId: string, request: SaveFileRequest, options?: SaveOptions): Promise<SaveFileResponse> {
    return this.http.put(`/workspaces/${encodeURIComponent(workspaceId)}/file`, request, {
      signal: options?.signal,
    });
  }

  async gitDiff(
    workspaceId: string,
    path: string,
    options?: { root?: string; signal?: AbortSignal },
  ): Promise<GitDiffFileResponse> {
    const params: Record<string, string> = { path };
    if (options?.root !== undefined) {
      params.root = options.root;
    }
    return this.http.get(`/workspaces/${encodeURIComponent(workspaceId)}/git/diff`, {
      params,
      signal: options?.signal,
    });
  }

  async gitStatus(
    workspaceId: string,
    options?: { root?: string; signal?: AbortSignal },
  ): Promise<GitStatusResponse> {
    const params: Record<string, string> = {};
    if (options?.root !== undefined) {
      params.root = options.root;
    }
    return this.http.get(`/workspaces/${encodeURIComponent(workspaceId)}/git/status`, {
      params: Object.keys(params).length > 0 ? params : undefined,
      signal: options?.signal,
    });
  }

  async browseFs(path?: string, options?: BrowseFsOptions): Promise<BrowseFsResponse> {
    return this.http.get('/fs/browse', {
      params: path !== undefined ? { path } : undefined,
      signal: options?.signal,
    });
  }

  async parent(path: string, options?: FsParentOptions): Promise<FsParentResponse> {
    return this.http.get('/fs/parent', {
      params: { path },
      signal: options?.signal,
    });
  }

  async drives(options?: DrivesOptions): Promise<ListDrivesResponse> {
    return this.http.get('/fs/drives', { signal: options?.signal });
  }
}
