import { StoreHydrator } from '@/components/providers/StoreHydrator';
import ServerShell from '@/components/shell/ServerShell';

export default function ServerRouteComponent() {
  return (
    <StoreHydrator>
      <ServerShell />
    </StoreHydrator>
  );
}
