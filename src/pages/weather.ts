/**
 * Weather now page (/weather/): reads the weather warehouse snapshot and shows
 * summary tiles, a map of the capitals and a sortable table.
 */
import '@fontsource-variable/inter';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/weather.css';
import { LOCAL_TIME_ZONE } from '../config/app.ts';
import { formatAge } from '../data/freshness.ts';
import { loadSnapshot } from '../data/load-snapshot.ts';
import {
  assessSnapshotAge,
  countObserved,
  sortCapitals,
  type CapitalWeather,
  type SnapshotAge,
  type SortDirection,
  type SortKey,
  type WeatherSnapshot,
} from '../data/snapshot.ts';
import { t } from '../i18n/index.ts';
import { formatInZone } from '../ui/time-format.ts';
import { mountTopBar } from '../ui/topbar.ts';
import {
  formatCalendarDate,
  formatLocalTimeShort,
  formatMillimetres,
  formatTemperature,
  sparkline,
  stationName,
  temperatureColour,
} from '../ui/weather-format.ts';
import { createWeatherMap } from '../ui/weather-map.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id} in weather/index.html`);
  return element as T;
}

const elements = {
  status: byId<HTMLDivElement>('status'),
  body: byId<HTMLDivElement>('weather-body'),
  updated: byId<HTMLParagraphElement>('updated'),
  tiles: byId<HTMLUListElement>('tiles'),
  map: byId<HTMLDivElement>('weather-map'),
  inset: byId<HTMLDivElement>('canary-map'),
  rows: byId<HTMLTableSectionElement>('capital-rows'),
  legendBar: document.querySelector<HTMLElement>('.legend__bar'),
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function madrid(iso: string): string {
  return formatInZone(new Date(iso), LOCAL_TIME_ZONE);
}

/* Status --------------------------------------------------------------------- */

function renderStatus(kind: 'loading' | 'error' | 'stale' | 'outdated' | 'none', title = '', body = ''): void {
  const { status } = elements;
  status.className = `status status--${kind}`;
  status.replaceChildren();
  if (kind === 'none') return;
  status.append(el('strong', undefined, title));
  if (body) status.append(` ${body}`);
  if (kind === 'error') {
    const retry = el('button', 'button', t('errorRetry'));
    retry.type = 'button';
    retry.addEventListener('click', () => void start());
    status.append(' ', retry);
  }
}

function renderAgeStatus(age: SnapshotAge, skipped: number): void {
  const note = skipped > 0 ? ` ${t('weatherSkipped', { count: skipped })}` : '';
  const ageText = formatAge(age.ageMinutes);
  if (age.status === 'outdated') renderStatus('outdated', t('weatherOutdatedTitle'), t('weatherOutdatedBody', { age: ageText }) + note);
  else if (age.status === 'stale') renderStatus('stale', t('weatherStaleTitle'), t('weatherStaleBody', { age: ageText }) + note);
  else if (note) renderStatus('stale', '', note.trim());
  else renderStatus('none');
}

/* Summary tiles ------------------------------------------------------------------ */

function tile(label: string, value: string, note: string, accent = false): HTMLLIElement {
  const item = el('li', `tile panel${accent ? ' tile--accent' : ''}`);
  item.append(el('p', 'tile__label', label), el('p', 'tile__value', value), el('p', 'tile__note', note));
  return item;
}

function renderTiles(snapshot: WeatherSnapshot, age: SnapshotAge): void {
  const total = snapshot.capitals.length;
  const observed = countObserved(snapshot.capitals);
  const skill = snapshot.skill;
  const mae = skill?.temperatureMaeC.lead_1_6h ?? null;

  elements.tiles.replaceChildren(
    tile(t('weatherTileCapitals'), String(total), t('weatherTileCapitalsNote')),
    tile(t('weatherTileObserved'), `${observed} / ${total}`, t('weatherTileObservedNote')),
    tile(
      t('weatherTileSkill'),
      mae === null ? '—' : `${mae.toFixed(2)} °C`,
      skill && mae !== null
        ? t('weatherTileSkillNote', { date: formatCalendarDate(skill.date), count: skill.capitals })
        : t('weatherTileSkillMissing'),
      true,
    ),
    tile(t('weatherTileAge'), formatAge(age.ageMinutes), t('weatherTileAgeNote', { time: madrid(snapshot.generatedAt) })),
  );
}

/* Table -------------------------------------------------------------------------- */

function sparklineSvg(values: (number | null)[]): Element {
  const width = 104;
  const height = 30;
  const line = sparkline(values, width, height, 3);
  if (line.segments.length === 0) return el('span', 'muted', t('weatherSparklineMissing'));

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('class', 'spark');
  svg.setAttribute('role', 'img');
  const label = t('weatherSparklineLabel', { min: formatTemperature(line.min, 0), max: formatTemperature(line.max, 0) });
  svg.setAttribute('aria-label', label);
  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = label;
  svg.append(title);
  for (const points of line.segments) {
    const polyline = document.createElementNS(SVG_NS, 'polyline');
    polyline.setAttribute('points', points);
    svg.append(polyline);
  }
  return svg;
}

function capitalRow(capital: CapitalWeather, reference: Date): HTMLTableRowElement {
  const row = el('tr');
  row.id = `capital-${capital.id}`;

  const name = el('th');
  name.scope = 'row';
  name.textContent = capital.name;

  const forecast = el('td', 'num');
  const chip = el('span', 'temp-chip', formatTemperature(capital.temperatureC));
  if (capital.temperatureC !== null) chip.style.setProperty('--chip', temperatureColour(capital.temperatureC));
  forecast.append(chip);

  const spark = el('td', 'spark-cell');
  spark.append(sparklineSvg(capital.next24hTemperatureC));

  const rain = el('td', 'num', formatMillimetres(capital.precipitation24hMm));
  if ((capital.precipitation24hMm ?? 0) >= 1) rain.classList.add('rain--wet');

  const observed = el('td', 'obs');
  if (capital.observed) {
    observed.append(
      el('span', 'obs__temp', formatTemperature(capital.observed.temperatureC)),
      el(
        'span',
        'obs__meta',
        `${stationName(capital.observed.station)} · ${formatLocalTimeShort(new Date(capital.observed.observedAt), reference, LOCAL_TIME_ZONE)}`,
      ),
    );
  } else {
    observed.append(el('span', 'muted', t('weatherNoObservation')));
  }

  row.append(name, forecast, spark, rain, observed);
  return row;
}

class CapitalTable {
  private key: SortKey = 'name';
  private direction: SortDirection = 'ascending';
  private readonly capitals: readonly CapitalWeather[];
  private readonly reference: Date;
  private readonly headers: HTMLTableCellElement[];

  constructor(capitals: readonly CapitalWeather[], reference: Date) {
    this.capitals = capitals;
    this.reference = reference;
    this.headers = [...document.querySelectorAll<HTMLTableCellElement>('th[data-sort]')];
    for (const header of this.headers) {
      const key = header.dataset.sort as SortKey;
      // Wrap the heading text in a button once, so it can be sorted by keyboard.
      if (!header.querySelector('button')) {
        const button = el('button', 'sort-button', header.textContent ?? '');
        button.type = 'button';
        button.append(el('span', 'sort-button__arrow'));
        button.setAttribute('aria-label', t('weatherSortBy', { column: header.textContent ?? '' }));
        header.replaceChildren(button);
      }
      header.querySelector('button')!.addEventListener('click', () => this.sortBy(key));
    }
    this.render();
  }

  private sortBy(key: SortKey): void {
    if (this.key === key) this.direction = this.direction === 'ascending' ? 'descending' : 'ascending';
    else {
      this.key = key;
      // Names read A→Z first; numbers are most interesting highest first.
      this.direction = key === 'name' ? 'ascending' : 'descending';
    }
    this.render();
  }

  render(): void {
    for (const header of this.headers) {
      if (header.dataset.sort === this.key) header.setAttribute('aria-sort', this.direction);
      else header.removeAttribute('aria-sort');
    }
    const sorted = sortCapitals(this.capitals, this.key, this.direction);
    elements.rows.replaceChildren(...sorted.map((capital) => capitalRow(capital, this.reference)));
  }
}

function highlightRow(id: string): void {
  const row = document.getElementById(`capital-${id}`);
  if (!row) return;
  document.querySelectorAll('tr.is-selected').forEach((other) => other.classList.remove('is-selected'));
  row.classList.add('is-selected');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  row.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
}

/* Page ------------------------------------------------------------------------------- */

function renderLegend(): void {
  if (!elements.legendBar) return;
  const stops = [0, 5, 10, 15, 20, 25, 30, 35].map((value, index, all) => `${temperatureColour(value)} ${(index / (all.length - 1)) * 100}%`);
  elements.legendBar.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
}

let started = false;

async function start(): Promise<void> {
  if (started) return;
  renderStatus('loading', t('weatherLoading'));
  let snapshot: WeatherSnapshot;
  try {
    snapshot = await loadSnapshot();
  } catch (error) {
    elements.body.hidden = true;
    const reason = error instanceof Error ? error.message : String(error);
    renderStatus('error', t('weatherErrorTitle'), t('weatherErrorBody', { reason }));
    return;
  }
  started = true;

  const now = new Date();
  const age = assessSnapshotAge(snapshot, now);
  renderAgeStatus(age, snapshot.skipped);
  elements.updated.textContent = t('weatherUpdated', {
    time: madrid(snapshot.generatedAt),
    age: formatAge(age.ageMinutes),
    issued: madrid(snapshot.forecastIssuedAt),
  });
  renderTiles(snapshot, age);
  elements.body.hidden = false;

  new CapitalTable(snapshot.capitals, new Date(snapshot.generatedAt));
  renderLegend();
  createWeatherMap(elements.map, elements.inset, snapshot.capitals, highlightRow);
}

mountTopBar('weather');
void start();
