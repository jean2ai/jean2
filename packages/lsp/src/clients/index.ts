export { BaseLSPClient } from './base';
export { TypeScriptLSPClient } from './typescript';

import { BaseLSPClient } from './base';
import { TypeScriptLSPClient } from './typescript';

export function createClientForLanguage(languageId: string): BaseLSPClient | null {
  switch (languageId) {
    case 'typescript':
      return new TypeScriptLSPClient();
    default:
      return null;
  }
}
