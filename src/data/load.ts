/**
 * Data access for the browser. Tries live data from EUMETView first and falls
 * back to the committed historical sample, recording why.
 */
import { GEOSERVER_BASE, LAYERS } from '../config/app.ts';
import { parseManifest } from './manifest.ts';
import { buildLiveSequence, sequenceFromManifest, type Sequence } from './sequence.ts';
import { extractTimeDimensions, layerCapabilitiesUrl } from './wms.ts';

export const SAMPLE_MANIFEST_URL = 'data/sample/manifest.json';

/**
 * Coastlines and borders never change, so the overlay is bundled with the app
 * (Natural Earth data, public domain, rendered once by EUMETView at the live
 * frame size) instead of being requested from EUMETSAT on every visit.
 */
export const LIVE_OVERLAY_URL = 'overlay/coastlines-1200.png';

/** Network calls give up after this long so the fallback appears quickly. */
const REQUEST_TIMEOUT_MS = 12_000;

export interface LoadedSequence {
  sequence: Sequence;
  /** Why live data was not used, when the sample is shown instead. */
  liveProblem?: string;
}

async function fetchText(url: string, what: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    throw new Error(timedOut ? `${what} did not answer in time` : `${what} could not be reached`);
  }
  if (!response.ok) throw new Error(`${what} answered ${response.status} ${response.statusText}`.trim());
  return response.text();
}

/** Asks EUMETView which observation times exist (one small request per layer). */
async function loadLiveSequence(): Promise<Sequence> {
  const dimensions = new Map<string, string>();
  await Promise.all(
    LAYERS.map(async (layer) => {
      const xml = await fetchText(layerCapabilitiesUrl(GEOSERVER_BASE, layer.wmsLayer), 'EUMETView');
      // Per-layer capabilities name the layer without its workspace prefix.
      const shortName = layer.wmsLayer.split(':')[1];
      const name = xml.includes(`<Name>${layer.wmsLayer}</Name>`) ? layer.wmsLayer : shortName;
      dimensions.set(layer.wmsLayer, extractTimeDimensions(xml, [name]).get(name)!);
    }),
  );
  const sequence = buildLiveSequence(dimensions, new Date());
  return { ...sequence, overlayUrl: new URL(LIVE_OVERLAY_URL, document.baseURI).href };
}

async function loadSampleSequence(pageUrl: string): Promise<Sequence> {
  const manifestUrl = new URL(SAMPLE_MANIFEST_URL, pageUrl);
  const text = await fetchText(manifestUrl.href, 'The sample');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('the sample data file is not valid JSON');
  }
  const manifest = parseManifest(
    json,
    LAYERS.map((layer) => layer.id),
  );
  return sequenceFromManifest(manifest, manifestUrl);
}

export async function loadSequence(pageUrl: string = document.baseURI): Promise<LoadedSequence> {
  let liveProblem: string;
  try {
    return { sequence: await loadLiveSequence() };
  } catch (error) {
    liveProblem = error instanceof Error ? error.message : String(error);
  }
  try {
    return { sequence: await loadSampleSequence(pageUrl), liveProblem };
  } catch (error) {
    const sampleProblem = error instanceof Error ? error.message : String(error);
    throw new Error(`Live data unavailable (${liveProblem}) and the historical sample failed to load (${sampleProblem}).`);
  }
}
