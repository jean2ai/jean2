// packages/server/src/auth/token.ts
import { randomBytes, createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TOKEN_FILE = join(homedir(), '.jean2', 'auth-token.json');

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
  const dir = join(homedir(), '.jean2');
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  if (existsSync(TOKEN_FILE)) {
    const data: TokenData = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
    return data.token;
  }
  
  const token = generateToken();
  const hash = hashToken(token);
  
  const data: TokenData = {
    token,
    hash,
    createdAt: new Date().toISOString(),
  };
  
  // File mode 0o600 = read/write for owner only
  writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  
  console.log('\n' + '='.repeat(60));
  console.log('🔑 API Token Generated');
  console.log('='.repeat(60));
  console.log(`Token: ${token}`);
  console.log(`\nStored in: ${TOKEN_FILE}`);
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
  
  if (!existsSync(TOKEN_FILE)) {
    console.warn('Token file not found. Run initializeToken() first.');
    return false;
  }
  
  try {
    const data: TokenData = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
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
  if (!existsSync(TOKEN_FILE)) {
    return;
  }
  
  try {
    const data: TokenData = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
    data.lastUsed = new Date().toISOString();
    writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
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
  return TOKEN_FILE;
}

/**
 * Check if authentication is enabled
 * Can be disabled with DISABLE_AUTH=true env var
 */
export function isAuthEnabled(): boolean {
  return process.env.DISABLE_AUTH !== 'true';
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
