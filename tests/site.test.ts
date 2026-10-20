import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HUB_MODULES } from '../src/config/modules.ts';
import { WEATHER_SNAPSHOT_URL } from '../src/config/app.ts';
import { PAGES } from '../vite.config.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('hub modules', () => {
  it('have unique ids and paths', () => {
    expect(new Set(HUB_MODULES.map((m) => m.id)).size).toBe(HUB_MODULES.length);
    expect(new Set(HUB_MODULES.map((m) => m.path)).size).toBe(HUB_MODULES.length);
  });

  it.each(HUB_MODULES.map((m) => [m.id, m] as const))('%s has a built page, a preview and a top bar', (_, module) => {
    expect(module.path).toMatch(/^\/[a-z0-9-]+\/$/);
    const htmlFile = `${module.path.slice(1)}index.html`;
    expect(Object.values(PAGES)).toContain(htmlFile);
    expect(existsSync(new URL(`public${module.preview}`, root))).toBe(true);

    const html = read(htmlFile);
    expect(html).toContain('id="topbar"');
    expect(html).toMatch(/<script type="module" src="\/src\/pages\/[a-z-]+\.ts"><\/script>/);
  });

  it('every page entry exists and uses no inline scripts (CSP script-src self)', () => {
    for (const file of Object.values(PAGES)) {
      const html = read(file);
      const scripts = html.match(/<script\b[^>]*>/g) ?? [];
      for (const tag of scripts) expect(tag).toMatch(/\ssrc="/);
    }
  });
});

describe('deployment settings', () => {
  const headers = read('public/_headers');

  it('never sends a Referer (Hugging Face rejects workers.dev referrers)', () => {
    expect(headers).toMatch(/^\s*Referrer-Policy: no-referrer$/m);
  });

  it('allows the snapshot host and its CDN redirect in connect-src only', () => {
    const csp = /Content-Security-Policy: (.*)$/m.exec(headers)?.[1] ?? '';
    const connect = /connect-src ([^;]*)/.exec(csp)?.[1] ?? '';
    expect(connect).toContain(new URL(WEATHER_SNAPSHOT_URL).origin);
    expect(connect).toContain('https://*.hf.co');
    expect(connect).toContain('https://view.eumetsat.int');
    expect(csp).toMatch(/script-src 'self';/);
  });

  it('wrangler.jsonc serves dist/ and enables branch previews', () => {
    // JSONC: drop line comments before parsing.
    const config = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
    expect(config.assets.directory).toBe('./dist');
    expect(config.previews).toEqual({});
  });
});
