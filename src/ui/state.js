// Settings cache + theme. Persistent via the settings store.
import { settingsStore } from '../core/db.js';
import { seedCategories } from '../core/categories.js';

export const settings = { theme: 'system', targets: {}, categories: seedCategories(), profile: {} };

export async function loadSettings() {
  const all = await settingsStore.all();
  settings.theme = all.theme || 'system';
  settings.targets = all.targets || {};
  settings.profile = all.profile || {};
  settings.categories = all.categories || seedCategories();
  applyTheme();
  return settings;
}
export async function saveSetting(key, value) { settings[key] = value; await settingsStore.set(key, value); if (key === 'theme') applyTheme(); }

export function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme; else delete root.dataset.theme;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#00203f' : '#00345c');
}
export const activeCategories = kind => settings.categories[kind].filter(c => !c.archived);
export const categoryLabel = (kind, id) => settings.categories[kind].find(c => c.id === id)?.label || id;
