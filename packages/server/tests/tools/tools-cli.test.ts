import { describe, expect, test } from 'bun:test';

import { excludeInstalledTools } from '@/tools/tools-cli';
import type { RepositoryTool } from '@/tools/tool-repository';

const tools: RepositoryTool[] = [
  {
    name: 'read-file',
    description: 'Read files',
    version: '1.0.0',
    artifactUrl: 'https://example.com/read-file.tar.gz',
  },
  {
    name: 'write-file',
    description: 'Write files',
    version: '1.0.0',
    artifactUrl: 'https://example.com/write-file.tar.gz',
  },
  {
    name: 'grep',
    description: 'Search files',
    version: '1.0.0',
    artifactUrl: 'https://example.com/grep.tar.gz',
  },
];

describe('excludeInstalledTools', () => {
  test('removes installed tools while preserving repository order', () => {
    const availableTools = excludeInstalledTools(tools, ['write-file']);

    expect(availableTools.map((tool) => tool.name)).toEqual([
      'read-file',
      'grep',
    ]);
  });

  test('returns an empty list when every tool is installed', () => {
    const availableTools = excludeInstalledTools(
      tools,
      tools.map((tool) => tool.name),
    );

    expect(availableTools).toEqual([]);
  });
});
