/**
 * The manifest describes one image sequence: where it comes from, what area it
 * covers and which frame files exist. It is written by scripts/fetch-frames.ts
 * and read by the browser. Both sides validate it with `parseManifest`.
 *
 * No DOM code here: this module also runs in Node.
 */

export const MANIFEST_SCHEMA_VERSION = 1;

/** "live" = recent data from the update job; "sample" = fixed historical example. */
export type SequenceKind = 'live' | 'sample';

export interface Frame {
  /** Observation time (nominal start of the scan) in ISO 8601 UTC. */
  time: string;
  /** Image path per layer id, relative to the manifest file. */
  images: Record<string, string>;
}

export interface Manifest {
  schemaVersion: number;
  kind: SequenceKind;
  /** When the update job produced this manifest (ISO 8601 UTC). */
  generatedAt: string;
  source: {
    provider: string;
    service: string;
    endpoint: string;
    licence: string;
    attribution: string;
  };
  region: {
    name: string;
    bbox: { west: number; south: number; east: number; north: number };
    crs: 'EPSG:4326';
    width: number;
    height: number;
  };
  /** Transparent coastline/border image, relative to the manifest. Optional. */
  overlay?: string;
  layerIds: string[];
  /** Frames sorted from oldest to newest. */
  frames: Frame[];
  /** Optional note for samples, e.g. why this date was chosen. */
  note?: string;
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(`Invalid manifest: ${message}`);
    this.name = 'ManifestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new ManifestError(`"${field}" must be a non-empty string`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ManifestError(`"${field}" must be a number`);
  return value;
}

function requireIsoTime(value: unknown, field: string): string {
  const text = requireString(value, field);
  // Require an explicit UTC designator so times are never read as local time.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new ManifestError(`"${field}" must be an ISO 8601 UTC time ending in "Z", got "${text}"`);
  }
  return text;
}

/** Relative paths only: the manifest must not point the browser at other hosts. */
function requireRelativePath(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (/^[a-z]+:/i.test(text) || text.startsWith('/') || text.includes('..')) {
    throw new ManifestError(`"${field}" must be a relative path inside the data folder, got "${text}"`);
  }
  return text;
}

/**
 * Validates untrusted JSON and returns a typed manifest.
 * @param knownLayerIds layer ids the app can display; unknown ids are rejected.
 */
export function parseManifest(input: unknown, knownLayerIds: readonly string[]): Manifest {
  if (!isRecord(input)) throw new ManifestError('expected a JSON object');

  if (input.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new ManifestError(`unsupported schemaVersion ${String(input.schemaVersion)}`);
  }
  if (input.kind !== 'live' && input.kind !== 'sample') throw new ManifestError('"kind" must be "live" or "sample"');

  if (!isRecord(input.source)) throw new ManifestError('"source" is missing');
  const source = {
    provider: requireString(input.source.provider, 'source.provider'),
    service: requireString(input.source.service, 'source.service'),
    endpoint: requireString(input.source.endpoint, 'source.endpoint'),
    licence: requireString(input.source.licence, 'source.licence'),
    attribution: requireString(input.source.attribution, 'source.attribution'),
  };

  if (!isRecord(input.region) || !isRecord(input.region.bbox)) throw new ManifestError('"region.bbox" is missing');
  const bbox = {
    west: requireNumber(input.region.bbox.west, 'region.bbox.west'),
    south: requireNumber(input.region.bbox.south, 'region.bbox.south'),
    east: requireNumber(input.region.bbox.east, 'region.bbox.east'),
    north: requireNumber(input.region.bbox.north, 'region.bbox.north'),
  };
  if (bbox.west >= bbox.east || bbox.south >= bbox.north) throw new ManifestError('"region.bbox" has inverted corners');
  if (bbox.west < -180 || bbox.east > 180 || bbox.south < -90 || bbox.north > 90) {
    throw new ManifestError('"region.bbox" is outside valid longitude/latitude ranges');
  }
  if (input.region.crs !== 'EPSG:4326') throw new ManifestError('"region.crs" must be "EPSG:4326"');

  if (!Array.isArray(input.layerIds) || input.layerIds.length === 0) {
    throw new ManifestError('"layerIds" must be a non-empty array');
  }
  const layerIds = input.layerIds.map((id, index) => requireString(id, `layerIds[${index}]`));
  const unknown = layerIds.filter((id) => !knownLayerIds.includes(id));
  if (unknown.length > 0) throw new ManifestError(`unknown layer ids: ${unknown.join(', ')}`);

  if (!Array.isArray(input.frames) || input.frames.length === 0) {
    throw new ManifestError('"frames" must be a non-empty array');
  }
  const frames: Frame[] = input.frames.map((frame, index) => {
    if (!isRecord(frame) || !isRecord(frame.images)) throw new ManifestError(`frames[${index}] is malformed`);
    const images: Record<string, string> = {};
    for (const layerId of layerIds) {
      images[layerId] = requireRelativePath(frame.images[layerId], `frames[${index}].images.${layerId}`);
    }
    return { time: requireIsoTime(frame.time, `frames[${index}].time`), images };
  });

  for (let i = 1; i < frames.length; i += 1) {
    if (Date.parse(frames[i].time) <= Date.parse(frames[i - 1].time)) {
      throw new ManifestError('"frames" must be sorted by time, oldest first, without duplicates');
    }
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    kind: input.kind,
    generatedAt: requireIsoTime(input.generatedAt, 'generatedAt'),
    source,
    region: {
      name: requireString(input.region.name, 'region.name'),
      bbox,
      crs: 'EPSG:4326',
      width: requireNumber(input.region.width, 'region.width'),
      height: requireNumber(input.region.height, 'region.height'),
    },
    overlay: input.overlay === undefined ? undefined : requireRelativePath(input.overlay, 'overlay'),
    layerIds,
    frames,
    note: typeof input.note === 'string' ? input.note : undefined,
  };
}
