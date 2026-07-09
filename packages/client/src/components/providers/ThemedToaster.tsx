import { Toaster } from 'sonner';
import { useTheme } from '@/components/providers/ThemeProvider';

export function ThemedToaster() {
  const { resolvedMode } = useTheme();

  return (
    <Toaster
      position="bottom-right"
      closeButton
      richColors
      theme={resolvedMode}
      toastOptions={{
        classNames: {
          toast: 'bg-popover text-popover-foreground border-border',
          description: 'text-muted-foreground',
          closeButton: 'bg-border',
        },
      }}
    />
  );
}
