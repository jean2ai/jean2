export interface ProviderCredentialStatus {
  provider: string;
  configured: boolean;
}

export interface ProviderCredentialsResponse {
  providers: ProviderCredentialStatus[];
}

export interface SetProviderCredentialRequest {
  apiKey: string;
}

export interface ModelRuntimeStatus {
  providerSupported: boolean;
  providerConfigured: boolean;
  usable: boolean;
}

export interface ModelWithStatus {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  tier: 'budget' | 'standard' | 'premium';
  variants?: Record<string, { providerOptions: Record<string, unknown> }>;
  capabilities?: {
    input?: {
      text?: boolean;
      image?: boolean;
      video?: boolean;
      file?: string[];
    };
  };
  providerId: string;
  providerName: string;
  runtimeStatus: ModelRuntimeStatus;
}

export interface ProviderWithStatus {
  id: string;
  name: string;
  models: ModelWithStatus[];
}

export interface ModelsConfigResponse {
  providers: ProviderWithStatus[];
  defaultModel: string;
  defaultProvider: string;
}

export interface CreateProviderRequest {
  id: string;
  name: string;
}

export interface UpdateProviderRequest {
  name?: string;
}

export interface CreateModelRequest {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  tier: 'budget' | 'standard' | 'premium';
  variants?: Record<string, { providerOptions: Record<string, unknown> }>;
  capabilities?: {
    input?: {
      text?: boolean;
      image?: boolean;
      video?: boolean;
      file?: string[];
    };
  };
}

export interface UpdateModelRequest {
  name?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  tier?: 'budget' | 'standard' | 'premium';
  variants?: Record<string, { providerOptions: Record<string, unknown> }>;
  capabilities?: {
    input?: {
      text?: boolean;
      image?: boolean;
      video?: boolean;
      file?: string[];
    };
  };
}

export interface SetDefaultsRequest {
  defaultModel: string;
  defaultProvider: string;
}

export interface CreatePromptRequest {
  name: string;
  content: string;
}

export interface UpdatePromptRequest {
  content: string;
}