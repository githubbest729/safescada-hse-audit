// Application lifecycle: routing, views, PWA update + install prompts.
import * as db from './db.js';
import * as ui from './ui.js';
import * as eng from './audit-engine.js';
const { $, $$, esc, fmtDate } = ui;
const view = $('#view');
const S = { facility: localStorage.getItem('ss_facility') || eng.FACILITIES[0].name, capaFilter: 'All' };
if (!eng.FACILITIES.some((f) => f.name === S.facility)) S.facility = eng.FACILITIES[0].name;

const scoreCls = (s) => (s >= 90 ? 'good' : s >= 75 ? 'warn' : 'bad');
const barCls = (s) => (s >= 90 ? '' : s >= 75 ? 'warn' : 'bad');
const empty = (icon, title, text, btn = '') => `<div class="empty"><span class="big" aria-hidden="true">${icon}</span><strong>${esc(title)}</strong><p>${esc(text)}</p>${btn}</div>`;

/* ---------------- Router ---------------- */
const routes = { dashboard, audits, audit: runAudit, hazards, capa, archive };
async function route() {
  const [, name = 'dashboard', arg] = location.hash.split('/');
  $$('.nav a').forEach((a) => { const on = a.dataset.nav === (name === 'audit' ? 'audits' : name); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  view.onclick = null; view.oninput = null;
  if (S.io) { S.io.disconnect(); S.io = null; }
  document.body.classList.toggle('has-dock', name === 'audit');
  try { await (routes[name] || dashboard)(arg); }
  catch (err) { console.error(err); view.innerHTML = empty('⚠', 'Something went wrong', err.message || String(err)); }
  view.focus({ preventScroll: true }); window.scrollTo(0, 0);
}

/* ---------------- Dashboard ---------------- */
async function dashboard() {
  const [audits, capas] = await Promise.all([db.getAll('audits').catch(() => []), db.getAll('capas').catch(() => [])]);
  const fa = audits.filter((a) => a.facility === S.facility).sort((a, b) => b.ts - a.ts);
  const open = capas.filter((c) => c.facility === S.facility && c.status !== 'Verified Closed');
  const overdue = open.filter((c) => c.due < Date.now());
  const recent = fa.slice(0, 10);
  const score = recent.length ? Math.round(recent.reduce((s, a) => s + a.score, 0) / recent.length) : null;
  const permits = await db.getMeta('permits:' + S.facility, 0).catch(() => 0);
  let lti = await db.getMeta('lti:' + S.facility, null).catch(() => null);
  if (!lti) { lti = Date.now(); db.setMeta('lti:' + S.facility, lti).catch(() => {}); }
  const days = Math.floor((Date.now() - lti) / 864e5);
  try { localStorage.setItem('ss_snapshot', JSON.stringify({ ts: Date.now(), facility: S.facility, score, open: open.length, overdue: overdue.length, permits, lti: days })); } catch (e) {}

  const fcAll = capas.filter((c) => c.facility === S.facility);
  const charts = (fa.length || fcAll.length) ? `<div class="grid-2 section"><section class="card"><h2>Compliance trend</h2>${trendChart(fa)}</section><section class="card"><h2>CAPA pipeline</h2>${pipelineChart(fcAll)}</section></div>` : '';
  const st = score == null ? { t: 'No data yet', c: '' } : score >= 90 ? { t: 'On target', c: 'good' } : score >= 75 ? { t: 'Needs attention', c: 'warn' } : { t: 'Below target', c: 'bad' };
  const cs = overdue.length ? { t: overdue.length + ' overdue', c: 'bad' } : open.length ? { t: 'All within SLA', c: 'warn' } : { t: 'Nothing open', c: 'good' };
  const ps = permits ? { t: permits + ' in force', c: 'warn' } : { t: 'None active', c: 'good' };
  const ls = days >= 90 ? { t: 'Excellent streak', c: 'good' } : days >= 30 ? { t: 'Healthy streak', c: 'good' } : { t: 'Streak rebuilding', c: 'warn' };
  view.innerHTML = `
  <div class="page-head"><div><h1>Executive QHSE dashboard</h1><p class="sub">${esc(S.facility)}</p></div>
    <div class="row"><a class="btn btn-primary" href="#/audits">＋ New audit</a><a class="btn" href="#/hazards">⚠ Report hazard</a></div></div>
  <div class="grid">
    <section class="card kpi" aria-label="Compliance index"><div class="kpi-head"><span class="label">Compliance index</span><span class="kpi-ico ${st.c}" aria-hidden="true">✔</span></div>
      <span class="value ${st.c}">${score == null ? '—' : score + '%'}</span>
      <div class="bar ${score == null ? '' : barCls(score)}"><i style="width:${score ?? 0}%"></i></div>
      <span class="pill ${st.c}">${st.t}</span><span class="sub">${recent.length ? 'Average of last ' + recent.length + ' audit(s)' : 'Complete an audit to begin tracking'}</span></section>
    <section class="card kpi" aria-label="Open CAPA"><div class="kpi-head"><span class="label">Open CAPA</span><span class="kpi-ico ${cs.c}" aria-hidden="true">⛓</span></div>
      <span class="value ${cs.c}">${open.length}</span><span class="pill ${cs.c}">${cs.t}</span>
      <div class="row"><a class="btn btn-sm" href="#/capa">Open tracker</a></div></section>
    <section class="card kpi" aria-label="Active high-risk permits"><div class="kpi-head"><span class="label">High-risk permits</span><span class="kpi-ico ${ps.c}" aria-hidden="true">⚑</span></div>
      <span class="value" id="permitVal">${permits}</span><span class="pill ${ps.c}">${ps.t}</span>
      <div class="row"><button class="btn btn-sm" data-permit="-1" aria-label="Decrease permits">−</button><button class="btn btn-sm" data-permit="1" aria-label="Increase permits">＋</button></div></section>
    <section class="card kpi" aria-label="Days without LTI"><div class="kpi-head"><span class="label">Days without LTI</span><span class="kpi-ico ${ls.c}" aria-hidden="true">✚</span></div>
      <span class="value ${ls.c}">${days}</span><span class="pill ${ls.c}">${ls.t}</span><span class="sub">Since ${fmtDate(lti, false)}</span>
      <div class="row"><button class="btn btn-sm" id="ltiBtn" type="button">Record LTI</button></div></section>
  </div>
  ${charts}
  <div class="section"><h2>Recent audits</h2>
  ${fa.length ? `<div class="list">${fa.slice(0, 5).map(auditRow).join('')}</div>` :
    empty('📋', 'No audits logged yet for this facility', 'Start your first QHSE inspection.', '<div class="row" style="justify-content:center"><a class="btn btn-primary" href="#/audits">Start your first QHSE inspection</a><button class="btn" id="demoBtn" type="button">Explore with demo data</button></div>')}</div>`;

  view.onclick = async (e) => {
    const p = e.target.closest('[data-permit]');
    if (p) { const v = Math.max(0, permits + Number(p.dataset.permit)); await db.setMeta('permits:' + S.facility, v); return dashboard(); }
    if (e.target.closest('#ltiBtn')) {
      const r = await ui.ask({ title: 'Record lost time injury', intro: 'This resets the Days Without LTI counter for ' + S.facility + '.', submit: 'Reset counter', danger: true });
      if (r) { await db.setMeta('lti:' + S.facility, Date.now()); ui.toast('LTI recorded. Counter reset.', { type: 'warn' }); dashboard(); }
      return;
    }
    if (e.target.closest('#demoBtn')) return loadDemo();
    const v = e.target.closest('[data-view]'); if (v) showAudit(v.dataset.view);
  };
}

function auditRow(a) {
  return `<div class="list-row"><div><strong>${esc(a.templateTitle)}</strong><br><span class="muted">${fmtDate(a.ts)} · ${esc(a.inspector)}${a.inspectorId ? ' (' + esc(a.inspectorId) + ')' : ''} · ${esc(a.facility)}</span></div>
  <span class="badge ${scoreCls(a.score) === 'good' ? 'sev-low' : scoreCls(a.score) === 'warn' ? 'sev-medium' : 'sev-high'}">${a.score}%${a.failCount ? ' · ' + a.failCount + ' fail' : ''}</span>
  <button class="btn btn-sm" data-view="${a.id}" type="button">View</button></div>`;
}

async function showAudit(id) {
  const a = await db.get('audits', id); if (!a) return;
  const rows = a.items.map((i) => { const x = a.answers[i.id]; return `<li style="margin-bottom:12px"><span class="badge sev-${i.sev}">${eng.SEV_LABEL[i.sev]}</span> <strong class="${x.r === 'pass' ? 'good' : x.r === 'fail' ? 'bad' : 'muted'}">${(x.r || '').toUpperCase()}</strong><br>${esc(i.text)}${x.note ? `<br><em class="muted">“${esc(x.note)}”</em>` : ''}${(x.photos || []).length ? `<div class="thumbs">${x.photos.map((p) => `<img alt="Evidence" src="${p}">`).join('')}</div>` : ''}</li>`; }).join('');
  ui.showHTML(a.templateTitle, `<dl class="kv"><dt>Facility</dt><dd>${esc(a.facility)}</dd><dt>Date</dt><dd>${fmtDate(a.ts)}</dd><dt>Inspector</dt><dd>${esc(a.inspector)}${a.inspectorId ? ' (' + esc(a.inspectorId) + ')' : ''}</dd><dt>Score</dt><dd class="${scoreCls(a.score)}">${a.score}%</dd><dt>GPS</dt><dd>${a.geo ? a.geo.lat.toFixed(5) + ', ' + a.geo.lng.toFixed(5) + (a.geo.mock ? ' (mock)' : '') : '—'}</dd></dl>
  <ol style="padding-left:20px">${rows}</ol>${a.notes ? `<p><strong>Notes:</strong> ${esc(a.notes)}</p>` : ''}<p><strong>Sign-off</strong></p><img alt="Signature" src="${a.signature}" style="background:#fff;border-radius:8px;max-height:120px">`);
}

/* ---------------- Audits list & templates ---------------- */
async function audits() {
  const all = (await db.getAll('audits')).filter((a) => a.facility === S.facility).sort((a, b) => b.ts - a.ts);
  view.innerHTML = `<div class="page-head"><div><h1>Digital inspection checklists</h1><p class="sub">${esc(S.facility)}</p></div></div>
  <div class="grid">${eng.TEMPLATES.map((t) => `<article class="card stack"><div style="font-size:2rem" aria-hidden="true">${t.icon}</div><h2>${esc(t.title)}</h2><p class="muted">${t.items.length} checks · ${esc(t.ref)}</p><a class="btn btn-primary" href="#/audit/${t.id}">Start inspection</a></article>`).join('')}</div>
  <h2 class="section">History</h2>
  ${all.length ? `<div class="list">${all.slice(0, 20).map(auditRow).join('')}</div>` : empty('📋', 'No audits logged yet for this facility', 'Start your first QHSE inspection by choosing a template above.')}`;
  view.onclick = (e) => { const v = e.target.closest('[data-view]'); if (v) showAudit(v.dataset.view); };
}

/* ---------------- Checklist runner ---------------- */
async function runAudit(tid) {
  const t = eng.getTemplate(tid); if (!t) { location.hash = '#/audits'; return; }
  const key = 'draft:' + tid + ':' + S.facility;
  let d = await db.getMeta(key, null);
  if (d) ui.toast('Restored your unsaved draft.'); else d = eng.newDraft(t, S.facility);
  if (!d.inspector) d.inspector = localStorage.getItem('ss_user') || '';
  if (!d.inspectorId) d.inspectorId = localStorage.getItem('ss_userid') || '';
  const save = ui.debounce(() => db.setMeta(key, d).catch(() => {}), 500);
  let curItem = null;

  view.innerHTML = `<div class="page-head"><div><a href="#/audits" class="btn btn-ghost btn-sm" style="margin-left:calc(-1*var(--s3))">← Templates</a><h1>${esc(t.title)}</h1><p class="sub">${esc(S.facility)} · ${esc(t.ref)}</p></div></div>
  <div class="sticky-progress"><div class="row-between"><strong class="stepc" id="stepc">Item 1 of ${t.items.length}</strong><strong id="live">Score —</strong></div><div class="bar" id="bar"><i style="width:0"></i></div>
    <div class="meta"><span class="muted" id="prog">0 / ${t.items.length} answered</span><span id="left" class="muted" aria-live="polite"></span>
    <label class="switch compact"><input type="checkbox" id="autonext" role="switch"><span class="track" aria-hidden="true"></span><span>Auto-advance</span></label></div></div>
  <div id="items">${t.items.map((i) => `<article class="item" data-id="${i.id}" data-r="">
    <div class="item-head"><span class="badge sev-${i.sev}">${eng.SEV_LABEL[i.sev]}</span><p>${esc(i.text)}</p></div>
    <div class="seg" role="radiogroup" aria-label="Result for: ${esc(i.text)}">
      <button type="button" class="seg-btn pass" role="radio" aria-checked="false" data-r="pass">Pass</button>
      <button type="button" class="seg-btn fail" role="radio" aria-checked="false" data-r="fail">Fail</button>
      <button type="button" class="seg-btn na" role="radio" aria-checked="false" data-r="na">N/A</button></div>
    <div class="item-tools"><textarea rows="2" data-note placeholder="Note / observation" aria-label="Note"></textarea>
      <div class="row"><button type="button" class="btn btn-sm" data-act="mic">🎤 Voice note</button><button type="button" class="btn btn-sm" data-act="photo">📷 Photo</button><button type="button" class="btn btn-sm" data-act="snap">🖼 Snapshot</button></div>
      <div class="thumbs"></div></div></article>`).join('')}</div>
  <div class="dock" role="group" aria-label="Checklist navigation"><button type="button" class="btn" id="prevItem">◀ Prev</button><button type="button" class="btn btn-primary" id="nextUn">Next unanswered ▶</button></div>
  <section class="card" id="signCard" style="margin-top:var(--s4)"><h2>Location & sign-off</h2>
    <div class="field"><label for="geo">Geo-coordinates</label><div class="row"><input id="geo" readonly placeholder="Not captured" style="flex:1 1 200px"><button type="button" class="btn" id="geoBtn">📍 Capture</button></div></div>
    <div class="field"><label for="notes">General notes</label><textarea id="notes" rows="3"></textarea></div>
    <div class="grid-2" style="gap:var(--s3)"><div class="field"><label for="insp">Inspector name</label><input id="insp" autocomplete="name" required></div><div class="field"><label for="iid">Engineer ID</label><input id="iid" placeholder="e.g. ENG-1042"></div></div>
    <p class="hint" id="signas" aria-live="polite"></p>
    <label for="sig">Digital signature</label><canvas id="sig" class="sig" aria-label="Signature pad"></canvas>
    <div class="row" style="margin-top:var(--s2)"><button type="button" class="btn btn-sm" id="sigClear">Clear signature</button></div>
    <div class="row" style="margin-top:var(--s4)"><button type="button" class="btn btn-primary" id="submit">Submit audit</button><button type="button" class="btn btn-ghost" id="discard">Discard draft</button></div></section>
  <input type="file" id="file" accept="image/*" capture="environment" hidden>`;

  const sig = ui.initSignature($('#sig'));
  const thumbs = (id) => { const c = $(`.item[data-id="${id}"] .thumbs`); c.innerHTML = d.answers[id].photos.map((p) => `<img alt="Evidence photo" src="${p}">`).join(''); };
  const items = $$('.item');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ids = t.items.map((i) => i.id);
  let active = Math.max(0, ids.findIndex((id) => !d.answers[id].r));
  const updateStep = () => {
    const left = ids.filter((id) => !d.answers[id].r).length;
    $('#stepc').textContent = 'Item ' + (active + 1) + ' of ' + ids.length;
    $('#left').textContent = left ? left + ' unanswered' : 'All answered ✓';
    $('#nextUn').textContent = left ? 'Next unanswered ▶' : 'Go to sign-off ↓';
    items.forEach((el, k) => el.classList.toggle('active', k === active));
  };
  const goTo = (k) => {
    const el = items[k]; if (!el) return; active = k;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
    const b = $('.seg-btn', el); if (b) b.focus({ preventScroll: true });
    updateStep();
  };
  const nextUnanswered = () => { for (let o = 1; o <= ids.length; o++) { const k = (active + o) % ids.length; if (!d.answers[ids[k]].r) return k; } return -1; };
  const updSign = () => { $('#signas').textContent = d.inspector.trim() ? 'Signing as ' + d.inspector.trim() + (d.inspectorId ? ' (' + d.inspectorId + ')' : '') + ' · ' + new Date().toLocaleDateString() : 'Enter your name to sign off.'; };
  const auto = $('#autonext'); auto.checked = localStorage.getItem('ss_autonext') === '1';
  auto.onchange = () => localStorage.setItem('ss_autonext', auto.checked ? '1' : '0');
  if ('IntersectionObserver' in window) {
    S.io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { active = items.indexOf(en.target); updateStep(); } }), { rootMargin: '-35% 0px -55% 0px' });
    items.forEach((el) => S.io.observe(el));
  }
  const refresh = () => {
    const s = eng.computeScore(t, d.answers);
    $('#prog').textContent = s.answered + ' / ' + s.total + ' answered';
    $('#live').textContent = s.answered ? 'Score ' + s.score + '%' : 'Score —';
    $('#live').className = s.answered ? scoreCls(s.score) : '';
    const b = $('#bar'); b.className = 'bar ' + barCls(s.score); b.firstElementChild.style.width = (s.answered / s.total * 100) + '%';
    t.items.forEach((i) => {
      const a = d.answers[i.id], el = $(`.item[data-id="${i.id}"]`);
      el.dataset.r = a.r || '';
      $$('.seg-btn', el).forEach((b2) => b2.setAttribute('aria-checked', String(b2.dataset.r === a.r)));
    });
    updateStep();
  };
  t.items.forEach((i) => { $(`.item[data-id="${i.id}"] [data-note]`).value = d.answers[i.id].note; thumbs(i.id); });
  $('#notes').value = d.notes; $('#insp').value = d.inspector; $('#iid').value = d.inspectorId; updSign(); if (d.geo) $('#geo').value = d.geo.lat.toFixed(5) + ', ' + d.geo.lng.toFixed(5) + (d.geo.mock ? ' (mock)' : '');
  refresh();

  view.onclick = async (e) => {
    const seg = e.target.closest('.seg-btn');
    if (seg) {
      const el = seg.closest('.item'), id = el.dataset.id; d.answers[id].r = seg.dataset.r; active = items.indexOf(el); refresh(); save();
      if (auto.checked) { const k = nextUnanswered(); if (k >= 0) setTimeout(() => goTo(k), 250); }
      return;
    }
    if (e.target.closest('#prevItem')) return goTo(Math.max(0, active - 1));
    if (e.target.closest('#nextUn')) { const k = nextUnanswered(); return k >= 0 ? goTo(k) : $('#signCard').scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }); }
    const act = e.target.closest('[data-act]');
    if (act) {
      curItem = act.closest('.item').dataset.id;
      const item = t.items.find((i) => i.id === curItem);
      if (act.dataset.act === 'photo') $('#file').click();
      if (act.dataset.act === 'snap') { d.answers[curItem].photos.push(ui.snapshot(item.text, S.facility)); thumbs(curItem); save(); }
      if (act.dataset.act === 'mic') {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return ui.toast('Voice dictation is not supported here — type the note instead.', { type: 'warn' });
        const r = new SR(); r.lang = navigator.language || 'en-US';
        r.onresult = (ev) => { const ta = $(`.item[data-id="${curItem}"] [data-note]`); ta.value = (ta.value + ' ' + ev.results[0][0].transcript).trim(); d.answers[curItem].note = ta.value; save(); };
        r.onerror = () => ui.toast('Voice capture failed or was blocked.', { type: 'error' });
        try { r.start(); ui.toast('Listening… speak now.'); } catch (err) {}
      }
      return;
    }
    if (e.target.closest('#geoBtn')) {
      const fac = eng.FACILITIES.find((f) => f.name === S.facility);
      const set = (lat, lng, mock) => { d.geo = { lat, lng, mock }; $('#geo').value = lat.toFixed(5) + ', ' + lng.toFixed(5) + (mock ? ' (mock)' : ''); save(); };
      const mock = () => set(fac.lat + (Math.random() - .5) * 2e-4, fac.lng + (Math.random() - .5) * 2e-4, true);
      if (!navigator.geolocation) return mock();
      navigator.geolocation.getCurrentPosition((p) => set(p.coords.latitude, p.coords.longitude, false), () => { mock(); ui.toast('GPS unavailable — using facility coordinates (mock).', { type: 'warn' }); }, { timeout: 8000, maximumAge: 60000 });
      return;
    }
    if (e.target.closest('#sigClear')) return sig.clear();
    if (e.target.closest('#discard')) {
      if (await ui.ask({ title: 'Discard this draft?', intro: 'All answers on this form will be lost.', submit: 'Discard', danger: true })) { await db.del('meta', key); location.hash = '#/audits'; }
      return;
    }
    if (e.target.closest('#submit')) {
      const unanswered = t.items.find((i) => !d.answers[i.id].r);
      if (unanswered) { ui.toast('Answer every item (Pass, Fail or N/A) before submitting.', { type: 'warn' }); return $(`.item[data-id="${unanswered.id}"]`).scrollIntoView({ block: 'center' }); }
      if (!d.inspector.trim()) { ui.toast('Enter the inspector name.', { type: 'warn' }); return $('#insp').focus(); }
      if (sig.isEmpty()) { ui.toast('A digital signature is required.', { type: 'warn' }); return $('#sig').scrollIntoView({ block: 'center' }); }
      const { audit, capas } = eng.finalize(d, sig.data());
      await db.put('audits', audit); if (capas.length) await db.putMany('capas', capas);
      await db.del('meta', key); localStorage.setItem('ss_user', d.inspector); localStorage.setItem('ss_userid', d.inspectorId || '');
      ui.toast(`Audit saved · ${audit.score}% · ${capas.length} CAPA raised.`, { type: audit.score >= 75 ? 'success' : 'warn' });
      location.hash = capas.length ? '#/capa' : '#/dashboard';
    }
  };
  view.oninput = (e) => {
    if (e.target.matches('[data-note]')) { d.answers[e.target.closest('.item').dataset.id].note = e.target.value; save(); }
    else if (e.target.id === 'notes') { d.notes = e.target.value; save(); }
    else if (e.target.id === 'insp') { d.inspector = e.target.value; updSign(); save(); }
    else if (e.target.id === 'iid') { d.inspectorId = e.target.value; updSign(); save(); }
  };
  $('#file').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f || !curItem) return;
    try { d.answers[curItem].photos.push(await ui.fileToJpeg(f)); thumbs(curItem); save(); } catch (err) { ui.toast(err.message, { type: 'error' }); }
  };
}

/* ---------------- Hazard / near-miss ---------------- */
const PL = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
const SL = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
async function hazards() {
  const list = (await db.getAll('hazards')).filter((h) => h.facility === S.facility).sort((a, b) => b.ts - a.ts);
  view.innerHTML = `<div class="page-head"><div><h1>Hazard / near-miss report</h1><p class="sub">Fast field submission · 5×5 risk matrix · ${esc(S.facility)}</p></div></div>
  <div class="grid-2"><form class="card" id="hz" novalidate>
    <div class="field"><label for="type">Report type</label><select id="type"><option>Hazard</option><option>Near-miss</option><option>Incident</option></select></div>
    <div class="field"><label for="desc">What did you see?</label><textarea id="desc" rows="3" required placeholder="e.g. Exposed 230VAC terminals in PLC panel after door left open"></textarea></div>
    <div class="field"><label for="loc">Location / equipment tag</label><input id="loc" placeholder="e.g. Panel PLC-03, Room B"></div>
    <div class="field"><label for="prob">Probability</label><select id="prob">${PL.map((l, i) => `<option value="${i + 1}"${i === 2 ? ' selected' : ''}>${i + 1} · ${l}</option>`).join('')}</select></div>
    <div class="field"><label for="sev">Severity</label><select id="sev">${SL.map((l, i) => `<option value="${i + 1}"${i === 2 ? ' selected' : ''}>${i + 1} · ${l}</option>`).join('')}</select></div>
    <div class="field"><label for="who">Reporter</label><input id="who" autocomplete="name" value="${esc(localStorage.getItem('ss_user') || '')}"></div>
    <button class="btn btn-primary" type="submit">Submit report</button></form>
  <section class="card"><h2>Risk score: <span id="rs"></span></h2>
    <div class="scroll"><table class="matrix" aria-label="5 by 5 risk matrix"><thead><tr><th scope="col"></th>${[1, 2, 3, 4, 5].map((s) => `<th scope="col">S${s}</th>`).join('')}</tr></thead><tbody>
    ${[5, 4, 3, 2, 1].map((p) => `<tr><th scope="row">P${p}</th>${[1, 2, 3, 4, 5].map((s) => `<td class="l${eng.riskLevel(p, s).cls}" data-p="${p}" data-s="${s}">${p * s}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="hint">High (10–16) and Critical (17–25) risks automatically raise a CAPA.</p></section></div>
  <h2 class="section">Recent reports</h2>
  ${list.length ? `<div class="list">${list.slice(0, 10).map((h) => `<div class="list-row"><div><strong>${esc(h.type)}</strong> · ${esc(h.desc)}<br><span class="muted">${fmtDate(h.ts)} · ${esc(h.reporter)}${h.loc ? ' · ' + esc(h.loc) : ''}</span></div><span class="badge sev-${h.level}">${eng.SEV_LABEL[h.level]} · ${h.score}</span></div>`).join('')}</div>` : empty('⚠', 'No hazards reported for this facility', 'Spot something unsafe? Submit a report above in under 30 seconds.')}`;
  const upd = () => {
    const p = +$('#prob').value, s = +$('#sev').value, r = eng.riskLevel(p, s);
    $('#rs').textContent = r.v + ' (' + r.label + ')';
    $$('.matrix td').forEach((td) => td.classList.toggle('sel', +td.dataset.p === p && +td.dataset.s === s));
  };
  upd(); $('#prob').onchange = upd; $('#sev').onchange = upd;
  $('#hz').onsubmit = async (e) => {
    e.preventDefault();
    const desc = $('#desc').value.trim(); if (!desc) { ui.toast('Describe the hazard first.', { type: 'warn' }); return $('#desc').focus(); }
    const r = eng.riskLevel(+$('#prob').value, +$('#sev').value), reporter = $('#who').value.trim() || 'Unknown';
    const h = { id: eng.uid('haz'), ts: Date.now(), facility: S.facility, type: $('#type').value, desc, loc: $('#loc').value.trim(), reporter, p: +$('#prob').value, s: +$('#sev').value, score: r.v, level: r.key };
    await db.put('hazards', h); localStorage.setItem('ss_user', reporter);
    let msg = 'Report submitted · risk ' + r.v + ' (' + r.label + ').';
    if (r.v >= 10) { await db.put('capas', eng.makeCapa({ source: 'hazard', sourceId: h.id, facility: S.facility, sev: r.key, title: h.type + ': ' + desc.slice(0, 90), by: reporter })); msg += ' CAPA raised.'; }
    ui.toast(msg, { type: r.v >= 10 ? 'warn' : 'success' }); hazards();
  };
}

/* ---------------- CAPA tracker ---------------- */
async function capa() {
  const all = (await db.getAll('capas')).filter((c) => c.facility === S.facility);
  const filters = ['All', ...eng.STATUSES];
  const rows = all.filter((c) => S.capaFilter === 'All' || c.status === S.capaFilter)
    .sort((a, b) => (a.status === 'Verified Closed') - (b.status === 'Verified Closed') || a.due - b.due);
  view.innerHTML = `<div class="page-head"><div><h1>Corrective action tracker</h1><p class="sub">${esc(S.facility)}</p></div></div>
  <div class="chips" role="group" aria-label="Filter by status">${filters.map((f) => `<button class="chip" type="button" data-f="${f}" aria-pressed="${f === S.capaFilter}">${f}${f === 'All' ? ' (' + all.length + ')' : ' (' + all.filter((c) => c.status === f).length + ')'}</button>`).join('')}</div>
  ${rows.length ? `<div class="list">${rows.map((c) => {
    const s = eng.sla(c.due, c.status), idx = eng.STATUSES.indexOf(c.status), closed = idx === 3;
    return `<article class="card" data-id="${c.id}"><div class="row"><span class="badge sev-${c.severity}">${eng.SEV_LABEL[c.severity]}</span><span class="badge ${closed ? 'st-closed' : 'st'}">${c.status}</span><span class="sla ${s.cls}">${s.text}</span></div>
    <h3 style="margin-top:var(--s2)">${esc(c.title)}</h3>
    <p class="muted">Source: ${c.source} · Due ${fmtDate(c.due, false)}${c.assignee ? ' · Assigned to ' + esc(c.assignee) : ''}${c.signoff ? ' · Signed off by ' + esc(c.signoff.by) : ''}</p>
    ${stepper(idx)}
    <div class="row">${closed ? '' : `<button class="btn btn-primary btn-sm" data-adv="${c.id}" type="button">${['Assign…', 'Start rectification…', 'Verify & close…'][idx]}</button>`}<button class="btn btn-sm" data-hist="${c.id}" type="button">History</button></div></article>`;
  }).join('')}</div>` : empty('⛓', all.length ? 'No CAPA with this status' : 'No corrective actions for this facility', all.length ? 'Try another filter.' : 'Failed checklist items and High/Critical hazards appear here automatically.')}`;

  view.onclick = async (e) => {
    const f = e.target.closest('[data-f]'); if (f) { S.capaFilter = f.dataset.f; return capa(); }
    const h = e.target.closest('[data-hist]');
    if (h) { const c = all.find((x) => x.id === h.dataset.hist); return ui.showHTML('History', `<ol>${c.history.map((x) => `<li><strong>${esc(x.status)}</strong> · ${fmtDate(x.ts)}${x.by ? ' · ' + esc(x.by) : ''}${x.note ? '<br><span class="muted">' + esc(x.note) + '</span>' : ''}</li>`).join('')}</ol>`); }
    const a = e.target.closest('[data-adv]'); if (!a) return;
    const c = all.find((x) => x.id === a.dataset.adv), idx = eng.STATUSES.indexOf(c.status), next = eng.STATUSES[idx + 1];
    const cfg = [
      { title: 'Assign corrective action', fields: [{ name: 'by', label: 'Assigned to (engineer)', required: true }, { name: 'note', label: 'Instruction', type: 'textarea' }] },
      { title: 'Start rectification', fields: [{ name: 'by', label: 'Your name', required: true, value: c.assignee }, { name: 'note', label: 'Action plan / work order ref', type: 'textarea', required: true }] },
      { title: 'Verify & close (engineer sign-off)', fields: [{ name: 'by', label: 'Verifier name (sign-off)', required: true, value: localStorage.getItem('ss_user') || '' }, { name: 'note', label: 'Verification evidence', type: 'textarea', required: true }] }
    ][idx];
    const r = await ui.ask({ ...cfg, submit: 'Move to ' + next }); if (!r) return;
    c.status = next; if (idx === 0) c.assignee = r.by; if (idx === 2) c.signoff = { by: r.by, ts: Date.now() };
    c.history.push({ ts: Date.now(), status: next, by: r.by, note: r.note || '' });
    await db.put('capas', c); ui.toast('CAPA moved to ' + next + '.', { type: 'success' }); capa();
  };
}

/* ---------------- Archive & storage ---------------- */
const MB = (n) => (n / 1048576).toFixed(1) + ' MB';
async function archive() {
  const [est, na, nh, nc] = await Promise.all([db.storageEstimate(), db.count('audits'), db.count('hazards'), db.count('capas')]);
  const pct = est && est.quota ? Math.max(0.1, est.usage / est.quota * 100) : 0;
  view.innerHTML = `<div class="page-head"><div><h1>Archive & storage</h1><p class="sub">Persistent local database · backups · history</p></div></div>
  <div class="grid-2"><section class="card"><h2>Storage telemetry</h2>
    <p><span class="badge ${est && est.persisted ? 'sev-low' : 'sev-medium'}">${est ? (est.persisted ? '🔒 Persistent storage granted' : 'Best-effort storage (not persisted)') : 'Storage API unavailable'}</span></p>
    ${est ? `<div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div><p class="hint">${MB(est.usage)} used of ${MB(est.quota)} (${pct.toFixed(2)}%)</p>` : ''}
    <dl class="kv"><dt>Audits</dt><dd>${na}</dd><dt>Hazard reports</dt><dd>${nh}</dd><dt>CAPA records</dt><dd>${nc}</dd></dl>
    <p class="hint">IndexedDB comfortably holds 10,000+ records. Export a JSON backup regularly for 2–3 year regulatory retention.</p>
    ${est && !est.persisted ? '<button class="btn btn-primary" id="persist" type="button">Request persistent storage</button>' : ''}</section>
  <section class="card"><h2>Backup & restore</h2><div class="stack">
    <button class="btn btn-primary" id="expJson" type="button">⬇ Export full backup (JSON)</button>
    <div class="row"><select id="csvStore" aria-label="CSV dataset" style="flex:1 1 140px"><option value="audits">Audits</option><option value="hazards">Hazards</option><option value="capas">CAPA</option></select><button class="btn" id="expCsv" type="button">⬇ Export CSV</button></div>
    <div class="drop" id="drop"><span class="ico" aria-hidden="true">📂</span><p><strong>Restore from backup</strong></p><p class="hint" style="margin:0">Drag a .json backup here — records merge by ID</p>
      <button class="btn" type="button" id="pick">Select Backup File (.json)</button><p class="fname" id="fname" aria-live="polite"></p>
      <input id="imp" class="visually-hidden" type="file" accept="application/json,.json" tabindex="-1" aria-label="Backup file"></div></div></section></div>
  <h2 class="section">Audit history · all facilities</h2>
  <div class="field"><label for="q">Search</label><input id="q" type="search" placeholder="Template, facility or inspector"></div><div id="hist"></div>`;

  const all = (await db.getAll('audits')).sort((a, b) => b.ts - a.ts);
  const drawHist = () => {
    const q = $('#q').value.toLowerCase().trim();
    const r = all.filter((a) => !q || (a.templateTitle + a.facility + a.inspector).toLowerCase().includes(q));
    $('#hist').innerHTML = r.length ? `<div class="list">${r.slice(0, 100).map(auditRow).join('')}</div>${r.length > 100 ? `<p class="hint">Showing latest 100 of ${r.length}. Use search or export for the full archive.</p>` : ''}` : empty('🗄', 'No audits logged yet', 'Completed inspections are archived here.');
  };
  drawHist(); $('#q').oninput = ui.debounce(drawHist, 150);

  view.onclick = async (e) => {
    const v = e.target.closest('[data-view]'); if (v) return showAudit(v.dataset.view);
    if (e.target.closest('#persist')) { const r = await db.requestPersistence(); ui.toast(r.persisted ? 'Persistent storage granted.' : 'Browser declined persistence. Export backups regularly.', { type: r.persisted ? 'success' : 'warn' }); return archive(); }
    if (e.target.closest('#expJson')) { ui.download('safescada-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(await db.exportAll())); await db.setMeta('lastExport', Date.now()); return ui.toast('Backup exported.', { type: 'success' }); }
    if (e.target.closest('#expCsv')) {
      const s = $('#csvStore').value, rows = await db.getAll(s);
      const cols = { audits: ['id', 'ts', 'facility', 'templateTitle', 'inspector', 'score', 'failCount', 'critFails', 'notes'], hazards: ['id', 'ts', 'facility', 'type', 'desc', 'loc', 'reporter', 'p', 's', 'score', 'level'], capas: ['id', 'created', 'due', 'facility', 'severity', 'title', 'status', 'assignee', 'source', 'sourceId'] }[s];
      const out = rows.map((r) => { const o = { ...r }; ['ts', 'created', 'due'].forEach((k) => { if (o[k]) o[k] = new Date(o[k]).toISOString(); }); return o; });
      ui.download('safescada-' + s + '.csv', '\ufeff' + eng.toCSV(out, cols), 'text/csv;charset=utf-8'); ui.toast('CSV exported.', { type: 'success' });
    }
  };
  const importFile = async (f) => {
    if (!f) return; $('#fname').textContent = f.name;
    try { const r = await db.importAll(JSON.parse(await f.text())); ui.toast(`Imported ${r.audits} audits, ${r.hazards} hazards, ${r.capas} CAPA.`, { type: 'success' }); archive(); }
    catch (err) { ui.toast('Import failed: ' + err.message, { type: 'error' }); }
  };
  const drop = $('#drop');
  $('#pick').onclick = () => $('#imp').click();
  $('#imp').onchange = (e) => importFile(e.target.files[0]);
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => importFile(e.dataTransfer.files[0]));
}

/* ---------------- Shell: facility, badge, theme ---------------- */
function setupShell() {
  ui.applyTheme(); $('#themeBtn').onclick = ui.cycleTheme; ui.initFeedback();
  $('#helpBtn').onclick = () => openGuide(); $('#settingsBtn').onclick = openSettings;
  const tb = $('.topbar'), setH = () => document.documentElement.style.setProperty('--topbar-h', tb.offsetHeight + 'px');
  setH(); if ('ResizeObserver' in window) new ResizeObserver(setH).observe(tb); else addEventListener('resize', setH);
  const sel = $('#facility');
  sel.innerHTML = eng.FACILITIES.map((f) => `<option${f.name === S.facility ? ' selected' : ''}>${esc(f.name)}</option>`).join('');
  sel.onchange = () => { S.facility = sel.value; localStorage.setItem('ss_facility', S.facility); route(); };
  const badge = () => { const b = $('#syncBadge'), on = navigator.onLine; b.className = 'badge ' + (on ? 'on' : 'off'); b.title = (on ? 'Online' : 'Offline') + ' · IndexedDB ' + (dbReady ? 'ready' : 'error'); b.innerHTML = '<span class="badge-txt">' + (on ? 'Online' : 'Offline') + '</span><span class="hide-sm"> · IndexedDB ' + (dbReady ? 'ready' : 'error') + '</span>'; };
  let dbReady = false;
  window.addEventListener('online', () => { badge(); ui.toast('Back online.', { type: 'success' }); });
  window.addEventListener('offline', () => { badge(); ui.toast('You are offline. Data saves locally.', { type: 'warn' }); });
  return { badge: (ok) => { dbReady = ok; badge(); } };
}

/* ---------------- PWA: service worker, update + install ---------------- */
function setupPWA() {
  if ('serviceWorker' in navigator) {
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'SYNC') ui.toast('Connectivity restored.'); });
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
      const prompt = (w) => ui.toast('New version available.', { sticky: true, action: { label: 'Update Now', fn: () => w.postMessage('SKIP_WAITING') } });
      if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w); }); });
      setInterval(() => reg.update().catch(() => {}), 3600e3);
    }).catch((err) => console.warn('SW registration failed', err));
  }
  const bar = $('#installBar'); let deferred = null;
  const snoozed = () => Date.now() < Number(localStorage.getItem('ss_install_snooze') || 0);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const show = () => { if (!snoozed() && !standalone) bar.hidden = false; };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; setTimeout(show, 30000); });
  $('#installBtn').onclick = async () => { bar.hidden = true; if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; };
  $('#installNo').onclick = () => { bar.hidden = true; localStorage.setItem('ss_install_snooze', Date.now() + 14 * 864e5); };
  window.addEventListener('appinstalled', () => { bar.hidden = true; ui.toast('SafeSCADA installed.', { type: 'success' }); });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone && !snoozed()) {
    $('#installMsg').textContent = 'Tap Share, then “Add to Home Screen”.'; $('#installBtn').hidden = true; setTimeout(show, 30000);
  }
}

/* ---------------- Charts ---------------- */
const f1 = (n) => n.toFixed(1);
// Monotone cubic spline (Fritsch–Carlson): smooth curve that never overshoots the 0–100 range
function spline(P) {
  const n = P.length; if (n < 2) return '';
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1][0] - P[i][0]; m[i] = (P[i + 1][1] - P[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], q = a * a + b * b;
    if (q > 9) { const k = 3 / Math.sqrt(q); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${f1(P[0][0])} ${f1(P[0][1])}`;
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += ` C${f1(P[i][0] + h)} ${f1(P[i][1] + t[i] * h)} ${f1(P[i + 1][0] - h)} ${f1(P[i + 1][1] - t[i + 1] * h)} ${f1(P[i + 1][0])} ${f1(P[i + 1][1])}`; }
  return d;
}
function trendChart(fa) {
  const pts = fa.slice(0, 12).reverse();
  if (!pts.length) return '<p class="muted">Complete an audit to see your compliance trend.</p>';
  const W = 420, H = 220, L = 34, R = 14, T = 22, B = 28, iw = W - L - R, ih = H - T - B;
  const x = (i) => L + (pts.length === 1 ? iw / 2 : i * iw / (pts.length - 1)), y = (v) => T + ih - (v / 100) * ih;
  const P = pts.map((a, i) => [x(i), y(a.score)]);
  const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const curve = spline(P);
  const area = pts.length > 1 ? `<path d="${curve} L${f1(P[P.length - 1][0])} ${y(0)} L${f1(P[0][0])} ${y(0)} Z" fill="url(#trendFill)"/>` : '';
  const dots = pts.map((a, i) => {
    const col = a.score >= 90 ? 'var(--green)' : a.score >= 75 ? 'var(--amber)' : 'var(--red)';
    const anchor = i === 0 && pts.length > 1 ? 'start' : i === pts.length - 1 && pts.length > 1 ? 'end' : 'middle';
    const label = `${a.templateTitle}, ${fmtDate(a.ts, false)}, ${a.score} percent`;
    return `<g class="pt" tabindex="0" role="img" aria-label="${esc(label)}" style="color:${col}"><title>${esc(a.templateTitle)} · ${fmtDate(a.ts, false)} · ${a.score}%</title><circle class="halo" cx="${f1(P[i][0])}" cy="${f1(P[i][1])}" r="11"/><circle class="dot" cx="${f1(P[i][0])}" cy="${f1(P[i][1])}" r="5"/><text class="tip" x="${f1(P[i][0])}" y="${f1(P[i][1] - 14)}" text-anchor="${anchor}">${a.score}%</text></g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Compliance score over the last ${pts.length} audits. Latest ${pts[pts.length - 1].score} percent."><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f59e0b" stop-opacity=".15"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/></linearGradient></defs>${grid}<line x1="${L}" x2="${W - R}" y1="${y(90)}" y2="${y(90)}" stroke="var(--green)" stroke-dasharray="5 4" opacity=".85"/>${area}${pts.length > 1 ? `<path class="line" d="${curve}" fill="none" stroke="var(--amber)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}${dots}<text x="${L}" y="${H - 8}">${fmtDate(pts[0].ts, false)}</text><text x="${W - R}" y="${H - 8}" text-anchor="end">${fmtDate(pts[pts.length - 1].ts, false)}</text></svg><p class="hint">Dashed line marks the 90% target. Hover, tap or tab to a point for its score.</p>`;
}
const STEP_LBL = ['Open', 'Assigned', 'Rectifying', 'Closed'], STEP_ICO = ['⚑', '👤', '🛠', '✔'];
function stepper(idx) {
  const closed = idx === 3;
  return `<ol class="steps" aria-label="Progress: step ${idx + 1} of 4, ${eng.STATUSES[idx]}">${STEP_LBL.map((n, i) => {
    const st = closed || i < idx ? 'done' : i === idx ? 'cur' : 'todo';
    return `<li class="${st}"${st === 'cur' ? ' aria-current="step"' : ''}><span class="dot" aria-hidden="true">${st === 'done' ? '✓' : st === 'cur' ? STEP_ICO[i] : i + 1}</span><span class="lbl"><span class="visually-hidden">${i + 1}. </span>${n}<span class="visually-hidden">${st === 'done' ? ' (completed)' : st === 'cur' ? ' (current)' : ''}</span></span></li>`;
  }).join('')}</ol>`;
}
function pipelineChart(c) {
  if (!c.length) return '<p class="muted">No corrective actions yet — failed checks and High/Critical hazards appear here.</p>';
  const cnt = eng.STATUSES.map((s) => c.filter((x) => x.status === s).length), max = Math.max(1, ...cnt);
  const cls = ['c-open', 'c-assigned', 'c-rect', 'c-closed'];
  const rows = eng.STATUSES.map((s, i) => `<div class="hbar"><span>${s}</span><div class="bar ${cls[i]}" role="img" aria-label="${s}: ${cnt[i]}"><i style="width:${cnt[i] / max * 100}%"></i></div><b>${cnt[i]}</b></div>`).join('');
  const open = c.filter((x) => x.status !== 'Verified Closed'), sevs = ['critical', 'high', 'medium', 'low'], col = { critical: 'var(--red)', high: '#fb923c', medium: 'var(--amber)', low: 'var(--green)' };
  const stacked = open.length ? `<h3 style="margin-top:var(--s4)">Open by severity</h3><div class="stack-bar" role="img" aria-label="Open CAPA by severity">${sevs.map((v) => { const n = open.filter((x) => x.severity === v).length; return n ? `<i style="width:${n / open.length * 100}%;background:${col[v]}" title="${eng.SEV_LABEL[v]}: ${n}"></i>` : ''; }).join('')}</div><div class="legend">${sevs.map((v) => `<span style="--c:${col[v]}">${eng.SEV_LABEL[v]} ${open.filter((x) => x.severity === v).length}</span>`).join('')}</div>` : '';
  return rows + stacked;
}

/* ---------------- Demo data ---------------- */
async function resetDemo() {
  let n = 0;
  for (const st of ['audits', 'hazards', 'capas']) { const ids = (await db.getAll(st)).filter((r) => r.demo).map((r) => r.id); n += await db.delMany(st, ids); }
  if (await db.getMeta('demo:meta', false)) {
    await db.delMany('meta', [...eng.FACILITIES.map((f) => 'permits:' + f.name), ...eng.FACILITIES.map((f) => 'lti:' + f.name), 'demo:meta']);
  }
  return n;
}
async function loadDemo() {
  await resetDemo();
  const d = eng.buildDemo();
  await db.putMany('audits', d.audits); await db.putMany('hazards', d.hazards); await db.putMany('capas', d.capas);
  for (const f of eng.FACILITIES) { await db.setMeta('permits:' + f.name, d.permits[f.name]); await db.setMeta('lti:' + f.name, d.lti[f.name]); }
  await db.setMeta('demo:meta', true);
  localStorage.setItem('ss_onboarded', '1');
  ui.toast('Demo data loaded for all facilities. Remove it any time in Settings → Reset demo data.', { type: 'success', ms: 7000 });
  if (location.hash.startsWith('#/dashboard') || !location.hash) route(); else location.hash = '#/dashboard';
}

/* ---------------- HSE Guide ---------------- */
const GUIDE = [
  { ico: '🏭', title: 'Select your facility', body: () => `<p>Choose where you are working. Each facility keeps its own audits, CAPAs, permits and Days-Without-LTI counter.</p>
    <div class="chips" role="group" aria-label="Facility">${eng.FACILITIES.map((f) => `<button type="button" class="chip" data-fac="${esc(f.name)}" aria-pressed="${f.name === S.facility}">${esc(f.name)}</button>`).join('')}</div>
    <p class="hint">Switch any time from the facility menu in the top bar.</p>` },
  { ico: '✔', title: 'Perform digital audits', body: () => `<ul><li>Open <strong>Audits</strong>, pick a template (PLC cabinet, SCADA server room, field instrumentation, Wonderware maintenance) and mark every check <strong>Pass, Fail or N/A</strong>.</li>
    <li>Checks are <strong>weighted</strong>: Low 1, Medium 2, High 3, Critical 5. Score = passed weight ÷ (passed + failed weight).</li>
    <li>Every <strong>Fail automatically creates a CAPA</strong> with an SLA clock: Critical 1 day, High 7, Medium 30, Low 90.</li>
    <li>Add notes, voice dictation, photos and GPS, then sign off with your signature.</li></ul>` },
  { ico: '⚠', title: 'Fast hazard reporting', body: () => `<ul><li>Use <strong>Hazard</strong> to log a hazard, near-miss or incident in about 30 seconds.</li>
    <li>Pick Probability and Severity — the <strong>5×5 matrix scores it instantly</strong> (Low 1–4, Medium 5–9, High 10–16, Critical 17–25).</li>
    <li>High and Critical scores raise a CAPA automatically.</li></ul>
    <table class="matrix mini" aria-hidden="true"><tbody>${[5, 4, 3, 2, 1].map((p) => `<tr>${[1, 2, 3, 4, 5].map((v) => `<td class="l${eng.riskLevel(p, v).cls}">${p * v}</td>`).join('')}</tr>`).join('')}</tbody></table>` },
  { ico: '💾', title: 'Local persistence & off-grid export', body: () => `<ul><li>Everything is stored <strong>on this device</strong> in IndexedDB and works with no network.</li>
    <li>Persistent storage is requested so records survive for years; check usage any time in <strong>Settings</strong>.</li>
    <li>In <strong>Archive</strong>, export JSON or CSV backups for off-grid archiving and import them later.</li></ul>
    <p>Want to look around first? Load realistic sample data and explore the live dashboard.</p>` }
];
function openGuide(step = 0) {
  let i = step;
  const d = ui.prepDialog('wide', () => { d.onclick = null; localStorage.setItem('ss_onboarded', '1'); });
  d.setAttribute('aria-labelledby', 'gt');
  const draw = () => {
    const g = GUIDE[i], last = i === GUIDE.length - 1;
    d.innerHTML = `<div class="guide"><div class="row-between"><span class="label">HSE Guide · Step ${i + 1} of ${GUIDE.length}</span><button class="btn btn-ghost btn-sm" data-g="close" type="button" aria-label="Close guide">✕</button></div>
      <div class="dots" aria-hidden="true">${GUIDE.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="guide-ico" aria-hidden="true">${g.ico}</div><h2 id="gt" tabindex="-1">${g.title}</h2><div class="guide-body">${g.body()}</div>
      <div class="dlg-actions">${i ? '<button class="btn" data-g="back" type="button">Back</button>' : '<button class="btn btn-ghost" data-g="close" type="button">Skip tour</button>'}
      ${last ? '<button class="btn btn-ghost" data-g="close" type="button">Finish</button><button class="btn btn-primary" data-g="demo" type="button">Start Guided Demo</button>' : '<button class="btn btn-primary" data-g="next" type="button">Next</button>'}</div></div>`;
    const h = $('#gt', d); if (h) h.focus();
  };
  d.onclick = async (e) => {
    const fac = e.target.closest('[data-fac]');
    if (fac) { S.facility = fac.dataset.fac; localStorage.setItem('ss_facility', S.facility); $('#facility').value = S.facility; draw(); return route(); }
    const b = e.target.closest('[data-g]'); if (!b) return;
    if (b.dataset.g === 'next') { i++; draw(); } else if (b.dataset.g === 'back') { i--; draw(); }
    else if (b.dataset.g === 'close') d.close();
    else if (b.dataset.g === 'demo') { d.close(); await loadDemo(); }
  };
  d.showModal(); draw();
}

/* ---------------- Settings ---------------- */
const MB2 = (n) => (n / 1048576).toFixed(2) + ' MB';
function openSettings() {
  const d = ui.prepDialog('', () => { d.onclick = null; });
  d.setAttribute('aria-labelledby', 'sett');
  d.innerHTML = `<div class="settings"><div class="row-between" style="margin-bottom:var(--s3)"><h2 id="sett" style="margin:0">Settings</h2><button class="btn btn-ghost btn-sm" data-s="close" type="button" aria-label="Close settings">✕</button></div>
    <fieldset><legend>Inspector profile</legend>
      <div class="field"><label for="s_name">Inspector / engineer name</label><input id="s_name" autocomplete="name" value="${esc(localStorage.getItem('ss_user') || '')}"></div>
      <div class="field"><label for="s_id">Engineer ID</label><input id="s_id" placeholder="e.g. ENG-1042" value="${esc(localStorage.getItem('ss_userid') || '')}"><p class="hint">Auto-filled on every audit sign-off and hazard report.</p></div></fieldset>
    <fieldset><legend>Feedback</legend><label class="switch"><input type="checkbox" role="switch" id="s_fb"${ui.feedbackOn() ? ' checked' : ''}><span class="track" aria-hidden="true"></span><span>Haptic &amp; audio feedback on button presses</span></label></fieldset>
    <fieldset><legend>Storage</legend><button class="btn" id="s_st" data-s="storage" type="button">Run storage check</button><p class="hint" id="s_out" role="status" aria-live="polite" style="margin-top:var(--s2)"></p></fieldset>
    <fieldset><legend>Demo data</legend><div class="row"><button class="btn" data-s="demo" type="button">Load demo data</button><button class="btn btn-danger" data-s="reset" type="button">Reset demo data</button></div><p class="hint">Reset removes only demo records. Your real audits, hazards and CAPAs are untouched.</p></fieldset>
    <div class="dlg-actions"><button class="btn btn-ghost" data-s="close" type="button">Cancel</button><button class="btn btn-primary" data-s="save" type="button">Save</button></div></div>`;
  $('#s_fb', d).onchange = (e) => { localStorage.setItem('ss_feedback', e.target.checked ? '1' : '0'); ui.feedback(); };
  d.onclick = async (e) => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const act = b.dataset.s;
    if (act === 'close') return d.close();
    if (act === 'save') {
      const name = $('#s_name', d).value.trim(), id = $('#s_id', d).value.trim();
      localStorage.setItem('ss_user', name); localStorage.setItem('ss_userid', id);
      db.setMeta('profile', { name, id }).catch(() => {});
      d.close(); ui.toast('Settings saved.', { type: 'success' }); return;
    }
    if (act === 'storage') {
      const out = $('#s_out', d), e2 = await db.storageEstimate().catch(() => null);
      out.innerHTML = e2 ? `<strong>${MB2(e2.usage)}</strong> used · <strong>${MB2(Math.max(0, e2.quota - e2.usage))}</strong> remaining of ${MB2(e2.quota)} (browser-reported) · ${e2.persisted ? 'persistent storage granted' : 'not persistent'}` : 'The Storage API is not available in this browser.';
      return;
    }
    if (act === 'demo') { d.close(); return loadDemo(); }
    if (act === 'reset') {
      const ok = await ui.ask({ title: 'Reset demo data?', intro: 'Removes all demo audits, hazards and CAPAs (and the demo permit/LTI values). Real records are not touched.', submit: 'Reset demo data', danger: true });
      if (ok) { const n = await resetDemo(); ui.toast(n ? 'Removed ' + n + ' demo records.' : 'No demo data found.', { type: 'success' }); route(); }
    }
  };
  d.showModal(); $('#s_name', d).focus();
}

/* ---------------- Boot ---------------- */
function boot() {
  let shell = { badge() {} };
  try { shell = setupShell(); } catch (e) { console.error('Shell setup failed', e); }
  try { setupPWA(); } catch (e) { console.error('PWA setup failed', e); }
  window.addEventListener('hashchange', route);
  route();                                   // render immediately; never wait on storage
  db.count('audits').then((n) => { if (n === 0 && !localStorage.getItem('ss_onboarded')) openGuide(); }).catch(() => {});
  db.open().then(() => shell.badge(true)).catch((err) => { shell.badge(false); ui.toast('Local database unavailable: ' + err.message, { type: 'error', sticky: true }); })
    .finally(() => { db.requestPersistence().catch(() => {}); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
