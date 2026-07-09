import type { Hono } from 'hono';
import * as providerCredentials from '@/configuration/provider-credentials';
import * as modelsConfig from '@/configuration/models';
import * as modelsSync from '@/configuration/models-sync';
import * as promptsConfig from '@/configuration/prompts';
import * as preconfigsConfig from '@/configuration/preconfigs';
import * as providers from '@/providers';
import { listPrompts } from '@/prompts/registry';

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
  });

  app.get('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    const preconfig = await preconfigsConfig.listValidatedPreconfigs()
      .then(ps => ps.find(p => p.id === id));
    if (!preconfig) {
      return c.json({ error: 'not_found', message: 'Preconfig not found' }, 404);
    }
    return c.json({ preconfig });
  });

  app.put('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
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
  });

  app.delete('/api/preconfigs/:id', async (c) => {
    const id = c.req.param('id');
    await preconfigsConfig.deleteValidatedPreconfig(id);
    return c.json({ success: true });
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

  app.get('/api/providers', async (c) => {
    const allProviders = providers.getConnectableProviders();
    const providerStatuses = allProviders.map(p => ({
      ...p.descriptor,
      ...p.getStatus(),
    }));
    return c.json({ providers: providerStatuses });
  });

  app.post('/api/providers/:providerId/connect', async (c) => {
    const providerId = c.req.param('providerId');
    const body = await c.req.json().catch(() => ({}));
    const result = await providers.connectProvider(providerId, {
      redirectStrategy: body.redirectStrategy,
    });
    const status = await providers.getProviderStatus(providerId);
    return c.json({
      authorizationUrl: result.authorizationUrl,
      flowId: result.flowId,
      redirectStrategy: result.redirectStrategy,
      redirectUri: result.redirectUri,
      status,
    });
  });

  app.get('/api/providers/:providerId/status', async (c) => {
    const providerId = c.req.param('providerId');
    const status = await providers.getProviderStatus(providerId);
    return c.json({ status });
  });

  app.delete('/api/providers/:providerId', async (c) => {
    const providerId = c.req.param('providerId');
    await providers.disconnectProvider(providerId);
    return c.json({ success: true });
  });

  app.post('/api/oauth/callback', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await providers.completeOAuthFlow(
      body.flowId,
      body.code,
      body.state,
      body.redirectUri,
    );
    return c.json({ success: true, provider: result.providerId });
  });

  app.get('/api/providers/:providerId/oauth/callback', async (c) => {
    const providerId = c.req.param('providerId');
    const url = new URL(c.req.url);
    return await providers.handleServerCallback(providerId, url);
  });

  // ============================================================================
  // Configuration: Provider Credentials
  // ============================================================================

  app.get('/api/config/providers', (c) => {
    const result = providerCredentials.listProviderCredentials();
    return c.json(result);
  });

  app.put('/api/config/providers/:provider', async (c) => {
    const provider = c.req.param('provider');
    const body = await c.req.json().catch(() => ({}));
    const result = await providerCredentials.setProviderCredential(provider, body.apiKey);
    return c.json(result);
  });

  app.delete('/api/config/providers/:provider', (c) => {
    const provider = c.req.param('provider');
    const result = providerCredentials.clearProviderCredential(provider);
    return c.json(result);
  });

  // ============================================================================
  // Configuration: Models
  // ============================================================================

  app.get('/api/config/models', (c) => {
    const result = modelsConfig.getModelsConfigWithStatus();
    return c.json(result);
  });

  app.post('/api/config/models/providers', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await modelsConfig.createProvider(body);
    return c.json(result, 201);
  });

  app.put('/api/config/models/providers/:providerId', async (c) => {
    const providerId = c.req.param('providerId');
    const body = await c.req.json().catch(() => ({}));
    const result = await modelsConfig.updateProvider(providerId, body);
    return c.json(result);
  });

  app.delete('/api/config/models/providers/:providerId', async (c) => {
    const providerId = c.req.param('providerId');
    const result = await modelsConfig.deleteProvider(providerId);
    return c.json(result);
  });

  app.post('/api/config/models/providers/:providerId/models', async (c) => {
    const providerId = c.req.param('providerId');
    const body = await c.req.json().catch(() => ({}));
    const result = await modelsConfig.createModel(providerId, body);
    return c.json(result, 201);
  });

  app.put('/api/config/models/providers/:providerId/models/:modelId', async (c) => {
    const providerId = c.req.param('providerId');
    const modelId = c.req.param('modelId');
    const body = await c.req.json().catch(() => ({}));
    const result = await modelsConfig.updateModel(providerId, modelId, body);
    return c.json(result);
  });

  app.delete('/api/config/models/providers/:providerId/models/:modelId', async (c) => {
    const providerId = c.req.param('providerId');
    const modelId = c.req.param('modelId');
    const result = await modelsConfig.deleteModel(providerId, modelId);
    return c.json(result);
  });

  app.post('/api/config/models/sync', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const mode = body.mode === 'override' ? 'override' as const : 'merge' as const;
    const result = await modelsSync.syncModels(mode);
    return c.json(result);
  });

  app.put('/api/config/models/defaults', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await modelsConfig.setDefaults(body);
    return c.json(result);
  });

  // ============================================================================
  // Configuration: Prompts
  // ============================================================================

  app.get('/api/config/prompts', async (c) => {
    const prompts = await promptsConfig.listPromptConfigs();
    return c.json({ prompts });
  });

  app.get('/api/config/prompts/:name', async (c) => {
    const name = c.req.param('name');
    const prompt = await promptsConfig.getPromptConfig(name);
    return c.json(prompt);
  });

  app.post('/api/config/prompts', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = await promptsConfig.createPromptConfig(body);
    return c.json(prompt, 201);
  });

  app.put('/api/config/prompts/:name', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json().catch(() => ({}));
    const prompt = await promptsConfig.updatePromptConfig(name, body);
    return c.json(prompt);
  });

  app.delete('/api/config/prompts/:name', async (c) => {
    const name = c.req.param('name');
    await promptsConfig.deletePromptConfig(name);
    return c.json({ success: true });
  });
}
