import { defineConfig, mergeConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

export default mergeConfig(
  {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      __CLIENT_VERSION__: JSON.stringify(pkg.version),
    },
  },
  defineConfig({
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
      css: false,
    },
  }),
);
