/**
 * Entry point: wires data loading, the map and the controls together.
 * Data access lives in src/data, presentation helpers in src/ui.
 */
import './styles/tokens.css';
import './styles/app.css';
import {
  APP_NAME,
  DEFAULT_LAYER_ID,
  LAYERS,
  LOCAL_TIME_ZONE,
  PORTFOLIO_LABEL,
  PORTFOLIO_URL,
  type InformationKind,
  type LayerDefinition,
} from './config/app.ts';
import { assessFreshness, formatAge, type FreshnessReport } from './data/freshness.ts';
import { loadSequence, resolveImageUrl, type LoadedSequence } from './data/load.ts';
import { ImagePreloader } from './data/preload.ts';
import { t } from './i18n/index.ts';
import type { StringKey } from './i18n/en.ts';
import { createSatelliteMap, type SatelliteMap } from './ui/map.ts';
import { clampIndex, nextPlayableIndex, previousPlayableIndex, SPEEDS, type Speed } from './ui/playback.ts';
import { formatInZone, formatUtc, sameOffset, viewerTimeZone } from './ui/time-format.ts';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id} in index.html`);
  return element as T;
}

const elements = {
  status: byId<HTMLDivElement>('status'),
  viewer: byId<HTMLDivElement>('viewer-body'),
  map: byId<HTMLDivElement>('map'),
  cursor: byId<HTMLOutputElement>('cursor'),
  timeUtc: byId<HTMLParagraphElement>('time-utc'),
  timeLocal: byId<HTMLParagraphElement>('time-local'),
  timeViewer: byId<HTMLParagraphElement>('time-viewer'),
  kindBadge: byId<HTMLParagraphElement>('kind-badge'),
  frameWarning: byId<HTMLParagraphElement>('frame-warning'),
  frameCount: byId<HTMLParagraphElement>('frame-count'),
  play: byId<HTMLButtonElement>('play-button'),
  prev: byId<HTMLButtonElement>('prev-button'),
  next: byId<HTMLButtonElement>('next-button'),
  timeline: byId<HTMLInputElement>('timeline'),
  speed: byId<HTMLSelectElement>('speed'),
  layerOptions: byId<HTMLDivElement>('layer-options'),
  layerTitle: byId<HTMLHeadingElement>('layer-title'),
  layerExplanation: byId<HTMLParagraphElement>('layer-explanation'),
  layerCaveat: byId<HTMLParagraphElement>('layer-caveat'),
  sourceFacts: byId<HTMLDListElement>('source-facts'),
  attribution: byId<HTMLParagraphElement>('attribution'),
};

const KIND_LABELS: Record<InformationKind, StringKey> = {
  observation: 'kindObservation',
  estimate: 'kindEstimate',
  forecast: 'kindForecast',
};

/** Fills static text marked with data-text and the centralised app name. */
function applyStaticText(): void {
  document.querySelectorAll<HTMLElement>('[data-text]').forEach((element) => {
    element.textContent = t(element.dataset.text as StringKey);
  });
  document.querySelectorAll<HTMLElement>('[data-app-name]').forEach((element) => {
    element.textContent = APP_NAME;
  });
  for (const id of ['portfolio-link', 'portfolio-footer-link']) {
    const link = byId<HTMLAnchorElement>(id);
    link.href = PORTFOLIO_URL;
  }
  byId<HTMLAnchorElement>('portfolio-link').setAttribute('aria-label', PORTFOLIO_LABEL);
  elements.prev.setAttribute('aria-label', t('previous'));
  elements.next.setAttribute('aria-label', t('next'));
  elements.prev.title = t('previous');
  elements.next.title = t('next');
}

function renderStatus(kind: 'loading' | 'error' | 'sample' | 'stale' | 'outdated' | 'none', message = ''): void {
  const { status } = elements;
  status.className = `status status--${kind}`;
  status.replaceChildren();
  if (kind === 'none') return;

  const titles: Partial<Record<typeof kind, string>> = {
    loading: t('loading'),
    error: t('errorTitle'),
    sample: t('sampleTitle'),
    stale: t('staleTitle'),
    outdated: t('outdatedTitle'),
  };
  const strong = document.createElement('strong');
  strong.textContent = titles[kind] ?? '';
  status.append(strong);
  if (message) status.append(` ${message}`);

  if (kind === 'error') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'button';
    retry.textContent = t('errorRetry');
    retry.addEventListener('click', () => void start());
    status.append(' ', retry);
  }
}

function renderFreshness(sequence: LoadedSequence, report: FreshnessReport): void {
  const age = formatAge(report.ageMinutes);
  switch (report.status) {
    case 'sample': {
      const reason = sequence.liveProblem ? ` ${t('sampleReason')}: ${sequence.liveProblem}.` : '';
      renderStatus('sample', `${t('sampleBody')}${reason} ${sequence.manifest.note ?? ''}`.trim());
      break;
    }
    case 'stale':
      renderStatus('stale', t('staleBody', { age }));
      break;
    case 'outdated':
      renderStatus('outdated', t('outdatedBody', { age }));
      break;
    case 'fresh':
      renderStatus('none');
      break;
  }
}

function addFact(list: HTMLDListElement, term: string, value: string | Node): void {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.append(value);
  list.append(dt, dd);
}

function renderSource(sequence: LoadedSequence, layer: LayerDefinition, report: FreshnessReport): void {
  const { manifest } = sequence;
  const list = elements.sourceFacts;
  list.replaceChildren();
  addFact(list, t('satellite'), layer.satellite);
  addFact(list, t('instrument'), layer.instrument);
  addFact(list, t('product'), layer.product);
  const serviceLink = document.createElement('a');
  serviceLink.href = 'https://view.eumetsat.int';
  serviceLink.textContent = `${manifest.source.provider} — ${manifest.source.service}`;
  addFact(list, t('service'), serviceLink);
  addFact(list, t('licence'), `${manifest.source.licence}. ${manifest.source.attribution}.`);
  const kindLabel = manifest.kind === 'live' ? t('sequenceKindLive') : t('sequenceKindSample');
  addFact(
    list,
    t('lastUpdate'),
    `${formatUtc(new Date(manifest.generatedAt))} · ${kindLabel}` +
      (manifest.kind === 'live' ? ` · ${t('age', { age: formatAge(report.ageMinutes) })}` : ''),
  );
  elements.attribution.textContent = `${manifest.source.attribution}. ${manifest.source.licence}.`;
}

function renderLayerInfo(layer: LayerDefinition, isSample: boolean): void {
  elements.layerTitle.textContent = layer.title;
  elements.layerExplanation.textContent = layer.explanation;
  elements.layerCaveat.hidden = !layer.caveat;
  elements.layerCaveat.textContent = layer.caveat ?? '';
  const kind = t(KIND_LABELS[layer.kind]);
  elements.kindBadge.textContent = isSample ? `${kind} · ${t('sequenceKindSample')}` : kind;
  elements.kindBadge.classList.toggle('kind-badge--sample', isSample);
}

/** Holds the viewer state for the loaded sequence. */
class Viewer {
  private index: number;
  private layer: LayerDefinition;
  private timer: number | undefined;
  private speed: Speed = 'normal';
  private readonly preloader = new ImagePreloader();
  private readonly map: SatelliteMap;
  private readonly sequence: LoadedSequence;
  private readonly report: FreshnessReport;

  constructor(sequence: LoadedSequence, report: FreshnessReport) {
    this.sequence = sequence;
    this.report = report;
    const { manifest } = sequence;
    const available = LAYERS.filter((layer) => manifest.layerIds.includes(layer.id));
    this.layer = available.find((layer) => layer.id === DEFAULT_LAYER_ID) ?? available[0];
    this.index = manifest.frames.length - 1; // start on the newest observation

    const overlayUrl = manifest.overlay ? resolveImageUrl(sequence, manifest.overlay) : undefined;
    this.map = createSatelliteMap(elements.map, manifest, overlayUrl, elements.cursor);
    elements.map.setAttribute('aria-label', t('mapLabel'));

    this.buildLayerOptions(available);
    this.bindControls();
    this.preloadLayer();
    this.render();
  }

  private get frames() {
    return this.sequence.manifest.frames;
  }

  private imageUrl(index: number): string {
    return resolveImageUrl(this.sequence, this.frames[index].images[this.layer.id]);
  }

  private isUnavailable = (index: number): boolean => this.preloader.statusOf(this.imageUrl(index)) === 'failed';

  private buildLayerOptions(layers: LayerDefinition[]): void {
    elements.layerOptions.replaceChildren(
      ...layers.map((layer) => {
        const label = document.createElement('label');
        label.className = 'layer-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'layer';
        input.value = layer.id;
        input.checked = layer.id === this.layer.id;
        input.addEventListener('change', () => this.selectLayer(layer));
        label.append(input, ` ${layer.title}`);
        return label;
      }),
    );
  }

  private bindControls(): void {
    const { timeline, play, prev, next, speed } = elements;
    timeline.max = String(this.frames.length - 1);
    timeline.addEventListener('input', () => {
      this.pause();
      this.goTo(clampIndex(Number(timeline.value), this.frames.length));
    });
    play.addEventListener('click', () => (this.timer === undefined ? this.play() : this.pause()));
    prev.addEventListener('click', () => {
      this.pause();
      this.goTo(previousPlayableIndex(this.index, this.frames.length, this.isUnavailable));
    });
    next.addEventListener('click', () => {
      this.pause();
      this.goTo(nextPlayableIndex(this.index, this.frames.length, this.isUnavailable));
    });
    speed.addEventListener('change', () => {
      this.speed = (speed.value in SPEEDS ? speed.value : 'normal') as Speed;
      if (this.timer !== undefined) {
        this.pause();
        this.play();
      }
    });
    // Pause when the tab is hidden: no point animating for nobody.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
  }

  private selectLayer(layer: LayerDefinition): void {
    this.layer = layer;
    this.preloadLayer();
    this.render();
  }

  /** Loads the newest frame first, then the rest, and re-renders on failures. */
  private preloadLayer(): void {
    const order = this.frames.map((_, index) => index).reverse();
    for (const index of order) {
      void this.preloader.load(this.imageUrl(index)).then((status) => {
        if (status === 'failed' && index === this.index) this.render();
      });
    }
  }

  private goTo(index: number): void {
    this.index = index;
    this.render();
  }

  private play(): void {
    if (this.timer !== undefined) return;
    this.timer = window.setInterval(() => {
      this.goTo(nextPlayableIndex(this.index, this.frames.length, this.isUnavailable));
    }, SPEEDS[this.speed]);
    this.renderPlayButton();
  }

  private pause(): void {
    if (this.timer === undefined) return;
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.renderPlayButton();
  }

  private renderPlayButton(): void {
    const playing = this.timer !== undefined;
    elements.play.textContent = playing ? `❚❚ ${t('pause')}` : `▶ ${t('play')}`;
    elements.play.setAttribute('aria-pressed', String(playing));
    // While playing, stop announcing every frame to screen readers.
    elements.timeUtc.setAttribute('aria-live', playing ? 'off' : 'polite');
  }

  private render(): void {
    const frame = this.frames[this.index];
    const time = new Date(frame.time);
    const url = this.imageUrl(this.index);

    this.map.showImage(url);
    elements.frameWarning.hidden = this.preloader.statusOf(url) !== 'failed';
    elements.frameWarning.textContent = t('frameUnavailable');

    elements.timeUtc.textContent = formatUtc(time);
    elements.timeLocal.textContent = `${formatInZone(time, LOCAL_TIME_ZONE)} · ${t('localTimeLabel')}`;
    const viewerZone = viewerTimeZone();
    const showViewerZone = !sameOffset(time, viewerZone, LOCAL_TIME_ZONE) && !sameOffset(time, viewerZone, 'UTC');
    elements.timeViewer.hidden = !showViewerZone;
    if (showViewerZone) elements.timeViewer.textContent = `${formatInZone(time, viewerZone)} · ${t('yourTimeLabel')}`;

    elements.timeline.value = String(this.index);
    elements.timeline.setAttribute('aria-valuetext', formatUtc(time));
    elements.frameCount.textContent = t('frameOf', { current: this.index + 1, total: this.frames.length });

    renderLayerInfo(this.layer, this.sequence.manifest.kind === 'sample');
    renderSource(this.sequence, this.layer, this.report);
    this.renderPlayButton();
  }
}

let viewer: Viewer | undefined;

async function start(): Promise<void> {
  if (viewer) return;
  renderStatus('loading');
  try {
    const sequence = await loadSequence();
    const report = assessFreshness(sequence.manifest, new Date());
    renderFreshness(sequence, report);
    elements.viewer.hidden = false;
    viewer = new Viewer(sequence, report);
  } catch (error) {
    elements.viewer.hidden = true;
    renderStatus('error', error instanceof Error ? error.message : String(error));
  }
}

applyStaticText();
void start();
