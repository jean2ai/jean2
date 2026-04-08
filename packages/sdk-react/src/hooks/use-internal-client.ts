import { useContext } from 'react';
import { Jean2ClientContext } from '../context';
import type { Jean2Client } from '@jean2/sdk';

export function useClientFromContext(): Jean2Client {
  const client = useContext(Jean2ClientContext);
  if (!client) {
    throw new Error('Jean2 React hooks must be used within a <Jean2ClientProvider>');
  }
  return client;
}
