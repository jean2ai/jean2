export function getProtocol(serverUrl: string): 'http' | 'https' {
  return serverUrl.startsWith('https://') ? 'https' : 'http';
}

export function getWsProtocol(serverUrl: string): 'ws' | 'wss' {
  return getProtocol(serverUrl) === 'https' ? 'wss' : 'ws';
}

export function buildApiUrl(serverUrl: string, path: string): string {
  const proto = getProtocol(serverUrl);
  const clean = serverUrl.replace(/^https?:\/\//, '');
  return `${proto}://${clean}${path}`;
}

export function buildWsUrl(serverUrl: string, path: string): string {
  const proto = getWsProtocol(serverUrl);
  const clean = serverUrl.replace(/^https?:\/\//, '');
  return `${proto}://${clean}${path}`;
}
