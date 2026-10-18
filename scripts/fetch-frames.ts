#!/usr/bin/env node
/**
 * Downloads a short sequence of Meteosat image crops from EUMETSAT's public
 * EUMETView WMS and writes them, with a manifest, to public/data/<kind>/.
 *
 *   node scripts/fetch-frames.ts --kind live
 *   node scripts/fetch-frames.ts --kind sample --end 2026-10-18T12:00:00Z --width 960
 *
 * Runs in CI (hourly) for "live", and by hand for the committed "sample".
 * No account or API key is required. The script exits with an error when too
 * few frames could be fetched, so a failed run never replaces good data.
 */
import { mkdir, rm, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  LAYERS,
  OVERLAY_WMS_LAYERS,
  REGION,
  SEQUENCE,
  WMS_ENDPOINT,
  attributionText,
} from '../src/config/app.ts';
import { parseManifest, MANIFEST_SCHEMA_VERSION, type Frame, type Manifest, type SequenceKind } from '../src/data/manifest.ts';
import {
  buildGetMapUrl,
  compactTime,
  extractTimeDimensions,
  latestAvailableTime,
  nearestTimeFromWarning,
  parseTimeDimension,
  selectFrameTimes,
} from './lib/wms.ts';

const USER_AGENT = 'Horizonte/0.1 (+https://github.com/6roli; static image cache, hourly)';
/** EUMETView allows a handful of parallel requests per user; stay well below. */
const MAX_PARALLEL_REQUESTS = 3;
/** Fewer frames than this means something is wrong; keep the previous data. */
const MIN_FRAME_RATIO = 0.5;
/** A real image crop is never this small; WMS errors are tiny XML documents. */
const MIN_IMAGE_BYTES = 2_000;

const { values: args } = parseArgs({
  options: {
    kind: { type: 'string', default: 'live' },
    end: { type: 'string' },
    width: { type: 'string' },
    count: { type: 'string' },
    step: { type: 'string' },
    out: { type: 'string', default: 'public/data' },
    note: { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`--${name} must be a positive integer, got "${value}"`);
  return parsed;
}

function parseKind(value: string | undefined): SequenceKind {
  if (value !== 'live' && value !== 'sample') fail('--kind must be "live" or "sample"');
  return value;
}

const kind = parseKind(args.kind);
if (kind === 'sample' && !args.end) fail('A sample needs a fixed --end time, e.g. --end 2026-10-18T12:00:00Z');

const width = positiveInteger(args.width, REGION.width, 'width');
const height = Math.round((width * REGION.height) / REGION.width);
const frameCount = positiveInteger(args.count, SEQUENCE.frameCount, 'count');
const stepMinutes = positiveInteger(args.step, SEQUENCE.stepMinutes, 'step');
const outputDir = path.resolve(args.out, kind);

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status < 500 && response.status !== 429) break; // client errors will not fix themselves
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Downloads one image and checks it really is an image of the expected type.
 * WMS errors often arrive as HTTP 200 with an XML body, and EUMETView returns
 * them transiently under load, so invalid content is retried too.
 */
async function downloadImage(url: string, expectedType: string, requestedTime?: number, attempts = 3): Promise<Buffer> {
  let lastError: Error = new Error('no attempt made');
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchWithRetry(url);
    const contentType = response.headers.get('content-type') ?? '';
    const body = Buffer.from(await response.arrayBuffer());

    // Guard against GeoServer silently returning a different time than requested. Not retried.
    const nearest = nearestTimeFromWarning(response.headers.get('warning'));
    if (requestedTime !== undefined && nearest !== undefined && nearest !== requestedTime) {
      throw new Error(`server returned ${new Date(nearest).toISOString()} instead of the requested time`);
    }
    if (contentType.startsWith(expectedType) && body.length >= MIN_IMAGE_BYTES) return body;

    const detail = /<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/.exec(body.toString('utf8'))?.[1]?.trim();
    lastError = new Error(`expected ${expectedType} but got "${contentType}" (${body.length} bytes)${detail ? `: ${detail}` : ''}`);
    await new Promise((resolve) => setTimeout(resolve, 3_000 * attempt));
  }
  throw lastError;
}

/** Runs async tasks with a concurrency limit, preserving order. */
async function mapWithLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  console.log(`Horizonte ${kind} update — ${frameCount} frames every ${stepMinutes} min, ${width}×${height} px`);

  // 1. Ask the server which observation times exist for each layer.
  const capabilitiesUrl = `${WMS_ENDPOINT}?service=WMS&version=1.3.0&request=GetCapabilities`;
  const capabilities = await (await fetchWithRetry(capabilitiesUrl)).text();
  const dimensions = extractTimeDimensions(
    capabilities,
    LAYERS.map((layer) => layer.wmsLayer),
  );
  const availability = LAYERS.map((layer) => parseTimeDimension(dimensions.get(layer.wmsLayer)!));

  // 2. Choose frame times every layer has. For live data, end at the newest common time.
  const end = args.end ? Date.parse(args.end) : Math.min(...availability.map(latestAvailableTime));
  if (Number.isNaN(end)) fail(`--end is not a valid time: "${args.end}"`);
  const times = selectFrameTimes(availability, end, frameCount, stepMinutes);
  if (times.length === 0) fail(`No common observation times found ending at ${new Date(end).toISOString()}`);
  console.log(`Times: ${new Date(times[0]).toISOString()} → ${new Date(times.at(-1)!).toISOString()}`);

  // 3. Download into a temporary folder so a failed run leaves the old data untouched.
  const tempDir = `${outputDir}.tmp`;
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(path.join(tempDir, 'frames'), { recursive: true });

  const overlay = await downloadImage(
    buildGetMapUrl({
      endpoint: WMS_ENDPOINT,
      layers: OVERLAY_WMS_LAYERS,
      bbox: REGION.bbox,
      width,
      height,
      format: 'image/png',
      transparent: true,
    }),
    'image/png',
  );
  await writeFile(path.join(tempDir, 'overlay.png'), overlay);

  const frames = await mapWithLimit(times, MAX_PARALLEL_REQUESTS, async (time): Promise<Frame | null> => {
    const iso = new Date(time).toISOString().replace('.000Z', 'Z');
    const images: Record<string, string> = {};
    try {
      for (const layer of LAYERS) {
        const url = buildGetMapUrl({
          endpoint: WMS_ENDPOINT,
          layers: [layer.wmsLayer],
          bbox: REGION.bbox,
          width,
          height,
          format: 'image/jpeg',
          time: iso,
        });
        const fileName = `frames/${layer.id}_${compactTime(time)}.jpg`;
        await writeFile(path.join(tempDir, fileName), await downloadImage(url, 'image/jpeg', time));
        images[layer.id] = fileName;
      }
      console.log(`  ✓ ${iso}`);
      return { time: iso, images };
    } catch (error) {
      // A frame is only useful if every layer has it; skip it otherwise.
      console.warn(`  ✖ ${iso}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });

  const validFrames = frames.filter((frame): frame is Frame => frame !== null);
  if (validFrames.length < Math.ceil(times.length * MIN_FRAME_RATIO)) {
    fail(`Only ${validFrames.length} of ${times.length} frames downloaded; keeping the previous data.`);
  }

  // 4. Write and validate the manifest with the same parser the browser uses.
  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const manifest: Manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    kind,
    generatedAt,
    source: {
      provider: 'EUMETSAT',
      service: 'EUMETView Web Map Service (WMS 1.3.0)',
      endpoint: WMS_ENDPOINT,
      licence: 'CC BY 4.0 (EUMETSAT Core data: Advanced Image Products)',
      attribution: attributionText(new Date(validFrames.at(-1)!.time).getUTCFullYear()),
    },
    region: { name: REGION.name, bbox: { ...REGION.bbox }, crs: 'EPSG:4326', width, height },
    overlay: 'overlay.png',
    layerIds: LAYERS.map((layer) => layer.id),
    frames: validFrames,
    ...(args.note ? { note: args.note } : {}),
  };
  parseManifest(
    manifest,
    LAYERS.map((layer) => layer.id),
  );
  await writeFile(path.join(tempDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  await rm(outputDir, { recursive: true, force: true });
  await rename(tempDir, outputDir);
  console.log(`✔ ${validFrames.length} frames written to ${path.relative(process.cwd(), outputDir)}`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
