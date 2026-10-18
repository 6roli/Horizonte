import { defineConfig } from 'vite';

// Plain static build: index.html + bundled JS/CSS + everything in /public
// (including the frames written by scripts/fetch-frames.ts).
export default defineConfig({
  build: {
    outDir: 'dist',
    // Leaflet is ~150 kB unminified; the warning threshold is fine as is.
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
