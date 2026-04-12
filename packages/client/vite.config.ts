import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import pkg from './package.json';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

const host = process.env.TAURI_DEV_HOST;

const serverOrigin = process.env.VITE_SERVER_URL || 'http://localhost:3000';
const wsOrigin = serverOrigin.replace(/^http/, 'ws');

export default defineConfig({
  clearScreen: false,
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: true }),
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  },
  define: {
    __CLIENT_VERSION__: JSON.stringify(pkg.version),
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    outDir: 'dist',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/api': {
        target: serverOrigin,
        changeOrigin: true,
        secure: false
      },
      '/ws': {
        target: wsOrigin,
        ws: true,
        secure: false
      }
    }
  }
});
