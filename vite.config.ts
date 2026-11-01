import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * One HTML entry per page: the hub at / and one folder per module
 * (see src/config/modules.ts). Everything in /public is copied as is.
 */
export const PAGES = {
  hub: 'index.html',
  viewer: 'viewer/index.html',
  weather: 'weather/index.html',
  ask: 'ask/index.html',
} as const;

const root = import.meta.dirname;

/**
 * onnxruntime-web references its .wasm files with new URL(…, import.meta.url), so
 * Vite copies them to dist/. They are above Cloudflare's 25 MiB per-file limit and
 * never requested: transformers.js loads them from jsDelivr (see text2sql-worker.ts).
 */
function dropOnnxRuntimeWasm(): Plugin {
  return {
    name: 'drop-onnxruntime-wasm',
    generateBundle(_, bundle) {
      for (const name of Object.keys(bundle)) if (/ort-wasm[^/]*\.wasm$/.test(name)) delete bundle[name];
    },
  };
}

export default defineConfig({
  plugins: [dropOnnxRuntimeWasm()],
  worker: {
    format: 'es',
    plugins: () => [dropOnnxRuntimeWasm()],
  },
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
