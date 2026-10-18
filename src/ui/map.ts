import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Sequence } from '../data/sequence.ts';
import { t } from '../i18n/index.ts';

/**
 * Leaflet map in plain latitude/longitude (EPSG:4326), matching the WMS crops
 * exactly. No base-map tiles: the satellite image is the map, and coastlines
 * come from the overlay image, so no third-party tile server is involved.
 */
export interface SatelliteMap {
  showImage(url: string): void;
}

export function createSatelliteMap(
  container: HTMLElement,
  sequence: Sequence,
  cursorOutput: HTMLOutputElement,
): SatelliteMap {
  const { west, south, east, north } = sequence.bbox;
  const bounds = L.latLngBounds([south, west], [north, east]);

  const map = L.map(container, {
    crs: L.CRS.EPSG4326,
    maxBounds: bounds.pad(0.15),
    maxBoundsViscosity: 0.8,
    // No snapping, so the region fills the box exactly at any screen width.
    zoomSnap: 0,
    zoomDelta: 0.5,
    attributionControl: true,
    keyboard: true,
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.fitBounds(bounds);
  map.setMinZoom(map.getZoom() - 0.5);
  map.setMaxZoom(map.getZoom() + 3);

  const image = L.imageOverlay('', bounds, {
    alt: '',
    attribution: `${sequence.source.attribution} · ${sequence.source.licence}`,
  }).addTo(map);

  if (sequence.overlayUrl) {
    L.imageOverlay(sequence.overlayUrl, bounds, { alt: '', interactive: false, zIndex: 2 }).addTo(map);
  }

  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  // Coordinates under the pointer help relate features to places.
  map.on('mousemove', (event: L.LeafletMouseEvent) => {
    const { lat, lng } = event.latlng;
    cursorOutput.value = `${t('cursor')}: ${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;
  });
  map.on('mouseout', () => {
    cursorOutput.value = '';
  });

  // The container size can change (e.g. phone rotation); keep the image framed.
  new ResizeObserver(() => map.invalidateSize()).observe(container);

  return {
    showImage(url: string) {
      image.setUrl(url);
    },
  };
}
