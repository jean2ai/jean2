import { extname } from 'path';
import { fileURLToPath } from 'url';

import type {
  DefinitionResult,
  Diagnostic,
  DocumentSymbolResult,
  HoverResult,
  OpenFileInfo,
  Position,
  ReferencesResult,
  WorkspaceId,
} from '@/types';
import { BaseLSPClient, createClientForLanguage } from '@/clients';
import { DiagnosticsManager } from '@/diagnostics';
import { getDiagnosticsTimeoutMs } from './env';

export class WorkspaceSession {
  readonly workspaceId: WorkspaceId;
  readonly workspaceRoot: string;
  readonly createdAt: number;
  lastAccessedAt: number;

  private clients: Map<string, BaseLSPClient> = new Map();
  private openFiles: Map<string, OpenFileInfo> = new Map();
  private diagnostics: DiagnosticsManager;
  private pendingDiagnostics: Map<string, { resolve: (diag: Diagnostic[]) => void; timeout: ReturnType<typeof setTimeout> }> = new Map();
  private clientStartPromises: Map<string, Promise<BaseLSPClient>> = new Map();

  constructor(workspaceId: WorkspaceId, workspaceRoot: string) {
    this.workspaceId = workspaceId;
    this.workspaceRoot = workspaceRoot;
    this.createdAt = Date.now();
    this.lastAccessedAt = Date.now();
    this.diagnostics = new DiagnosticsManager();
  }

  updateAccess(): void {
    this.lastAccessedAt = Date.now();
  }

  async shutdown(): Promise<void> {
    for (const [_languageId, client] of this.clients) {
      try {
        await client.stop();
      } catch (err) {
        console.error('Error stopping LSP client:', err);
      }
    }
    this.clients.clear();
    this.clientStartPromises.clear();
    this.openFiles.clear();
    this.diagnostics.clearAll();
  }

  getClient(languageId: string): BaseLSPClient | undefined {
    return this.clients.get(languageId);
  }

  getClientForFile(uri: string): BaseLSPClient | undefined {
    const languageId = this.getLanguageId(uri);
    return this.clients.get(languageId);
  }

  async startClientIfNeeded(languageId: string): Promise<BaseLSPClient> {
    const existingClient = this.clients.get(languageId);

    if (existingClient) {
      return existingClient;
    }

    const inflight = this.clientStartPromises.get(languageId);
    if (inflight) {
      return inflight;
    }

    const startPromise = this._startClient(languageId);
    this.clientStartPromises.set(languageId, startPromise);

    try {
      return await startPromise;
    } finally {
      this.clientStartPromises.delete(languageId);
    }
  }

  private async _startClient(languageId: string): Promise<BaseLSPClient> {
    const existingClient = this.clients.get(languageId);
    if (existingClient) {
      return existingClient;
    }

    const newClient = createClientForLanguage(languageId);

    if (!newClient) {
      throw new Error(`Unsupported language: ${languageId}`);
    }

    newClient.setDiagnosticsCallback((uri, diagnostics) => {
      this.handleDiagnosticsFromClient(uri, diagnostics);
    });

    try {
      await newClient.start(this.workspaceRoot);
      this.clients.set(languageId, newClient);
      return newClient;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('ENOENT') || message.includes('spawn') || message.includes('not found')) {
        const suggestion = languageId === 'typescript'
          ? 'Please install typescript-language-server: npm install -g typescript-language-server'
          : `Please install the LSP server for ${languageId}`;
        throw new Error(`LSP server not found. ${suggestion}`, { cause: err });
      }

      throw err;
    }
  }

  async openFile(uri: string, content: string): Promise<void> {
    const languageId = this.getLanguageId(uri);

    try {
      const client = await this.startClientIfNeeded(languageId);
      const version = this.openFiles.size + 1;

      await client.openFile(uri, content);

      this.openFiles.set(uri, {
        uri,
        languageId,
        version,
        content,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to open file ${uri}: ${message}`, { cause: err });
    }
  }

  async closeFile(uri: string): Promise<void> {
    const fileInfo = this.openFiles.get(uri);

    if (!fileInfo) {
      return;
    }

    try {
      const client = this.clients.get(fileInfo.languageId);

      if (client) {
        await client.closeFile(uri);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error closing file ${uri}: ${message}`);
    } finally {
      this.openFiles.delete(uri);
      this.diagnostics.clearDiagnostics(uri);
    }
  }

  async updateFile(uri: string, content: string): Promise<void> {
    const fileInfo = this.openFiles.get(uri);

    if (!fileInfo) {
      return;
    }

    try {
      const client = this.clients.get(fileInfo.languageId);

      if (!client) {
        throw new Error(`No LSP client for language: ${fileInfo.languageId}`);
      }

      fileInfo.version++;
      await client.changeFile(uri, content, fileInfo.version);
      fileInfo.content = content;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to update file ${uri}: ${message}`, { cause: err });
    }
  }

  async getDefinition(uri: string, position: Position): Promise<DefinitionResult> {
    const fileInfo = this.openFiles.get(uri);

    if (!fileInfo) {
      return null;
    }

    try {
      const client = this.clients.get(fileInfo.languageId);

      if (!client) {
        return null;
      }

      return await client.getDefinition(uri, position);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('ENOENT') || message.includes('spawn')) {
        console.error('LSP server not installed. Please install typescript-language-server: npm install -g typescript-language-server');
      } else {
        console.error(`Failed to get definition: ${message}`);
      }

      return null;
    }
  }

  async getReferences(uri: string, position: Position): Promise<ReferencesResult> {
    const fileInfo = this.openFiles.get(uri);

    if (!fileInfo) {
      return [];
    }

    try {
      const client = this.clients.get(fileInfo.languageId);

      if (!client) {
        return [];
      }

      return await client.getReferences(uri, position);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to get references: ${message}`);
      return [];
    }
  }

  async getHover(uri: string, position: Position): Promise<HoverResult> {
    const fileInfo = this.openFiles.get(uri);

    if (!fileInfo) {
      return { content: '' };
    }

    try {
      const client = this.clients.get(fileInfo.languageId);

      if (!client) {
        return { content: '' };
      }

      return await client.getHover(uri, position);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to get hover: ${message}`);
      return { content: '' };
    }
  }

  async getDocumentSymbols(uri: string): Promise<DocumentSymbolResult> {
    const fileInfo = this.openFiles.get(uri);

    if (!fileInfo) {
      return [];
    }

    try {
      const client = this.clients.get(fileInfo.languageId);

      if (!client) {
        return [];
      }

      return await client.getDocumentSymbols(uri);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to get document symbols: ${message}`);
      return [];
    }
  }

  getDiagnostics(uri: string): Diagnostic[] {
    return this.diagnostics.getDiagnostics(uri);
  }

  clearDiagnostics(uri: string): void {
    this.diagnostics.clearDiagnostics(uri);
  }

  getAllDiagnostics(): Map<string, Diagnostic[]> {
    return this.diagnostics.getAllDiagnostics();
  }

  private handleDiagnosticsFromClient(uri: string, incomingDiagnostics: Diagnostic[]): void {
    this.diagnostics.updateDiagnostics(uri, incomingDiagnostics);

    const pending = this.pendingDiagnostics.get(uri);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(incomingDiagnostics);
      this.pendingDiagnostics.delete(uri);
    }
  }

  async waitForFileDiagnostics(
    uri: string,
    timeoutMs?: number
  ): Promise<{ diagnostics: Diagnostic[]; timedOut: boolean }> {
    const effectiveTimeoutMs = timeoutMs ?? getDiagnosticsTimeoutMs();
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingDiagnostics.delete(uri);
        resolve({ diagnostics: [], timedOut: true });
      }, effectiveTimeoutMs);

      this.pendingDiagnostics.set(uri, {
        resolve: (diagnostics) => resolve({ diagnostics, timedOut: false }),
        timeout,
      });
    });
  }

  private getLanguageId(uri: string): string {
    let extension = '';

    if (uri.startsWith('file://') || uri.startsWith('file:')) {
      try {
        const url = uri.startsWith('file://') ? new URL(uri) : new URL(uri);
        extension = extname(fileURLToPath(url));
      } catch {
        extension = '';
      }
    } else {
      const lastDot = uri.lastIndexOf('.');
      if (lastDot !== -1) {
        extension = uri.slice(lastDot);
      }
    }

    const extensionMap = new Map<string, string>([
      ['.ts', 'typescript'],
      ['.tsx', 'typescript'],
      ['.js', 'typescript'],
      ['.jsx', 'typescript'],
      ['.mjs', 'typescript'],
      ['.cjs', 'typescript'],
      ['.mts', 'typescript'],
      ['.cts', 'typescript'],
      ['.php', 'php'],
      ['.phtml', 'php'],
    ]);

    const languageId = extensionMap.get(extension);
    if (languageId) {
      return languageId;
    }

    throw new Error(`Unsupported file extension: ${extension || '(none)'}`);
  }
}
