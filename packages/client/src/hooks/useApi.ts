import { useCallback } from 'react';
import { getStoredToken } from '@/config/auth';

export function useApi() {
  const fetchWithAuth = useCallback(async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    const token = getStoredToken();
    
    const headers = new Headers(options.headers || {});
    
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    return fetch(url, {
      ...options,
      headers,
    });
  }, []);
  
  return { fetchWithAuth };
}
