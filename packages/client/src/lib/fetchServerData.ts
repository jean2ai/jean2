import { HttpClient, HttpNamespace } from '@jean2/sdk';
import type { LoadAllResult } from '@jean2/sdk';

export type ServerData = LoadAllResult;

export async function fetchServerData(
  serverUrl: string,
  apiToken: string,
  signal?: AbortSignal,
): Promise<ServerData> {
  const httpClient = new HttpClient({ url: serverUrl, token: apiToken });
  const http = new HttpNamespace(httpClient);
  return http.loadAll({ signal });
}
