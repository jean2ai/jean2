#!/usr/bin/env bun
// packages/server/src/auth/cli.ts

import { regenerateToken, getTokenFilePath } from './token';
import { readFileSync, existsSync } from 'fs';

function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'show':
    case 'token':
      showToken();
      break;
      
    case 'regenerate':
    case 'regen':
      regenerateToken();
      break;
      
    case 'path':
      console.log(getTokenFilePath());
      break;
      
    default:
      console.log(`
Jean2 Token Management

Commands:
  show        Show current API token
  regenerate  Generate a new token (invalidates old one)
  path        Show token file path

Usage:
  bun run src/auth/cli.ts show
  bun run src/auth/cli.ts regenerate
`);
  }
}

function showToken() {
  const path = getTokenFilePath();
  
  if (!existsSync(path)) {
    console.log('No token found. Token will be generated on next server start.');
    console.log('Or run: bun run src/auth/cli.ts regenerate');
    return;
  }
  
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  
  console.log('\n' + '='.repeat(60));
  console.log('🔑 Current API Token');
  console.log('='.repeat(60));
  console.log(`Token:     ${data.token}`);
  console.log(`Created:   ${data.createdAt}`);
  console.log(`Last Used: ${data.lastUsed || 'Never'}`);
  console.log(`File:      ${path}`);
  console.log('='.repeat(60) + '\n');
}

main();
