// Tiny DOM helpers: element builder, icons, toasts, dialogs.
const ATTR_ONLY = new Set(['list', 'form', 'inputmode', 'role']);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'for') el.htmlFor = v;
    else if (ATTR_ONLY.has(k) || k.startsWith('aria-') || k.startsWith('data-')) el.setAttribute(k, v === true ? '' : v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c.nodeType ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return el;
}

/** Append children, skipping null/false and flattening arrays (plain .append() would print "null"). */
export const mount = (el, ...kids) => {
  const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c.nodeType ? c : document.createTextNode(String(c))); };
  kids.forEach(add); return el;
};
export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

const P = {
  headphones: '<path d="M4 16v-4a8 8 0 0116 0v4"/><rect x="3" y="14" width="4" height="7" rx="1.6"/><rect x="17" y="14" width="4" height="7" rx="1.6"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 016.5 2H20v17H6.5A2.5 2.5 0 004 21.5z"/><path d="M4 21.5V4.5M8 7h8M8 11h6"/>',
  pen: '<path d="M4 20l1.2-4.4L16.6 4.2a2 2 0 013 0l.2.2a2 2 0 010 2.9L8.4 18.8z"/><path d="M14.5 6.3l3.2 3.2"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  chart: '<path d="M4 4v16h16"/><path d="M8 15l4-5 3 3 5-7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 5l-7 7 7 7"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20l1.2-4.4L16.6 4.2a2 2 0 013 0l.2.2a2 2 0 010 2.9L8.4 18.8z"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>', rec: '<circle cx="12" cy="12" r="6" fill="currentColor"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>', camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  clip: '<path d="M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.3 3.3 0 014.7 4.7L9.2 17.2a1.7 1.7 0 01-2.4-2.4L14.5 7"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>', warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>', flat: '<path d="M5 12h14"/>', target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>',
};
export const icon = (name, size = 24) => {
  const s = document.createElement('span');
  s.className = 'ico'; s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return s;
};

export const chip = (text, cls = '') => h('span', { class: 'chip ' + cls }, text);

let toastTimer;
export function toast(msg, kind = '') {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.className = 'toast show ' + kind; t.textContent = msg;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, kind === 'error' ? 6000 : 3200);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = (v) => { overlay.remove(); document.body.classList.remove('noscroll'); onClose && onClose(v); };
  const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog', onclick: e => { if (e.target === overlay && !actions.length) close(); } },
    h('div', { class: 'dialog' + (wide ? ' wide' : '') }, title ? h('h2', {}, title) : null, h('div', { class: 'dialog-body' }, body),
      actions.length ? h('div', { class: 'dialog-actions' }, actions.map(a => h('button', { class: 'btn ' + (a.class || ''), onclick: () => a.onClick ? a.onClick(close) : close(a.value) }, a.label))) : null));
  document.body.append(overlay); document.body.classList.add('noscroll');
  return { close, overlay };
}

export function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise(res => modal({ title, body: typeof message === 'string' ? h('p', {}, message) : message,
    actions: [{ label: cancelText, value: false, class: 'ghost' }, { label: confirmText, value: true, class: danger ? 'danger' : 'primary' }], onClose: res }));
}
export function alertDialog(title, message) {
  return new Promise(res => modal({ title, body: typeof message === 'string' ? h('p', {}, message) : message, actions: [{ label: 'OK', value: true, class: 'primary' }], onClose: res }));
}
export function promptTyped({ title, message, word }) {
  return new Promise(res => {
    const input = h('input', { type: 'text', autocomplete: 'off', 'aria-label': `Type ${word} to confirm` });
    const m = modal({ title, body: h('div', {}, h('p', {}, message), h('p', {}, 'Type ', h('b', {}, word), ' to confirm:'), input),
      actions: [{ label: 'Cancel', value: false, class: 'ghost' }, { label: 'Delete everything', class: 'danger', onClick: close => (input.value.trim() === word ? close(true) : input.focus()) }], onClose: res });
    setTimeout(() => input.focus(), 50);
  });
}

export const field = (label, control, hint, id) => {
  const fid = id || 'f' + Math.random().toString(36).slice(2, 8);
  if (control.setAttribute && !control.id) control.id = fid;
  return h('div', { class: 'field' }, h('label', { for: control.id || fid }, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
};
export const bandSelect = (value, onChange, { disabled = false, label = 'Band' } = {}) => {
  const sel = h('select', { disabled, 'aria-label': label, onchange: e => onChange(e.target.value === '' ? null : Number(e.target.value)) },
    h('option', { value: '' }, '—'), ...Array.from({ length: 19 }, (_, i) => i / 2).map(v => h('option', { value: String(v), selected: value === v }, v.toFixed(1))));
  return sel;
};
