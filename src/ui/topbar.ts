import { APP_NAME, PORTFOLIO_PROJECT_URL, PORTFOLIO_URL } from '../config/app.ts';
import { HUB_MODULES } from '../config/modules.ts';
import { t } from '../i18n/index.ts';

/**
 * Fills the shared top bar (<header id="topbar">) of every page: the Horizonte
 * name (links to the hub), the module navigation and a link back to the
 * portfolio. Also points footer links marked data-portfolio-link at the portfolio.
 *
 * @param activeId id of the current module, or undefined on the hub itself.
 */
export function mountTopBar(activeId?: string): void {
  const header = document.getElementById('topbar');
  if (header) {
    const inner = document.createElement('div');
    inner.className = 'container topbar__inner';

    const brand = document.createElement('a');
    brand.className = 'brand';
    brand.href = '/';
    if (!activeId) brand.setAttribute('aria-current', 'page');
    const mark = document.createElement('span');
    mark.className = 'brand__mark';
    mark.setAttribute('aria-hidden', 'true');
    brand.append(mark, APP_NAME);

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', t('modulesNav'));
    const list = document.createElement('ul');
    list.className = 'topbar__nav';
    for (const module of HUB_MODULES) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = module.path;
      link.textContent = module.navLabel;
      if (module.id === activeId) link.setAttribute('aria-current', 'page');
      item.append(link);
      list.append(item);
    }
    nav.append(list);

    const back = document.createElement('a');
    back.className = 'button button--ghost topbar__back';
    back.href = PORTFOLIO_PROJECT_URL;
    back.textContent = `← ${t('backToPortfolio')}`;

    inner.append(brand, nav, back);
    header.replaceChildren(inner);
  }

  document.querySelectorAll<HTMLAnchorElement>('a[data-portfolio-link]').forEach((link) => {
    link.href = PORTFOLIO_URL;
  });
  document.querySelectorAll<HTMLElement>('[data-app-name]').forEach((element) => {
    element.textContent = APP_NAME;
  });
}
