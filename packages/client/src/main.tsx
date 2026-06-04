import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { RouterApp } from './router';
import { VSCodeEntry } from '@/components/shell/VSCodeBootstrap';
import { platform } from '@/platform';
import './index.css';

// Global error handlers for debugging uncaught errors
window.addEventListener('error', (event) => {
  console.error('[Global] Uncaught error:', event.error || event.message);
  console.error('[Global] Error stack:', event.error?.stack);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global] Unhandled rejection:', event.reason);
  console.error('[Global] Rejection stack:', event.reason?.stack);
});

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

function App() {
  if (platform.id === 'vscode') {
    return <VSCodeEntry />;
  }
  return (
    <ErrorBoundary>
      <RouterApp />
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryProvider>
        <ThemeProvider defaultMode="system" defaultScheme="neutral">
          <App />
        </ThemeProvider>
      </QueryProvider>
    </ErrorBoundary>
  </StrictMode>
);
