import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { RouterApp } from './router';
import './index.css';

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Use system+neutral (new API defaults) for consistency across the app */}
    <ThemeProvider defaultMode="system" defaultScheme="neutral">
      <RouterApp />
    </ThemeProvider>
  </StrictMode>
);
