import { serve } from 'bun';
import app from './app';

const PORT = parseInt(process.env.LSP_SERVER_PORT || '3001', 10);

console.log(`LSP Server starting on port ${PORT}...`);

serve({
  port: PORT,
  fetch: app.fetch,
});

console.log(`LSP Server running on http://localhost:${PORT}`);
