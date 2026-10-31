// UI helpers: DOM, toasts, theme, dialogs, signature canvas, image utilities, downloads.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtDate = (t, time = true) => {
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) +
    (time ? ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
};
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function toast(msg, { type = 'info', action = null, sticky = false, ms = 4500 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  const span = document.createElement('span'); span.textContent = msg; el.append(span);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  if (action) {
    const b = document.createElement('button'); b.className = 'btn btn-sm btn-primary'; b.type = 'button';
    b.textContent = action.label; b.onclick = () => { action.fn(); close(); }; el.append(b);
  }
  const x = document.createElement('button'); x.className = 'btn btn-sm btn-ghost'; x.type = 'button';
  x.setAttribute('aria-label', 'Dismiss'); x.textContent = '✕'; x.onclick = close; el.append(x);
  $('#toasts').append(el);
  if (!sticky) setTimeout(close, ms);
  return close;
}

const THEME_KEY = 'ss_theme';
export function applyTheme() {
  const t = localStorage.getItem(THEME_KEY) || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
  const b = $('#themeBtn');
  if (b) { b.textContent = { auto: '◐', light: '☀', dark: '☾' }[t]; b.setAttribute('aria-label', 'Theme: ' + t + '. Activate to switch.'); b.title = 'Theme: ' + t; }
}
export function cycleTheme() {
  const o = ['auto', 'light', 'dark'];
  localStorage.setItem(THEME_KEY, o[(o.indexOf(localStorage.getItem(THEME_KEY) || 'auto') + 1) % 3]);
  applyTheme();
}

function fieldHTML(f) {
  const id = 'f_' + f.name, req = f.required ? ' required' : '', v = esc(f.value ?? '');
  let c;
  if (f.type === 'textarea') c = `<textarea id="${id}" name="${f.name}" rows="3"${req}>${v}</textarea>`;
  else if (f.type === 'select') c = `<select id="${id}" name="${f.name}"${req}>${f.options.map((o) => `<option${o === f.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else c = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${v}"${req}>`;
  return `<div class="field"><label for="${id}">${esc(f.label)}</label>${c}</div>`;
}

export function ask({ title, intro = '', fields = [], submit = 'Save', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const d = $('#dlg'); let done = false;
    d.innerHTML = `<form class="dlg-form"><h2>${esc(title)}</h2>${intro ? `<p class="muted">${esc(intro)}</p>` : ''}${fields.map(fieldHTML).join('')}<div class="dlg-actions"><button type="button" class="btn btn-ghost" data-x>${esc(cancel)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(submit)}</button></div></form>`;
    const form = d.firstElementChild;
    const finish = (v) => { if (done) return; done = true; d.close(); resolve(v); };
    form.addEventListener('submit', (e) => { e.preventDefault(); finish(Object.fromEntries(new FormData(form))); });
    $('[data-x]', d).onclick = () => finish(null);
    d.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); }, { once: true });
    d.showModal();
    const f = $('input,select,textarea', d); if (f) f.focus(); else $('.btn-primary', d).focus();
  });
}

export function showHTML(title, html) {
  const d = $('#dlg');
  d.innerHTML = `<h2>${esc(title)}</h2>${html}<div class="dlg-actions"><button class="btn btn-primary" type="button" data-x>Close</button></div>`;
  $('[data-x]', d).onclick = () => d.close();
  d.showModal(); $('[data-x]', d).focus();
}

export function initSignature(c) {
  const ctx = c.getContext('2d'); let drawing = false, dirty = false;
  const reset = () => {
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b0f19'; dirty = false;
  };
  reset();
  c.addEventListener('pointerdown', (e) => { drawing = true; c.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); e.preventDefault(); });
  c.addEventListener('pointermove', (e) => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); dirty = true; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => c.addEventListener(t, () => { drawing = false; }));
  return { isEmpty: () => !dirty, data: () => c.toDataURL('image/png'), clear: reset };
}

// Generated "photo" placeholder (local canvas snapshot → base64 JPEG).
export function snapshot(label, facility) {
  const W = 480, H = 320, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1e293b'); g.addColorStop(1, '#0f172a');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(245,158,11,.22)'; x.lineWidth = 1;
  for (let i = 0; i < W; i += 40) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let j = 0; j < H; j += 40) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); }
  x.fillStyle = '#f59e0b';
  for (let k = -H; k < W; k += 36) { x.beginPath(); x.moveTo(k, H); x.lineTo(k + 18, H); x.lineTo(k + 18 + 22, H - 22); x.lineTo(k + 22, H - 22); x.fill(); }
  x.fillStyle = '#e8edf7'; x.font = '700 20px system-ui,sans-serif'; x.fillText('EVIDENCE SNAPSHOT', 20, 42);
  x.font = '14px system-ui,sans-serif'; x.fillStyle = '#cbd5e1';
  [facility || '', new Date().toLocaleString(), String(label).slice(0, 52)].forEach((t, i) => x.fillText(t, 20, 74 + i * 22));
  return c.toDataURL('image/jpeg', 0.8);
}

export function fileToJpeg(file, maxW = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maxW / img.width), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

export function download(name, text, mime = 'application/json') {
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: mime }));
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
