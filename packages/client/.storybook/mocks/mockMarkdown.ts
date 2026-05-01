// =============================================================================
// Markdown Content Samples — for MarkdownRenderer stories
// =============================================================================

/** Simple markdown with headers and paragraphs */
export const simpleMarkdown = [
  '# Getting Started',
  '',
  'Welcome to the project! This guide will help you set up your development environment.',
  '',
  '## Prerequisites',
  '',
  '- **Node.js** >= 18.0.0',
  '- **Bun** runtime',
  '- A code editor (VS Code recommended)',
  '',
  '## Installation',
  '',
  'Clone the repository and install dependencies:',
  '',
  '```bash',
  'git clone https://github.com/example/project.git',
  'cd project',
  'bun install',
  '```',
].join('\n');

/** Markdown with rich formatting: tables, code, blockquotes, lists */
export const richMarkdown = [
  '# API Reference',
  '',
  '## `createSession(options)`',
  '',
  'Creates a new chat session with the specified options.',
  '',
  '> **Note**: Sessions are automatically saved to the database upon creation.',
  '',
  '### Parameters',
  '',
  '| Parameter | Type | Required | Description |',
  '|-----------|------|----------|-------------|',
  '| `title` | `string` | No | Session title |',
  '| `model` | `string` | Yes | Model identifier |',
  '| `provider` | `string` | Yes | Provider name |',
  '',
  '### Returns',
  '',
  '```typescript',
  'interface Session {',
  '  id: string;',
  '  title: string | null;',
  '  status: "active" | "closed";',
  '  createdAt: string;',
  '}',
  '```',
  '',
  '### Example',
  '',
  '```typescript',
  'const session = await createSession({',
  "  title: 'My Chat',",
  "  model: 'claude-3.5-sonnet',",
  "  provider: 'anthropic',",
  '});',
  'console.log(session.id); // "sess-abc123"',
  '```',
  '',
  '---',
  '',
  '## Error Handling',
  '',
  'The API returns structured errors:',
  '',
  '```json',
  '{',
  '  "success": false,',
  '  "error": "Model not found: invalid-model-id"',
  '}',
  '```',
  '',
  '1. **400** — Invalid request parameters',
  '2. **404** — Resource not found',
  '3. **500** — Internal server error',
  '',
  '### See also',
  '',
  '- [Authentication Guide](./auth.md)',
  '- [Rate Limiting](./rate-limits.md)',
  '- [SDK Reference](./sdk.md)',
].join('\n');

/** Markdown with inline code, bold, italic, strikethrough */
export const inlineFormattingMarkdown = [
  '## Text Formatting',
  '',
  'You can use **bold**, *italic*, and ~~strikethrough~~ text.',
  '',
  'Inline code looks like `const x = 42;` and can be used mid-sentence.',
  '',
  'Links: [Visit GitHub](https://github.com) for more info.',
  '',
  '### Task list',
  '',
  '- [x] Set up project',
  '- [x] Configure ESLint',
  '- [ ] Add tests',
  '- [ ] Deploy to production',
  '',
  '### Nested list',
  '',
  '- Item 1',
  '  - Sub-item 1.1',
  '  - Sub-item 1.2',
  '- Item 2',
  '  - Sub-item 2.1',
  '    - Deep nested item',
].join('\n');

/** Markdown with code blocks in multiple languages */
export const codeBlocksMarkdown = [
  '## Code Examples',
  '',
  '### TypeScript',
  '',
  '```typescript',
  'interface Config {',
  '  port: number;',
  '  host: string;',
  '  debug?: boolean;',
  '}',
  '',
  'const config: Config = {',
  '  port: 3000,',
  "  host: 'localhost',",
  '  debug: process.env.NODE_ENV === "development",',
  '};',
  '```',
  '',
  '### Python',
  '',
  '```python',
  'from dataclasses import dataclass',
  '',
  '@dataclass',
  'class Config:',
  '    port: int = 3000',
  '    host: str = "localhost"',
  '    debug: bool = False',
  '',
  'config = Config()',
  'print(f"Running on {config.host}:{config.port}")',
  '```',
  '',
  '### Bash',
  '',
  '```bash',
  '#!/bin/bash',
  'set -euo pipefail',
  '',
  'echo "Building project..."',
  'bun run build',
  'echo "Done!"',
  '```',
  '',
  '### JSON',
  '',
  '```json',
  '{',
  '  "name": "my-project",',
  '  "version": "1.0.0",',
  '  "scripts": {',
  '    "dev": "bun run dev",',
  '    "build": "bun run build"',
  '  }',
  '}',
  '```',
].join('\n');

/** Short markdown for compact display testing */
export const shortMarkdown = 'This is a **short** markdown string with `inline code` and a [link](https://example.com).';

/** Empty markdown */
export const emptyMarkdown = '';

/** Very long markdown for scroll/overflow testing */
export function generateLongMarkdown(sections = 20): string {
  const lines: string[] = [];
  for (let i = 1; i <= sections; i++) {
    lines.push(`## Section ${i}`);
    lines.push('');
    lines.push(`This is the content of section ${i}. It contains some text to test scrolling and rendering performance.`);
    lines.push('');
    if (i % 3 === 0) {
      lines.push('```typescript');
      lines.push(`const section${i} = {`);
      lines.push(`  id: ${i},`);
      lines.push(`  name: 'Section ${i}',`);
      lines.push('};');
      lines.push('```');
      lines.push('');
    }
    if (i % 5 === 0) {
      lines.push('> This is a blockquote in section ' + i);
      lines.push('');
    }
  }
  return lines.join('\n');
}

// =============================================================================
// Presets
// =============================================================================

export const markdownPresets = {
  simple: simpleMarkdown,
  rich: richMarkdown,
  inline: inlineFormattingMarkdown,
  codeBlocks: codeBlocksMarkdown,
  short: shortMarkdown,
  empty: emptyMarkdown,
  long: generateLongMarkdown(),
} as const;
