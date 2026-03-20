export { BaseLSPClient } from './base';
export { PhpLSPClient } from './php';
export { TypeScriptLSPClient } from './typescript';

import { BaseLSPClient } from './base';
import { PhpLSPClient } from './php';
import { TypeScriptLSPClient } from './typescript';

export function createClientForLanguage(languageId: string): BaseLSPClient | null {
  switch (languageId) {
    case 'php':
      return new PhpLSPClient();
    case 'typescript':
      return new TypeScriptLSPClient();
    default:
      return null;
  }
}
