// packages/server/src/auth/token.ts
import { randomBytes, createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

import {
  getAuthEnabled,
  getLLMOpenAIApiKey,
  getLLMAnthropicApiKey,
  getLLMOpenRouterApiKey,
  getLLMGoogleApiKey,
  getLLMMinimaxApiKey,
  getLLMZhipuApiKey,
  getLLMZhipuCodingApiKey,
} from '@/env';
import { getDataDir, getAuthTokenPath } from '@/paths';

function getTokenFile(): string {
  return getAuthTokenPath();
}

const _LLM_OPENAI_API_KEY = getLLMOpenAIApiKey();
const _LLM_ANTHROPIC_API_KEY = getLLMAnthropicApiKey();
const _LLM_OPENROUTER_API_KEY = getLLMOpenRouterApiKey();
const _LLM_GOOGLE_API_KEY = getLLMGoogleApiKey();
const _LLM_MINIMAX_API_KEY = getLLMMinimaxApiKey();
const _LLM_ZHIPU_API_KEY = getLLMZhipuApiKey();
const _LLM_ZHIPU_CODING_API_KEY = getLLMZhipuCodingApiKey();

interface TokenData {
  token: string;
  hash: string;
  createdAt: string;
  lastUsed?: string;
}

/**
 * Generate a cryptographically secure token
 * @returns 64-character hex string (256 bits)
 */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a token using SHA-256
 * Used for secure storage - we never store plaintext tokens
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Initialize or retrieve token
 * Creates .jean2 directory if needed
 * Generates new token if none exists
 */
export function initializeToken(): string {
  const dir = getDataDir();
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  if (existsSync(getTokenFile())) {
    try {
      const data: TokenData = JSON.parse(readFileSync(getTokenFile(), 'utf-8'));
      if (data?.token) {
        return data.token;
      }
    } catch {
      console.warn('Token file is corrupt, regenerating...');
    }
  }
  
  const token = generateToken();
  const hash = hashToken(token);
  
  const data: TokenData = {
    token,
    hash,
    createdAt: new Date().toISOString(),
  };
  
  // File mode 0o600 = read/write for owner only
  writeFileSync(getTokenFile(), JSON.stringify(data, null, 2), { mode: 0o600 });
  
  console.log('\n' + '='.repeat(60));
  console.log('🔑 API Token Generated');
  console.log('='.repeat(60));
  console.log(`Token: ${token}`);
  console.log(`\nStored in: ${getTokenFile()}`);
  console.log('\nUse this token to authenticate your client.');
  console.log('='.repeat(60) + '\n');
  
  return token;
}

/**
 * Validate a token against stored hash
 * Uses timing-safe comparison to prevent timing attacks
 */
export function validateToken(providedToken: string | null | undefined): boolean {
  if (!providedToken) {
    return false;
  }
  
  if (!existsSync(getTokenFile())) {
    console.warn('Token file not found. Run initializeToken() first.');
    return false;
  }
  
  try {
    const data: TokenData = JSON.parse(readFileSync(getTokenFile(), 'utf-8'));
    const providedHash = hashToken(providedToken);
    
    // Timing-safe comparison prevents timing attacks
    return timingSafeEqual(providedHash, data.hash);
  } catch (error) {
    console.error('Error validating token:', error);
    return false;
  }
}

/**
 * Update lastUsed timestamp
 * Called after successful authentication
 */
export function updateLastUsed(): void {
  if (!existsSync(getTokenFile())) {
    return;
  }
  
  try {
    const data: TokenData = JSON.parse(readFileSync(getTokenFile(), 'utf-8'));
    data.lastUsed = new Date().toISOString();
    writeFileSync(getTokenFile(), JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error updating lastUsed:', error);
  }
}

/**
 * Regenerate token (invalidates all existing clients)
 * Use when token is compromised
 */
export function regenerateToken(): string {
  console.log('\n🔄 Regenerating API token (this will invalidate all existing clients)...\n');
  return initializeToken();
}

/**
 * Get token file path (for CLI commands)
 */
export function getTokenFilePath(): string {
  return getTokenFile();
}

/**
 * Get API key for a specific LLM provider
 */
export function hasApiKey(provider: string): string | undefined {
  switch (provider) {
    case 'openai':
      return getLLMOpenAIApiKey();
    case 'anthropic':
      return getLLMAnthropicApiKey();
    case 'openrouter':
      return getLLMOpenRouterApiKey();
    case 'google':
      return getLLMGoogleApiKey();
    case 'minimax':
      return getLLMMinimaxApiKey();
    case 'zhipu':
      return getLLMZhipuApiKey();
    case 'zhipu-coding':
      return getLLMZhipuCodingApiKey();
    default:
      return undefined;
  }
}

/**
 * Show current API token information
 */
export function showToken(): void {
  const path = getTokenFilePath();
  
  if (!existsSync(path)) {
    console.log('No token found. Token will be generated on next server start.');
    console.log('Or run: jean2 auth regenerate');
    return;
  }
  
  let data: TokenData;
  try {
    data = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    console.error('Token file is corrupt. Run `jean2 auth regenerate` to fix.');
    return;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🔑 Current API Token');
  console.log('='.repeat(60));
  console.log(`Token:     ${data.token}`);
  console.log(`Created:   ${data.createdAt}`);
  console.log(`Last Used: ${data.lastUsed || 'Never'}`);
  console.log(`File:      ${path}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Show token file path
 */
export function showTokenPath(): void {
  console.log(getTokenFilePath());
}

/**
 * Check if authentication is enabled
 * Enable with JEAN2_AUTH_ENABLED=true env var (default: false)
 */
export function isAuthEnabled(): boolean {
  return getAuthEnabled();
}

/**
 * Timing-safe string comparison
 * Prevents attackers from using timing to guess valid tokens
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
