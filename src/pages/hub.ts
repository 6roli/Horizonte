/**
 * Hub home page (/): one card per module listed in src/config/modules.ts.
 */
import '@fontsource-variable/inter';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/hub.css';
import { HUB_MODULES, type HubModule } from '../config/modules.ts';
import { t } from '../i18n/index.ts';
import { mountTopBar } from '../ui/topbar.ts';

function moduleCard(module: HubModule): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'module-card panel';

  const preview = document.createElement('div');
  preview.className = 'module-card__preview';
  const image = document.createElement('img');
  image.src = module.preview;
  image.alt = '';
  image.width = 1200;
  image.height = 550;
  image.loading = 'lazy';
  image.decoding = 'async';
  preview.append(image);

  const body = document.createElement('div');
  body.className = 'module-card__body';

  const title = document.createElement('h3');
  const link = document.createElement('a');
  link.href = module.path;
  link.className = 'module-card__link';
  link.textContent = module.title;
  title.append(link);

  const summary = document.createElement('p');
  summary.textContent = module.summary;

  const tags = document.createElement('ul');
  tags.className = 'tag-list';
  for (const text of module.tags) {
    const tag = document.createElement('li');
    tag.className = 'tag';
    tag.textContent = text;
    tags.append(tag);
  }

  const source = document.createElement('p');
  source.className = 'module-card__source';
  source.textContent = t('hubData', { source: module.dataSource });

  const open = document.createElement('span');
  open.className = 'module-card__open';
  open.setAttribute('aria-hidden', 'true');
  open.textContent = t('hubOpen');

  body.append(title, summary, tags, source, open);
  item.append(preview, body);
  return item;
}

mountTopBar();
document.getElementById('module-list')?.replaceChildren(...HUB_MODULES.map(moduleCard));
