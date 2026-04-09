import { useContext } from 'react';
import { Jean2ClientContext } from '../context';
import type { Jean2Client } from '@jean2/sdk';

export function useClientFromContext(): Jean2Client | null {
  return useContext(Jean2ClientContext);
}
