// App shell: header, bottom navigation, hash router.
import { h, icon, clear, toast, mount } from './dom.js';
import { loadSettings } from './state.js';
import { openDB } from '../core/db.js';
import logoUrl from '../../assets/logo-white.png';
import { practiceList, practiceEditor, practiceStats } from './practice.js';
import { writingHome, writingEditor, writingStats } from './writing.js';
import { speakingList, speakingEditor, speakingStats } from './speaking.js';
import { statsView } from './stats-view.js';
import { settingsView } from './settings.js';

export const TABS = [
  { id: 'listening', label: 'Listening', icon: 'headphones', path: '/listening' },
  { id: 'reading', label: 'Reading', icon: 'book', path: '/reading' },
  { id: 'writing', label: 'Writing', icon: 'pen', path: '/writing' },
  { id: 'speaking', label: 'Speaking', icon: 'mic', path: '/speaking' },
  { id: 'stats', label: 'Statistics', aria: 'General Statistics', icon: 'chart', path: '/stats' },
];

import { go, goBack } from './nav.js';
export { go, goBack };

const routes = [
  [/^\/(listening|reading)$/, 'listening', practiceList],
  [/^\/(listening|reading)\/stats$/, 'listening', practiceStats],
  [/^\/(listening|reading)\/([\w-]+)$/, 'listening', practiceEditor],
  [/^\/writing$/, 'writing', writingHome],
  [/^\/writing\/stats$/, 'writing', writingStats],
  [/^\/writing\/(1|2)\/([\w-]+)$/, 'writing', writingEditor],
  [/^\/speaking$/, 'speaking', speakingList],
  [/^\/speaking\/stats$/, 'speaking', speakingStats],
  [/^\/speaking\/([\w-]+)$/, 'speaking', speakingEditor],
  [/^\/stats$/, 'stats', statsView],
  [/^\/settings(?:\/(\w+))?$/, 'settings', settingsView],
];

export function startApp(container) {
  const titleEl = h('h1', { id: 'title' }, 'IELTS Tracker');
  const actions = h('div', { class: 'actions' });
  const backBtn = h('button', { class: 'icon-btn back', 'aria-label': 'Back', hidden: true, onclick: () => goBack('/listening') }, icon('back'));
  const header = h('header', { class: 'appbar' }, backBtn, h('img', { class: 'logo', src: logoUrl, alt: '', width: 32, height: 32 }), titleEl, actions);
  const view = h('main', { id: 'view', tabindex: '-1' });
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Main sections' }, TABS.map(t =>
    h('a', { href: '#' + t.path, 'data-tab': t.id, 'aria-label': t.aria || t.label }, icon(t.icon, 24), h('span', {}, t.label))));
  mount(clear(container), header, view, nav);

  const shell = {
    root: view,
    setHeader({ title, back = false, actions: acts = [], settingsBtn = true }) {
      titleEl.textContent = title; document.title = title + ' · IELTS Tracker';
      backBtn.hidden = !back;
      mount(clear(actions), ...acts, ...(settingsBtn ? [h('button', { class: 'icon-btn', 'aria-label': 'Settings', onclick: () => go('/settings') }, icon('gear'))] : []));
    },
  };

  let cleanup = null, token = 0;
  async function render() {
    const my = ++token;
    if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
    const path = (location.hash || '#/listening').slice(1) || '/listening';
    const hit = routes.map(([re, tab, fn]) => [re.exec(path), tab, fn]).find(([m]) => m);
    const [match, tab, fn] = hit || [null, 'listening', routes[0][2]];
    const params = match ? match.slice(1) : ['listening'];
    nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.dataset.tab === (tab === 'settings' ? '' : tab)));
    const root = h('div', { class: 'screen' });
    try {
      const out = await fn({ root, params, shell, path });
      if (my !== token) { if (typeof out === 'function') out(); return; }
      cleanup = typeof out === 'function' ? out : null;
    } catch (e) {
      console.error(e);
      mount(clear(root), h('div', { class: 'card error' }, h('h2', {}, 'Something went wrong'), h('p', {}, String(e.message || e))));
      shell.setHeader({ title: 'Error', back: true });
    }
    if (my === token) { mount(clear(view), root); view.scrollTop = 0; window.scrollTo?.(0, 0); }
  }
  window.addEventListener('hashchange', render);

  (async () => {
    try { await openDB(); await loadSettings(); navigator.storage?.persist?.().catch(() => {}); }
    catch (e) { mount(clear(view), h('div', { class: 'card error' }, h('h2', {}, 'Storage unavailable'), h('p', {}, 'The app cannot open its local database: ' + e.message))); return; }
    if (!location.hash) location.hash = '/listening'; else render();
  })();
  return { render };
}

