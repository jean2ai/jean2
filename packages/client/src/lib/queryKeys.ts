export const queryKeys = {
  sessions: {
    all: ['sessions'] as const,
    byWorkspace: (workspaceId: string) => ['sessions', 'workspace', workspaceId] as const,
    grouped: (workspaceIds: string[], status?: string) =>
      ['sessions', 'grouped', { workspaceIds: [...workspaceIds].sort(), status }] as const,
  },
  tools: {
    all: ['tools'] as const,
    envVars: ['tools', 'envVars'] as const,
  },
  config: {
    models: ['config', 'models'] as const,
    preconfigs: ['config', 'preconfigs'] as const,
    prompts: ['config', 'prompts'] as const,
    providers: {
      all: ['providers'] as const,
      credentials: ['providers', 'credentials'] as const,
    },
  },
  mcp: {
    status: (workspaceId: string) => ['mcp', 'status', workspaceId] as const,
  },
  files: {
    browse: (workspaceId: string, path?: string, opts?: { showHidden?: boolean }) =>
      ['files', 'browse', workspaceId, path ?? '.', opts] as const,
    browseFs: (path: string) => ['files', 'browseFs', path] as const,
    drives: ['files', 'drives'] as const,
    parent: (path: string) => ['files', 'parent', path] as const,
    preview: (workspaceId: string, path: string) =>
      ['files', 'preview', workspaceId, path] as const,
  },
  serverInfo: ['serverInfo'] as const,
} as const;
