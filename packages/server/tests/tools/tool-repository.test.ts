import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  fetchRepository,
  fetchRepositoryWithVersions,
  getToolByName,
  collectEnvVars,
  type ToolRepository,
} from '@/tools/tool-repository';

function createValidRegistry(tempDir: string): ToolRepository {
  return {
    version: 3,
    format: 'source',
    registry: {
      baseUrl: 'https://example.com/releases/download',
      urlTemplate: '{baseUrl}/tool-{name}%2Fv{version}/{name}.tar.gz',
      versionUrlTemplate: `file://${tempDir}/{name}.VERSION`,
    },
    tools: [
      {
        name: 'test-tool',
        description: 'A test tool',
      },
      {
        name: 'tool-with-env',
        description: 'Tool with env vars',
        envVars: [
          { name: 'API_KEY', required: true, sensitive: true },
        ],
      },
    ],
  };
}

describe('tool-repository', () => {
  let tempDir: string;
  let originalRegistryUrl: string | undefined;

  beforeEach(() => {
    tempDir = join(tmpdir(), `jean2-test-repo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(tempDir, { recursive: true });
    originalRegistryUrl = process.env.JEAN2_TOOL_REGISTRY_URL;

    writeFileSync(join(tempDir, 'test-tool.VERSION'), '1.0.0\n');
    writeFileSync(join(tempDir, 'tool-with-env.VERSION'), '2.0.0\n');
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    if (originalRegistryUrl !== undefined) {
      process.env.JEAN2_TOOL_REGISTRY_URL = originalRegistryUrl;
    } else {
      delete process.env.JEAN2_TOOL_REGISTRY_URL;
    }
  });

  function setLocalRegistry(data: unknown): string {
    const registryPath = join(tempDir, 'repositoryv3.json');
    writeFileSync(registryPath, JSON.stringify(data, null, 2));
    process.env.JEAN2_TOOL_REGISTRY_URL = `file://${registryPath}`;
    return registryPath;
  }

  describe('fetchRepository', () => {
    test('parses a valid v3 internal source registry', async () => {
      const validRegistry = createValidRegistry(tempDir);
      setLocalRegistry(validRegistry);

      const repo = await fetchRepository();

      expect(repo.version).toBe(3);
      expect(repo.format).toBe('source');
      expect(repo.tools).toHaveLength(2);
      expect(repo.registry.baseUrl).toBe('https://example.com/releases/download');
      expect(repo.tools[0].name).toBe('test-tool');
      expect(repo.tools[1].name).toBe('tool-with-env');
    });

    test('rejects wrong version', async () => {
      setLocalRegistry({
        ...createValidRegistry(tempDir),
        version: 2,
      });

      await expect(fetchRepository()).rejects.toThrow('expected version 3');
    });

    test('rejects wrong format', async () => {
      setLocalRegistry({
        ...createValidRegistry(tempDir),
        format: 'bundled',
      });

      await expect(fetchRepository()).rejects.toThrow('expected format "source"');
    });

    test('rejects non-object input', async () => {
      setLocalRegistry('not an object');
      await expect(fetchRepository()).rejects.toThrow('expected a JSON object');
    });

    test('rejects null input', async () => {
      setLocalRegistry(null);
      await expect(fetchRepository()).rejects.toThrow('expected a JSON object');
    });

    test('rejects missing registry block', async () => {
      const bad = createValidRegistry(tempDir) as unknown as Record<string, unknown>;
      delete bad.registry;
      setLocalRegistry(bad);

      await expect(fetchRepository()).rejects.toThrow('registry is required');
    });

    test('rejects missing registry.baseUrl', async () => {
      const bad = createValidRegistry(tempDir);
      (bad.registry as unknown as Record<string, unknown>).baseUrl = '';
      setLocalRegistry(bad);

      await expect(fetchRepository()).rejects.toThrow('registry.baseUrl is required');
    });

    test('rejects missing registry.urlTemplate', async () => {
      const bad = createValidRegistry(tempDir);
      (bad.registry as unknown as Record<string, unknown>).urlTemplate = '';
      setLocalRegistry(bad);

      await expect(fetchRepository()).rejects.toThrow('registry.urlTemplate is required');
    });

    test('rejects missing registry.versionUrlTemplate', async () => {
      const bad = createValidRegistry(tempDir);
      (bad.registry as unknown as Record<string, unknown>).versionUrlTemplate = '';
      setLocalRegistry(bad);

      await expect(fetchRepository()).rejects.toThrow('registry.versionUrlTemplate is required');
    });

    test('rejects non-array tools', async () => {
      setLocalRegistry({
        ...createValidRegistry(tempDir),
        tools: 'not an array',
      });

      await expect(fetchRepository()).rejects.toThrow('tools must be an array');
    });

    test('rejects tool with missing name', async () => {
      setLocalRegistry({
        ...createValidRegistry(tempDir),
        tools: [{ description: 'desc' }],
      });

      await expect(fetchRepository()).rejects.toThrow('tools[0].name is required');
    });

    test('rejects tool with empty name', async () => {
      setLocalRegistry({
        ...createValidRegistry(tempDir),
        tools: [{ name: '', description: 'desc' }],
      });

      await expect(fetchRepository()).rejects.toThrow('tools[0].name is required');
    });

    test('rejects tool with missing description', async () => {
      setLocalRegistry({
        ...createValidRegistry(tempDir),
        tools: [{ name: 'tool' }],
      });

      await expect(fetchRepository()).rejects.toThrow('tools[0].description is required');
    });

    test('rejects malformed envVars', async () => {
      setLocalRegistry({
        ...createValidRegistry(tempDir),
        tools: [
          {
            name: 'tool',
            description: 'desc',
            envVars: 'bad',
          },
        ],
      });

      await expect(fetchRepository()).rejects.toThrow('tools[0].envVars must be an array');
    });
  });

  describe('fetchRepositoryWithVersions', () => {
    test('returns tools with dynamically resolved versions and artifact urls', async () => {
      setLocalRegistry(createValidRegistry(tempDir));

      const tools = await fetchRepositoryWithVersions();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('test-tool');
      expect(tools[0].version).toBe('1.0.0');
      expect(tools[0].artifactUrl).toBe(
        'https://example.com/releases/download/tool-test-tool%2Fv1.0.0/test-tool.tar.gz',
      );




      expect(tools[1].name).toBe('tool-with-env');
      expect(tools[1].version).toBe('2.0.0');
    });
  });

  describe('getToolByName', () => {
    test('returns the matching resolved tool', async () => {
      setLocalRegistry(createValidRegistry(tempDir));

      const tool = await getToolByName('test-tool');
      expect(tool).not.toBeNull();
      expect(tool!.name).toBe('test-tool');
      expect(tool!.version).toBe('1.0.0');
      expect(tool!.artifactUrl).toContain('/tool-test-tool%2Fv1.0.0/test-tool.tar.gz');
    });

    test('returns null for unknown tool', async () => {
      setLocalRegistry(createValidRegistry(tempDir));

      const tool = await getToolByName('nonexistent');
      expect(tool).toBeNull();
    });
  });

  describe('collectEnvVars', () => {
    test('returns env vars for tool with envVars', async () => {
      setLocalRegistry(createValidRegistry(tempDir));

      const envVars = await collectEnvVars('tool-with-env');
      expect(envVars).toHaveLength(1);
      expect(envVars[0].key).toBe('API_KEY');
      expect(envVars[0].sensitive).toBe(true);
      expect(envVars[0].configured).toBe(false);
    });

    test('returns empty array for tool without envVars', async () => {
      setLocalRegistry(createValidRegistry(tempDir));

      const envVars = await collectEnvVars('test-tool');
      expect(envVars).toHaveLength(0);
    });

    test('returns empty array for unknown tool', async () => {
      setLocalRegistry(createValidRegistry(tempDir));

      const envVars = await collectEnvVars('nonexistent');
      expect(envVars).toHaveLength(0);
    });
  });

  describe('repository with envConfig', () => {
    test('parses envConfig section', async () => {
      const withConfig: ToolRepository = {
        ...createValidRegistry(tempDir),
        envConfig: {
          API_KEY: {
            description: 'An API key',
            sensitive: true,
            required: true,
            usedBy: ['test-tool'],
          },
        },
      };
      setLocalRegistry(withConfig);

      const repo = await fetchRepository();
      expect(repo.envConfig).toBeDefined();
      expect((repo.envConfig as Record<string, unknown>).API_KEY).toBeDefined();
    });
  });
});
