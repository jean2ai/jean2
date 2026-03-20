import { homedir } from 'os';
import { join } from 'path';

import { BaseLSPClient } from './base';

const SUPPORTED_EXTENSIONS = new Set([
  '.php',
  '.phtml',
]);

export class PhpLSPClient extends BaseLSPClient {
  readonly languageId = 'php';
  readonly serverCommand = ['intelephense', '--stdio'];

  static supportsFile(uri: string): boolean {
    const extension = uri.includes('.')
      ? uri.slice(uri.lastIndexOf('.'))
      : '';
    return SUPPORTED_EXTENSIONS.has(extension);
  }

  canHandle(uri: string): boolean {
    return PhpLSPClient.supportsFile(uri);
  }

  getDocumentSelector(): string[] {
    return ['php'];
  }

  getInitializeOptions(): Record<string, unknown> {
    return {
      storagePath: join(homedir(), '.jean2', 'services', 'lsp', 'intelephense'),
    };
  }
}
