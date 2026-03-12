import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="jean2-theme">
      <App />
    </ThemeProvider>
  </StrictMode>
);
