import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    electron([
      {
        entry: 'src/main.ts',
        onstart(args) {
          args.startup();
        },
        vite: {
          build: {
            sourcemap: true,
            outDir: 'dist',
            rollupOptions: {
              external: ['electron', 'electron-store', 'electron-updater', 'electron-log'],
            },
          },
        },
      },
      {
        entry: 'src/preload.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            sourcemap: true,
            outDir: 'dist',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
