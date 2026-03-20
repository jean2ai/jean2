import type {
  DefinitionResult,
  Diagnostic,
  DocumentSymbolResult,
  HoverResult,
  Position,
  ReferencesResult,
  WorkspaceId,
  WorkspaceSessionInfo,
} from '@/types';
import { WorkspaceSession } from '@/workspace-session';
import { getIdleTimeoutMs } from './env';

const DEFAULT_IDLE_TIMEOUT_MS = 60 * 1000;

export class LSPManager {
  private workspaces: Map<WorkspaceId, WorkspaceSession> = new Map();
  private idleTimeoutMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.startCleanupTimer();
  }

  async initialize(workspaceId: WorkspaceId, workspaceRoot: string): Promise<boolean> {
    const existingSession = this.workspaces.get(workspaceId);

    if (existingSession) {
      if (existingSession.workspaceRoot === workspaceRoot) {
        existingSession.updateAccess();
        return false;
      }

      await existingSession.shutdown();
    }

    const session = new WorkspaceSession(workspaceId, workspaceRoot);
    this.workspaces.set(workspaceId, session);
    return true;
  }

  async shutdownWorkspace(workspaceId: WorkspaceId): Promise<void> {
    const session = this.workspaces.get(workspaceId);

    if (!session) {
      return;
    }

    try {
      await session.shutdown();
    } catch (err) {
      console.error(`Error shutting down workspace ${workspaceId}:`, err);
    }

    this.workspaces.delete(workspaceId);
  }

  private getSession(workspaceId: WorkspaceId): WorkspaceSession | undefined {
    const session = this.workspaces.get(workspaceId);

    if (session) {
      session.updateAccess();
    }

    return session;
  }

  private getWorkspace(workspaceId: WorkspaceId): WorkspaceSession {
    const session = this.getSession(workspaceId);

    if (!session) {
      throw new Error(`Workspace not initialized: ${workspaceId}`);
    }

    return session;
  }

  getActiveWorkspaces(): WorkspaceSessionInfo[] {
    return Array.from(this.workspaces.values()).map(session => ({
      workspaceId: session.workspaceId,
      workspaceRoot: session.workspaceRoot,
      lastAccessedAt: session.lastAccessedAt,
      createdAt: session.createdAt,
    }));
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleWorkspaces();
    }, 30 * 1000);
  }

  private stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private async cleanupIdleWorkspaces(): Promise<void> {
    const now = Date.now();
    const toCleanup: WorkspaceId[] = [];

    for (const [workspaceId, session] of this.workspaces) {
      if (now - session.lastAccessedAt > this.idleTimeoutMs) {
        toCleanup.push(workspaceId);
      }
    }

    for (const workspaceId of toCleanup) {
      console.log(`Cleaning up idle workspace: ${workspaceId}`);
      await this.shutdownWorkspace(workspaceId);
    }
  }

  async openFile(workspaceId: WorkspaceId, uri: string, content: string): Promise<void> {
    const session = this.getWorkspace(workspaceId);
    return session.openFile(uri, content);
  }

  async closeFile(workspaceId: WorkspaceId, uri: string): Promise<void> {
    const session = this.getWorkspace(workspaceId);
    return session.closeFile(uri);
  }

  async updateFile(workspaceId: WorkspaceId, uri: string, content: string): Promise<void> {
    const session = this.getWorkspace(workspaceId);
    return session.updateFile(uri, content);
  }

  async getDefinition(workspaceId: WorkspaceId, uri: string, position: Position): Promise<DefinitionResult> {
    const session = this.getWorkspace(workspaceId);
    return session.getDefinition(uri, position);
  }

  async getReferences(workspaceId: WorkspaceId, uri: string, position: Position): Promise<ReferencesResult> {
    const session = this.getWorkspace(workspaceId);
    return session.getReferences(uri, position);
  }

  async getHover(workspaceId: WorkspaceId, uri: string, position: Position): Promise<HoverResult> {
    const session = this.getWorkspace(workspaceId);
    return session.getHover(uri, position);
  }

  async getDocumentSymbols(workspaceId: WorkspaceId, uri: string): Promise<DocumentSymbolResult> {
    const session = this.getWorkspace(workspaceId);
    return session.getDocumentSymbols(uri);
  }

  getDiagnostics(workspaceId: WorkspaceId, uri: string): Diagnostic[] {
    const session = this.getWorkspace(workspaceId);
    return session.getDiagnostics(uri);
  }

  getAllDiagnostics(workspaceId: WorkspaceId): Map<string, Diagnostic[]> {
    const session = this.getWorkspace(workspaceId);
    return session.getAllDiagnostics();
  }

  onDiagnostics(workspaceId: WorkspaceId, callback: (uri: string, diagnostics: Diagnostic[]) => void): void {
    const session = this.getWorkspace(workspaceId);
    session.onDiagnostics(callback);
  }
}

let _lspManager: LSPManager | null = null;

export function getLspManager(): LSPManager {
  if (!_lspManager) {
    _lspManager = new LSPManager(getIdleTimeoutMs());
  }
  return _lspManager;
}
