import type { HttpClient } from '../transport/http';
import type {
  GetModelsConfigResponse,
  CreateProviderResponse,
  UpdateProviderResponse,
  DeleteProviderResponse,
  CreateModelResponse,
  UpdateModelResponse,
  DeleteModelResponse,
  SetDefaultsResponse,
  ListPromptConfigsResponse,
  GetPromptConfigResponse,
  CreatePromptConfigResponse,
  UpdatePromptConfigResponse,
  DeletePromptConfigResponse,
} from '../types/rest-responses';
import type {
  CreateProviderRequest,
  UpdateProviderRequest,
  CreateModelRequest,
  UpdateModelRequest,
  SetDefaultsRequest,
  CreatePromptRequest,
  UpdatePromptRequest,
} from '@jean2/shared';

// =============================================================================
// Config Models Namespace
// =============================================================================

interface GetModelsOptions {
  signal?: AbortSignal;
}

interface CreateProviderOptions {
  signal?: AbortSignal;
}

interface UpdateProviderOptions {
  signal?: AbortSignal;
}

interface DeleteProviderOptions {
  signal?: AbortSignal;
}

interface CreateModelOptions {
  signal?: AbortSignal;
}

interface UpdateModelOptions {
  signal?: AbortSignal;
}

interface DeleteModelOptions {
  signal?: AbortSignal;
}

interface SetDefaultsOptions {
  signal?: AbortSignal;
}

export class ConfigModelsNamespace {
  constructor(private http: HttpClient) {}

  /**
   * GET /api/config/models - Get full models configuration with runtime status
   */
  async get(options?: GetModelsOptions): Promise<GetModelsConfigResponse> {
    return this.http.get('/config/models', { signal: options?.signal });
  }

  async createProvider(
    data: CreateProviderRequest,
    options?: CreateProviderOptions,
  ): Promise<CreateProviderResponse> {
    return this.http.post('/config/models/providers', data, { signal: options?.signal });
  }

  async updateProvider(
    id: string,
    data: UpdateProviderRequest,
    options?: UpdateProviderOptions,
  ): Promise<UpdateProviderResponse> {
    return this.http.put(`/config/models/providers/${encodeURIComponent(id)}`, data, { signal: options?.signal });
  }

  /**
   * DELETE /api/config/models/providers/:id - Delete a provider
   */
  async deleteProvider(id: string, options?: DeleteProviderOptions): Promise<DeleteProviderResponse> {
    return this.http.delete(`/config/models/providers/${encodeURIComponent(id)}`, {
      signal: options?.signal,
    });
  }

  async createModel(
    providerId: string,
    data: CreateModelRequest,
    options?: CreateModelOptions,
  ): Promise<CreateModelResponse> {
    return this.http.post(`/config/models/providers/${encodeURIComponent(providerId)}/models`, data, { signal: options?.signal });
  }

  async updateModel(
    providerId: string,
    modelId: string,
    data: UpdateModelRequest,
    options?: UpdateModelOptions,
  ): Promise<UpdateModelResponse> {
    return this.http.put(
      `/config/models/providers/${encodeURIComponent(providerId)}/models/${encodeURIComponent(modelId)}`,
      data,
      { signal: options?.signal },
    );
  }

  /**
   * DELETE /api/config/models/providers/:providerId/models/:modelId - Delete a model
   */
  async deleteModel(
    providerId: string,
    modelId: string,
    options?: DeleteModelOptions,
  ): Promise<DeleteModelResponse> {
    return this.http.delete(
      `/config/models/providers/${encodeURIComponent(providerId)}/models/${encodeURIComponent(modelId)}`,
      { signal: options?.signal },
    );
  }

  async setDefaults(data: SetDefaultsRequest, options?: SetDefaultsOptions): Promise<SetDefaultsResponse> {
    return this.http.put('/config/models/defaults', data, { signal: options?.signal });
  }
}

// =============================================================================
// Config Prompts Namespace
// =============================================================================

interface ListPromptsOptions {
  signal?: AbortSignal;
}

interface GetPromptOptions {
  signal?: AbortSignal;
}

interface CreatePromptOptions {
  signal?: AbortSignal;
}

interface UpdatePromptOptions {
  signal?: AbortSignal;
}

interface DeletePromptOptions {
  signal?: AbortSignal;
}

export class ConfigPromptsNamespace {
  constructor(private http: HttpClient) {}

  /**
   * GET /api/config/prompts - List all prompt configurations
   */
  async list(options?: ListPromptsOptions): Promise<ListPromptConfigsResponse> {
    return this.http.get('/config/prompts', { signal: options?.signal });
  }

  /**
   * GET /api/config/prompts/:name - Get a specific prompt configuration
   */
  async get(name: string, options?: GetPromptOptions): Promise<GetPromptConfigResponse> {
    return this.http.get(`/config/prompts/${encodeURIComponent(name)}`, { signal: options?.signal });
  }

  async create(data: CreatePromptRequest, options?: CreatePromptOptions): Promise<CreatePromptConfigResponse> {
    return this.http.post('/config/prompts', data, { signal: options?.signal });
  }

  async update(
    name: string,
    data: UpdatePromptRequest,
    options?: UpdatePromptOptions,
  ): Promise<UpdatePromptConfigResponse> {
    return this.http.put(`/config/prompts/${encodeURIComponent(name)}`, data, { signal: options?.signal });
  }

  /**
   * DELETE /api/config/prompts/:name - Delete a prompt configuration
   */
  async delete(name: string, options?: DeletePromptOptions): Promise<DeletePromptConfigResponse> {
    return this.http.delete(`/config/prompts/${encodeURIComponent(name)}`, { signal: options?.signal });
  }
}

// =============================================================================
// Config Namespace (composes models + prompts)
// =============================================================================

export class ConfigRestNamespace {
  readonly models: ConfigModelsNamespace;
  readonly prompts: ConfigPromptsNamespace;

  constructor(http: HttpClient) {
    this.models = new ConfigModelsNamespace(http);
    this.prompts = new ConfigPromptsNamespace(http);
  }
}
