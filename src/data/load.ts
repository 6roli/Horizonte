import { LAYERS } from '../config/app.ts';
import { parseManifest, type Manifest } from './manifest.ts';

/** Where the browser looks for data, in order of preference. */
export const LIVE_MANIFEST_URL = 'data/live/manifest.json';
export const SAMPLE_MANIFEST_URL = 'data/sample/manifest.json';

export interface LoadedSequence {
  manifest: Manifest;
  /** Base URL used to resolve the relative image paths in the manifest. */
  baseUrl: URL;
  /** Why live data was not used, when the sample is shown instead. */
  liveProblem?: string;
}

async function fetchManifest(url: URL): Promise<Manifest> {
  // no-cache: the browser revalidates so a new hourly manifest is picked up promptly.
  const response = await fetch(url, { cache: 'no-cache' });
  if (response.status === 404) throw new Error('no live data has been published yet');
  if (!response.ok) throw new Error(`the server answered ${response.status} ${response.statusText}`);
  // Single-page-app fallbacks answer missing files with index.html and status 200.
  if ((response.headers.get('content-type') ?? '').includes('text/html')) {
    throw new Error('no live data has been published yet');
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error('the data file is not valid JSON');
  }
  return parseManifest(
    json,
    LAYERS.map((layer) => layer.id),
  );
}

/**
 * Loads live data when available and valid; otherwise falls back to the
 * bundled historical sample, recording why. Throws only if both fail.
 */
export async function loadSequence(pageUrl: string = document.baseURI): Promise<LoadedSequence> {
  const liveUrl = new URL(LIVE_MANIFEST_URL, pageUrl);
  let liveProblem: string;
  try {
    return { manifest: await fetchManifest(liveUrl), baseUrl: liveUrl };
  } catch (error) {
    liveProblem = error instanceof Error ? error.message : String(error);
  }

  const sampleUrl = new URL(SAMPLE_MANIFEST_URL, pageUrl);
  try {
    return { manifest: await fetchManifest(sampleUrl), baseUrl: sampleUrl, liveProblem };
  } catch (error) {
    const sampleProblem = error instanceof Error ? error.message : String(error);
    throw new Error(`Live data unavailable (${liveProblem}) and the historical sample failed to load (${sampleProblem}).`);
  }
}

export function resolveImageUrl(sequence: LoadedSequence, relativePath: string): string {
  return new URL(relativePath, sequence.baseUrl).href;
}
