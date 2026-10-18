/**
 * The sequence the viewer plays, whatever its origin:
 *  - "live":   built in the browser from EUMETView's time dimensions; images load directly from EUMETSAT.
 *  - "sample": read from the committed manifest in public/data/sample/; images are local files.
 *
 * Builders here are pure (no fetch, no DOM) so they can be unit-tested.
 */
import {
  LAYERS,
  OVERLAY_WMS_LAYERS,
  REGION,
  SEQUENCE,
  WMS_ENDPOINT,
  attributionText,
  type LayerDefinition,
} from '../config/app.ts';
import type { Manifest, SequenceKind } from './manifest.ts';
import { buildGetMapUrl, latestAvailableTime, parseTimeDimension, selectFrameTimes } from './wms.ts';

export interface SequenceFrame {
  /** Observation time (nominal scan start), ISO 8601 UTC. */
  time: string;
  /** Absolute image URL per layer id. */
  images: Record<string, string>;
}

export interface Sequence {
  kind: SequenceKind;
  source: Manifest['source'];
  bbox: Manifest['region']['bbox'];
  layerIds: string[];
  /** Oldest first. */
  frames: SequenceFrame[];
  overlayUrl?: string;
  /** Live: when the browser asked EUMETView. Sample: when the sample was created. */
  retrievedAt: string;
  note?: string;
}

export const SOURCE_SERVICE = 'EUMETView Web Map Service (WMS 1.3.0)';
export const SOURCE_LICENCE = 'CC BY 4.0 (EUMETSAT Core data: Advanced Image Products)';

const toIso = (time: number) => new Date(time).toISOString().replace('.000Z', 'Z');

export interface BuildOptions {
  /** Last frame time (ms). Default: the newest time every layer has. */
  end?: number;
  /** Image width in pixels; height follows the region's aspect ratio. */
  width?: number;
  layers?: LayerDefinition[];
}

/**
 * Builds the live sequence from each layer's WMS time dimension text.
 * Only times every layer has are used, so switching layers never changes the time.
 */
export function buildLiveSequence(
  timeDimensionByLayer: Map<string, string>,
  now: Date,
  { end: requestedEnd, width = REGION.width, layers = LAYERS }: BuildOptions = {},
): Sequence {
  const availability = layers.map((layer) => {
    const text = timeDimensionByLayer.get(layer.wmsLayer);
    if (!text) throw new Error(`no time information for ${layer.title}`);
    return parseTimeDimension(text);
  });

  const end = requestedEnd ?? Math.min(...availability.map(latestAvailableTime));
  const height = Math.round((width * REGION.height) / REGION.width);
  const times = selectFrameTimes(availability, end, SEQUENCE.frameCount, SEQUENCE.stepMinutes);
  if (times.length === 0) throw new Error('EUMETView reports no common observation times');

  const getMap = (wmsLayers: string[], format: 'image/jpeg' | 'image/png', time?: string) =>
    buildGetMapUrl({
      endpoint: WMS_ENDPOINT,
      layers: wmsLayers,
      bbox: REGION.bbox,
      width,
      height,
      format,
      time,
      transparent: format === 'image/png',
    });

  return {
    kind: 'live',
    source: {
      provider: 'EUMETSAT',
      service: SOURCE_SERVICE,
      endpoint: WMS_ENDPOINT,
      licence: SOURCE_LICENCE,
      attribution: attributionText(new Date(end).getUTCFullYear()),
    },
    bbox: { ...REGION.bbox },
    layerIds: layers.map((layer) => layer.id),
    frames: times.map((time) => {
      const iso = toIso(time);
      return {
        time: iso,
        images: Object.fromEntries(layers.map((layer) => [layer.id, getMap([layer.wmsLayer], 'image/jpeg', iso)])),
      };
    }),
    overlayUrl: getMap(OVERLAY_WMS_LAYERS, 'image/png'),
    retrievedAt: toIso(now.getTime()),
  };
}

/** Turns a validated sample manifest into a sequence with absolute image URLs. */
export function sequenceFromManifest(manifest: Manifest, manifestUrl: URL): Sequence {
  const resolve = (relativePath: string) => new URL(relativePath, manifestUrl).href;
  return {
    kind: manifest.kind,
    source: manifest.source,
    bbox: manifest.region.bbox,
    layerIds: manifest.layerIds,
    frames: manifest.frames.map((frame) => ({
      time: frame.time,
      images: Object.fromEntries(Object.entries(frame.images).map(([layerId, path]) => [layerId, resolve(path)])),
    })),
    overlayUrl: manifest.overlay ? resolve(manifest.overlay) : undefined,
    retrievedAt: manifest.generatedAt,
    note: manifest.note,
  };
}
