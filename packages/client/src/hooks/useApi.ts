import { useCallback } from 'react';

interface FetchConfig {
  serverUrl?: string;
  token?: string;
}

export function useApi() {
  const fetchWithAuth = useCallback(async (
    url: string,
    options: RequestInit = {},
    config?: FetchConfig
  ): Promise<Response> => {
    const { serverUrl, token } = config || {};
    
    // Construct full URL for relative paths
    let fullUrl = url;
    if (url.startsWith('/') && serverUrl) {
      fullUrl = `http://${serverUrl}${url}`;
    }
    
    const headers = new Headers(options.headers || {});
    
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    return fetch(fullUrl, {
      ...options,
      headers,
    });
  }, []);
  
  return { fetchWithAuth };
}
