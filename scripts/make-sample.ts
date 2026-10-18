#!/usr/bin/env node
/**
 * Creates the committed historical sample in public/data/sample/: a fixed
 * sequence the app shows (clearly labelled) whenever live data is unavailable.
 *
 *   npm run make:sample -- --end 2026-10-18T12:00:00Z --note "Why this date…"
 *
 * Uses exactly the same request builder as the browser (src/data/sequence.ts),
 * then downloads each image, checks it and writes a validated manifest.
 * Public data; no account or API key needed. Run by hand, not on a schedule.
 */
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { GEOSERVER_BASE, LAYERS, REGION } from '../src/config/app.ts';
import { MANIFEST_SCHEMA_VERSION, parseManifest, type Frame, type Manifest } from '../src/data/manifest.ts';
import { buildLiveSequence } from '../src/data/sequence.ts';
import { compactTime, extractTimeDimensions, layerCapabilitiesUrl, nearestTimeFromWarning } from '../src/data/wms.ts';

const USER_AGENT = 'Horizonte/0.1 sample builder (https://github.com/6roli)';
const OUTPUT_DIR = path.resolve('public/data/sample');
/** WMS errors are tiny XML documents; a real crop is never this small. */
const MIN_IMAGE_BYTES = 2_000;

const { values: args } = parseArgs({
  options: {
    end: { type: 'string' },
    width: { type: 'string', default: '800' },
    note: { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const end = Date.parse(args.end ?? '');
if (Number.isNaN(end)) fail('Pass a fixed --end time in UTC, e.g. --end 2026-10-18T12:00:00Z');
const width = Number(args.width);
if (!Number.isInteger(width) || width < 200 || width > REGION.width) fail(`--width must be 200–${REGION.width}`);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Downloads one image and checks it is really an image. WMS errors often come
 * back as HTTP 200 with an XML body, and EUMETView returns some transiently
 * under load, so each request is tried up to three times.
 */
async function downloadImage(url: string, expectedType: string, requestedTime?: number): Promise<Buffer> {
  let lastError = 'no attempt made';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) });
      const body = Buffer.from(await response.arrayBuffer());
      // GeoServer may silently return the nearest available time instead. Not retried.
      const nearest = nearestTimeFromWarning(response.headers.get('warning'));
      if (requestedTime !== undefined && nearest !== undefined && nearest !== requestedTime) {
        throw new Error(`server returned ${new Date(nearest).toISOString()} instead of the requested time`);
      }
      const type = response.headers.get('content-type') ?? '';
      if (response.ok && type.startsWith(expectedType) && body.length >= MIN_IMAGE_BYTES) return body;
      lastError = `HTTP ${response.status}, ${type}, ${body.length} bytes`;
    } catch (error) {
      if (error instanceof Error && error.message.includes('instead of the requested time')) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(3_000 * attempt);
  }
  throw new Error(lastError);
}

async function main(): Promise<void> {
  // 1. Which times exist for each layer.
  const dimensions = new Map<string, string>();
  for (const layer of LAYERS) {
    const response = await fetch(layerCapabilitiesUrl(GEOSERVER_BASE, layer.wmsLayer), { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) fail(`Capabilities for ${layer.wmsLayer}: HTTP ${response.status}`);
    const shortName = layer.wmsLayer.split(':')[1];
    dimensions.set(layer.wmsLayer, extractTimeDimensions(await response.text(), [shortName]).get(shortName)!);
  }

  // 2. Same frame selection and URLs as the browser, but ending at the fixed time.
  const sequence = buildLiveSequence(dimensions, new Date(), { end, width });
  console.log(`Sample: ${sequence.frames.length} frames, ${sequence.frames[0].time} → ${sequence.frames.at(-1)!.time}, ${width} px wide`);

  // 3. Download into a temporary folder; replace the old sample only on success.
  const tempDir = `${OUTPUT_DIR}.tmp`;
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(path.join(tempDir, 'frames'), { recursive: true });
  await writeFile(path.join(tempDir, 'overlay.png'), await downloadImage(sequence.overlayUrl!, 'image/png'));

  const frames: Frame[] = [];
  for (const frame of sequence.frames) {
    const time = Date.parse(frame.time);
    const images: Record<string, string> = {};
    for (const layerId of sequence.layerIds) {
      const fileName = `frames/${layerId}_${compactTime(time)}.jpg`;
      await writeFile(path.join(tempDir, fileName), await downloadImage(frame.images[layerId], 'image/jpeg', time));
      images[layerId] = fileName;
    }
    frames.push({ time: frame.time, images });
    console.log(`  ✓ ${frame.time}`);
    await sleep(200); // a polite pace for a public service
  }

  // 4. Write the manifest and validate it with the same parser the browser uses.
  const manifest: Manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    kind: 'sample',
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source: sequence.source,
    region: { name: REGION.name, bbox: sequence.bbox, crs: 'EPSG:4326', width, height: Math.round((width * REGION.height) / REGION.width) },
    overlay: 'overlay.png',
    layerIds: sequence.layerIds,
    frames,
    ...(args.note ? { note: args.note } : {}),
  };
  parseManifest(
    manifest,
    LAYERS.map((layer) => layer.id),
  );
  await writeFile(path.join(tempDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await rename(tempDir, OUTPUT_DIR);
  console.log(`✔ Sample written to ${path.relative(process.cwd(), OUTPUT_DIR)}`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
