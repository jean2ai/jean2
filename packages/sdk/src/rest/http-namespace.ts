import type { Session, Workspace, Preconfig, PromptInfo, ModelWithStatus, ProviderStatus } from '../types';
import type { HttpClient } from '../transport/http';
import { SessionsRestNamespace } from './sessions';
import { WorkspacesRestNamespace } from './workspaces';
import { ModelsRestNamespace } from './models';
import { ToolsRestNamespace } from './tools';
import { ProvidersRestNamespace } from './providers';
import { PreconfigsRestNamespace } from './preconfigs';
import { PromptsRestNamespace } from './prompts';
import { FilesRestNamespace } from './files';
import { AttachmentsRestNamespace } from './attachments';
import { TerminalsRestNamespace } from './terminals';
import { McpRestNamespace } from './mcp';
import { ConfigRestNamespace } from './config';

/**
 * Result of loading all initial server data.
 * Matches the pattern used by the React client's useServerDataLoader.
 */
export interface LoadAllResult {
  sessions: Session[];
  workspaces: Workspace[];
  preconfigs: Preconfig[];
  prompts: PromptInfo[];
  models: ModelWithStatus[];
  defaultModel: string;
  defaultProvider: string;
  providers: ProviderStatus[];
}

/**
 * Aggregates all REST namespaces under a single `client.http.*` surface.
 * This is the primary HTTP API for the SDK.
 */
export class HttpNamespace {
  readonly sessions: SessionsRestNamespace;
  readonly workspaces: WorkspacesRestNamespace;
  readonly models: ModelsRestNamespace;
  readonly tools: ToolsRestNamespace;
  readonly providers: ProvidersRestNamespace;
  readonly preconfigs: PreconfigsRestNamespace;
  readonly prompts: PromptsRestNamespace;
  readonly files: FilesRestNamespace;
  readonly attachments: AttachmentsRestNamespace;
  readonly terminals: TerminalsRestNamespace;
  readonly mcp: McpRestNamespace;
  readonly config: ConfigRestNamespace;

  constructor(http: HttpClient) {
    this.sessions = new SessionsRestNamespace(http);
    this.workspaces = new WorkspacesRestNamespace(http);
    this.models = new ModelsRestNamespace(http);
    this.tools = new ToolsRestNamespace(http);
    this.providers = new ProvidersRestNamespace(http);
    this.preconfigs = new PreconfigsRestNamespace(http);
    this.prompts = new PromptsRestNamespace(http);
    this.files = new FilesRestNamespace(http);
    this.attachments = new AttachmentsRestNamespace(http);
    this.terminals = new TerminalsRestNamespace(http);
    this.mcp = new McpRestNamespace(http);
    this.config = new ConfigRestNamespace(http);
  }

  /**
   * Load all initial server data in parallel.
   * Useful for client initialization — replaces manual Promise.all() composition.
   */
  async loadAll(options?: { signal?: AbortSignal }): Promise<LoadAllResult> {
    const [sessionsData, workspacesData, preconfigsData, promptsData, modelsData, providersData] = await Promise.all([
      this.sessions.list(options),
      this.workspaces.list(options),
      this.preconfigs.list(options),
      this.prompts.list(options),
      this.models.list(options),
      this.providers.list(options),
    ]);

    return {
      sessions: sessionsData.sessions,
      workspaces: workspacesData.workspaces,
      preconfigs: preconfigsData.preconfigs,
      prompts: promptsData.prompts,
      models: modelsData.models,
      defaultModel: modelsData.defaultModel,
      defaultProvider: modelsData.defaultProvider,
      providers: providersData.providers,
    };
  }
}