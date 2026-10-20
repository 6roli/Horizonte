import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CANARY_INSET, REGION, WEATHER_ATTRIBUTION, WEATHER_VIEW, type Bbox } from '../config/app.ts';
import { LIVE_OVERLAY_URL } from '../data/load.ts';
import type { CapitalWeather } from '../data/snapshot.ts';
import { formatTemperature, temperatureColour } from './weather-format.ts';

/**
 * Map of the provincial capitals with their forecast temperature, built like
 * the satellite viewer's map: Leaflet in plain latitude/longitude (EPSG:4326),
 * no third-party tiles, and the bundled Natural Earth coastline image as the
 * only base layer. The Canary Islands, outside the main region, get an inset.
 */

const CANARY_OVERLAY_URL = '/overlay/coastlines-canarias-520.png';
const COASTLINE_ATTRIBUTION = 'Coastlines: Natural Earth via EUMETView';

function boundsOf(bbox: Bbox): L.LatLngBounds {
  return L.latLngBounds([bbox.south, bbox.west], [bbox.north, bbox.east]);
}

function inBounds(capital: CapitalWeather, bbox: Bbox): boolean {
  return capital.lat >= bbox.south && capital.lat <= bbox.north && capital.lon >= bbox.west && capital.lon <= bbox.east;
}

function markerFor(capital: CapitalWeather, onSelect: (id: string) => void): L.Marker {
  const label = document.createElement('span');
  label.className = 'temp-marker__label';
  const value = capital.temperatureC;
  label.textContent = value === null ? '—' : `${Math.round(value)}°`;
  if (value !== null) label.style.background = temperatureColour(value);

  const marker = L.marker([capital.lat, capital.lon], {
    icon: L.divIcon({ className: 'temp-marker', html: label, iconSize: undefined }),
    title: `${capital.name}: ${formatTemperature(value)}`,
    alt: `${capital.name}: ${formatTemperature(value)}`,
    riseOnHover: true,
    keyboard: true,
  });

  const tooltip = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = capital.name;
  tooltip.append(name, document.createElement('br'), `Forecast now: ${formatTemperature(value)}`);
  if (capital.observed?.temperatureC != null) {
    tooltip.append(document.createElement('br'), `Observed: ${formatTemperature(capital.observed.temperatureC)}`);
  }
  marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -12], className: 'temp-tooltip' });
  marker.on('click keypress', () => onSelect(capital.id));
  return marker;
}

function baseMap(container: HTMLElement, bbox: Bbox, overlayUrl: string, interactive: boolean, view: Bbox = bbox): L.Map {
  const bounds = boundsOf(bbox);
  const viewBounds = boundsOf(view);
  const map = L.map(container, {
    crs: L.CRS.EPSG4326,
    zoomSnap: 0,
    zoomDelta: 0.5,
    attributionControl: interactive,
    zoomControl: interactive,
    dragging: interactive,
    scrollWheelZoom: false,
    doubleClickZoom: interactive,
    touchZoom: interactive,
    boxZoom: false,
    keyboard: interactive,
    maxBounds: bounds.pad(0.15),
    maxBoundsViscosity: 0.8,
  });
  map.fitBounds(viewBounds);
  L.imageOverlay(overlayUrl, bounds, { alt: '', interactive: false, opacity: 0.55 }).addTo(map);
  // Keep the map sized to its box (e.g. phone rotation); the fixed inset is also re-framed.
  new ResizeObserver(() => {
    map.invalidateSize();
    if (!interactive) map.fitBounds(viewBounds);
  }).observe(container);
  return map;
}

export function createWeatherMap(
  container: HTMLElement,
  insetContainer: HTMLElement,
  capitals: readonly CapitalWeather[],
  onSelect: (id: string) => void,
): void {
  const main = baseMap(container, REGION.bbox, LIVE_OVERLAY_URL, true, WEATHER_VIEW);
  main.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  main.attributionControl.addAttribution(`${WEATHER_ATTRIBUTION} ${COASTLINE_ATTRIBUTION}`);
  main.setMinZoom(main.getZoom() - 0.5);
  main.setMaxZoom(main.getZoom() + 3);
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(main);

  const canaries = capitals.filter((capital) => inBounds(capital, CANARY_INSET.bbox));
  insetContainer.hidden = canaries.length === 0;
  const inset = canaries.length > 0 ? baseMap(insetContainer, CANARY_INSET.bbox, CANARY_OVERLAY_URL, false) : undefined;

  for (const capital of capitals) {
    if (inset && inBounds(capital, CANARY_INSET.bbox)) markerFor(capital, onSelect).addTo(inset);
    else if (inBounds(capital, REGION.bbox)) markerFor(capital, onSelect).addTo(main);
  }
}
