import { BaseLSPClient } from './base';

const SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);

export class TypeScriptLSPClient extends BaseLSPClient {
  readonly languageId = 'typescript';
  readonly serverCommand = ['typescript-language-server', '--stdio'];

  static supportsFile(uri: string): boolean {
    const extension = uri.includes('.')
      ? uri.slice(uri.lastIndexOf('.'))
      : '';
    return SUPPORTED_EXTENSIONS.has(extension);
  }

  canHandle(uri: string): boolean {
    return TypeScriptLSPClient.supportsFile(uri);
  }

  getDocumentSelector(): string[] {
    return [
      'typescript',
      'typescriptreact',
      'javascript',
      'javascriptreact',
    ];
  }

  getInitializeOptions(): Record<string, unknown> {
    return {
      preferences: {
        includeInlayParameterNameHints: 'all',
        includeInlayFunctionParameterTypeHints: true,
        includeInlayVariableTypeHints: true,
        includeInlayPropertyDeclarationTypeHints: true,
        includeInlayFunctionLikeReturnTypeHints: true,
      },
      suggest: {
        completeFunctionCalls: true,
      },
    };
  }
}
