import type { ReactNode } from 'react';
import { Jean2ClientContext } from './context';
import type { Jean2Client } from '@jean2/sdk';

interface Jean2ClientProviderProps {
  client: Jean2Client;
  children: ReactNode;
}

export function Jean2ClientProvider({ client, children }: Jean2ClientProviderProps): JSX.Element {
  return (
    <Jean2ClientContext.Provider value={client}>
      {children}
    </Jean2ClientContext.Provider>
  );
}
