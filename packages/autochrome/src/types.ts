// =============================================================================
// Autochrome Types
// =============================================================================

export interface ActiveTabData {
  title: string;
  url: string;
  text: string;
}

export interface ExtensionConfig {
  serverUrl: string;
  token?: string;
}

export const STORAGE_KEYS = {
  CLIENT_ID: 'autochrome_client_id',
  CONFIG: 'autochrome_config',
} as const;

export const DEFAULT_CONFIG: ExtensionConfig = {
  serverUrl: 'http://localhost:3000',
};
