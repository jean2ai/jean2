import { useCallback } from 'react';
import { getStoredToken, getStoredServerUrl } from '@/config/auth';

export function useApi() {
  const fetchWithAuth = useCallback(async (
    url: string,
    options: RequestInit = {},
    serverUrl?: string
  ): Promise<Response> => {
    const token = getStoredToken();
    
    // Get server URL from parameter or localStorage
    const baseUrl = serverUrl || getStoredServerUrl();
    
    // Construct full URL for relative paths
    let fullUrl = url;
    if (url.startsWith('/') && baseUrl) {
      fullUrl = `http://${baseUrl}${url}`;
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
