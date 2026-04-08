import { useClientFromContext } from './use-internal-client';
import type { Jean2Client } from '@jean2/sdk';

export function useJean2Client(): Jean2Client {
  return useClientFromContext();
}
