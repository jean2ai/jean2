import { createContext } from 'react';
import type { Jean2Client } from '@jean2/sdk';

export const Jean2ClientContext = createContext<Jean2Client | null>(null);
