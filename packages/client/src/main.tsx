import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Use system+neutral (new API defaults) for consistency across the app */}
    <ThemeProvider defaultMode="system" defaultScheme="neutral">
      <App />
    </ThemeProvider>
  </StrictMode>
);
