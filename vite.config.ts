import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * One HTML entry per page: the hub at / and one folder per module
 * (see src/config/modules.ts). Everything in /public is copied as is.
 */
export const PAGES = {
  hub: 'index.html',
  viewer: 'viewer/index.html',
} as const;

const root = import.meta.dirname;

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false,
    rolldownOptions: {
      input: Object.fromEntries(Object.entries(PAGES).map(([name, file]) => [name, resolve(root, file)])),
    },
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
