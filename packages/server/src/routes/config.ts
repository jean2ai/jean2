import type { Hono } from 'hono';
import * as providerCredentials from '@/configuration/provider-credentials';
import * as modelsConfig from '@/configuration/models';
import * as promptsConfig from '@/configuration/prompts';
import * as preconfigsConfig from '@/configuration/preconfigs';
import * as providers from '@/providers';
import { listPrompts } from '@/prompts/registry';
import {
  ConfigurationNotFoundError,
  ConfigurationValidationError,
  ConfigurationConflictError,
  ConfigurationPersistenceError,
  ForbiddenDeleteError,
} from '@/configuration/errors';

export function registerConfigRoutes(app: Hono): void {
  // ============================================================================
  // Preconfigs API (validated)
  // ============================================================================

  app.get('/api/preconfigs', async (c) => {
    const preconfigs = await preconfigsConfig.listValidatedPreconfigs();
    return c.json({ preconfigs });
  });

  app.post('/api/preconfigs', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const format = body.format === 'md' ? 'md' : undefined;
      const preconfig = await preconfigsConfig.createValidatedPreconfig({
        id: body.id,
        name: body.name || 'Custom Preconfig',
        description: body.description || '',
        systemPrompt: body.systemPrompt || '',
        tools: body.tools ?? null,
        model: body.model ?? null,
        provider: body.provider ?? null,
        variant: body.variant ?? null,
        settings: body.settings ?? null,
        isDefault: false,
        mode: body.mode,
        canSpawnSubagents: body.canSpawnSubagents,
        skills: body.skills ?? null,
      }, format);
      return c.json({ preconfig }, 201);
    } catch (err: unknown) {
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message, details: err.details }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to create preconfig', message }, 500);
    }
  });

  app.get('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    const preconfig = await preconfigsConfig.listValidatedPreconfigs()
      .then(ps => ps.find(p => p.id === id));
    if (!preconfig) {
      return c.json({ error: 'Not Found', message: 'Preconfig not found' }, 404);
    }
    return c.json({ preconfig });
  });

  app.put('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    try {
      const preconfig = await preconfigsConfig.updateValidatedPreconfig(id, {
        name: body.name,
        description: body.description,
        systemPrompt: body.systemPrompt,
        tools: body.tools,
        model: body.model,
        provider: body.provider,
        variant: body.variant,
        settings: body.settings,
        isDefault: body.isDefault,
        mode: body.mode,
        canSpawnSubagents: body.canSpawnSubagents,
        skills: body.skills,
      });
      return c.json({ preconfig });
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message, details: err.details }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to update preconfig', message }, 500);
    }
  });

  app.delete('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    try {
      await preconfigsConfig.deleteValidatedPreconfig(id);
      return c.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ForbiddenDeleteError) {
        return c.json({ error: 'Forbidden', message: err.message }, 403);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to delete preconfig', message }, 500);
    }
  });

  // ============================================================================
  // Prompts API
  // ============================================================================

  app.get('/api/prompts', async (c) => {
    try {
      const prompts = await listPrompts();
      return c.json({ prompts });
    } catch (_error) {
      return c.json({ prompts: [] });
    }
  });

  // ============================================================================
  // Models API
  // ============================================================================

  // GET /api/models - List all available models
  app.get('/api/models', async (c) => {
    try {
      const configResponse = modelsConfig.getModelsConfigWithStatus();
      const models = configResponse.providers.flatMap((provider) => provider.models);
      return c.json({
        models,
        defaultModel: configResponse.defaultModel,
        defaultProvider: configResponse.defaultProvider,
      });
    } catch (_error) {
      return c.json({ models: [], error: 'Failed to load models' });
    }
  });

  // ============================================================================
  // Providers API
  // ============================================================================

  // GET /api/providers - List all connectable providers with status and metadata
  app.get('/api/providers', async (c) => {
    try {
      const allProviders = providers.getConnectableProviders();
      const providerStatuses = allProviders.map(p => ({
        ...p.descriptor,
        ...p.getStatus(),
      }));
      return c.json({ providers: providerStatuses });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to get providers', message }, 500);
    }
  });

  // POST /api/providers/:providerId/connect - Start connection flow
  app.post('/api/providers/:providerId/connect', async (c) => {
    const providerId = c.req.param('providerId');
    try {
      const result = await providers.connectProvider(providerId);
      const status = await providers.getProviderStatus(providerId);
      return c.json({ authorizationUrl: result.authorizationUrl, status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to start connection', message }, 500);
    }
  });

  // GET /api/providers/:providerId/status - Get provider connection status
  app.get('/api/providers/:providerId/status', async (c) => {
    const providerId = c.req.param('providerId');
    try {
      const status = await providers.getProviderStatus(providerId);
      return c.json({ status });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to get status', message }, 500);
    }
  });

  // DELETE /api/providers/:providerId - Disconnect provider
  app.delete('/api/providers/:providerId', async (c) => {
    const providerId = c.req.param('providerId');
    try {
      await providers.disconnectProvider(providerId);
      return c.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to disconnect', message }, 500);
    }
  });

  // ============================================================================
  // Configuration: Provider Credentials
  // ============================================================================

  app.get('/api/config/providers', (c) => {
    try {
      const result = providerCredentials.listProviderCredentials();
      return c.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to list provider credentials', message }, 500);
    }
  });

  app.put('/api/config/providers/:provider', async (c) => {
    const provider = c.req.param('provider');
    const body = await c.req.json().catch(() => ({}));
    const { apiKey } = body;
    try {
      const result = await providerCredentials.setProviderCredential(provider, apiKey);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      if (err instanceof ConfigurationPersistenceError) {
        return c.json({ error: 'Internal Server Error', message: err.message }, 500);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to set provider credential', message }, 500);
    }
  });

  app.delete('/api/config/providers/:provider', async (c) => {
    const provider = c.req.param('provider');
    try {
      const result = await providerCredentials.clearProviderCredential(provider);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationPersistenceError) {
        return c.json({ error: 'Internal Server Error', message: err.message }, 500);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to clear provider credential', message }, 500);
    }
  });

  // ============================================================================
  // Configuration: Models
  // ============================================================================

  app.get('/api/config/models', (c) => {
    try {
      const result = modelsConfig.getModelsConfigWithStatus();
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message, details: err.details }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to load models configuration', message }, 500);
    }
  });

  app.post('/api/config/models/providers', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await modelsConfig.createProvider(body);
      return c.json(result, 201);
    } catch (err: unknown) {
      if (err instanceof ConfigurationConflictError) {
        return c.json({ error: 'Conflict', message: err.message }, 409);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to create provider', message }, 500);
    }
  });

  app.put('/api/config/models/providers/:providerId', async (c) => {
    const providerId = c.req.param('providerId');
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await modelsConfig.updateProvider(providerId, body);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to update provider', message }, 500);
    }
  });

  app.delete('/api/config/models/providers/:providerId', async (c) => {
    const providerId = c.req.param('providerId');
    try {
      const result = await modelsConfig.deleteProvider(providerId);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to delete provider', message }, 500);
    }
  });

  app.post('/api/config/models/providers/:providerId/models', async (c) => {
    const providerId = c.req.param('providerId');
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await modelsConfig.createModel(providerId, body);
      return c.json(result, 201);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationConflictError) {
        return c.json({ error: 'Conflict', message: err.message }, 409);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to create model', message }, 500);
    }
  });

  app.put('/api/config/models/providers/:providerId/models/:modelId', async (c) => {
    const providerId = c.req.param('providerId');
    const modelId = c.req.param('modelId');
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await modelsConfig.updateModel(providerId, modelId, body);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to update model', message }, 500);
    }
  });

  app.delete('/api/config/models/providers/:providerId/models/:modelId', async (c) => {
    const providerId = c.req.param('providerId');
    const modelId = c.req.param('modelId');
    try {
      const result = await modelsConfig.deleteModel(providerId, modelId);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to delete model', message }, 500);
    }
  });

  app.put('/api/config/models/defaults', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await modelsConfig.setDefaults(body);
      return c.json(result);
    } catch (err: unknown) {
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to set defaults', message }, 500);
    }
  });

  // ============================================================================
  // Configuration: Prompts
  // ============================================================================

  app.get('/api/config/prompts', async (c) => {
    try {
      const prompts = await promptsConfig.listPromptConfigs();
      return c.json({ prompts });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to list prompts', message }, 500);
    }
  });

  app.get('/api/config/prompts/:name', async (c) => {
    const name = c.req.param('name');
    try {
      const prompt = await promptsConfig.getPromptConfig(name);
      return c.json(prompt);
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to get prompt', message }, 500);
    }
  });

  app.post('/api/config/prompts', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const prompt = await promptsConfig.createPromptConfig(body);
      return c.json(prompt, 201);
    } catch (err: unknown) {
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      if (err instanceof ConfigurationConflictError) {
        return c.json({ error: 'Conflict', message: err.message }, 409);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to create prompt', message }, 500);
    }
  });

  app.put('/api/config/prompts/:name', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json().catch(() => ({}));
    try {
      const prompt = await promptsConfig.updatePromptConfig(name, body);
      return c.json(prompt);
    } catch (err: unknown) {
      if (err instanceof ConfigurationValidationError) {
        return c.json({ error: 'Bad Request', message: err.message }, 400);
      }
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to update prompt', message }, 500);
    }
  });

  app.delete('/api/config/prompts/:name', async (c) => {
    const name = c.req.param('name');
    try {
      await promptsConfig.deletePromptConfig(name);
      return c.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof ConfigurationNotFoundError) {
        return c.json({ error: 'Not Found', message: err.message }, 404);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'Failed to delete prompt', message }, 500);
    }
  });
}
