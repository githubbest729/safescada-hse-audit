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

  view.innerHTML = `
  <h1>Executive QHSE dashboard</h1>
  <div class="grid">
    <section class="card tile" aria-label="Compliance index"><span class="label">Compliance index</span>
      <span class="value ${score == null ? '' : scoreCls(score)}">${score == null ? '—' : score + '%'}</span>
      <div class="bar ${score == null ? '' : barCls(score)}"><i style="width:${score ?? 0}%"></i></div>
      <span class="sub">${recent.length ? 'Average of last ' + recent.length + ' audit(s)' : 'No audits yet'}</span></section>
    <section class="card tile" aria-label="Open CAPA"><span class="label">Open CAPA</span>
      <span class="value ${overdue.length ? 'bad' : open.length ? 'warn' : 'good'}">${open.length}</span>
      <span class="sub">${overdue.length ? overdue.length + ' overdue' : 'None overdue'}</span>
      <a class="btn btn-sm" href="#/capa">Open tracker</a></section>
    <section class="card tile" aria-label="Active high-risk permits"><span class="label">Active high-risk permits</span>
      <span class="value" id="permitVal">${permits}</span>
      <div class="row"><button class="btn btn-sm" data-permit="-1" aria-label="Decrease permits">−</button><button class="btn btn-sm" data-permit="1" aria-label="Increase permits">+</button></div></section>
    <section class="card tile" aria-label="Days without LTI"><span class="label">Days without LTI</span>
      <span class="value ${days >= 30 ? 'good' : 'warn'}">${days}</span>
      <span class="sub">Since ${fmtDate(lti, false)}</span>
      <button class="btn btn-sm" id="ltiBtn" type="button">Record LTI</button></section>
  </div>
  <div class="row" style="margin:var(--s5) 0 var(--s4)">
    <a class="btn btn-primary" href="#/audits">＋ New audit</a><a class="btn" href="#/hazards">⚠ Report hazard</a>
  </div>
  <h2>Recent audits · ${esc(S.facility)}</h2>
  ${fa.length ? `<div class="list">${fa.slice(0, 5).map(auditRow).join('')}</div>` :
    empty('📋', 'No audits logged yet for this facility', 'Start your first QHSE inspection.', '<a class="btn btn-primary" href="#/audits">Start your first QHSE inspection</a>')}`;

  view.onclick = async (e) => {
    const p = e.target.closest('[data-permit]');
    if (p) { const v = Math.max(0, permits + Number(p.dataset.permit)); await db.setMeta('permits:' + S.facility, v); return dashboard(); }
    if (e.target.closest('#ltiBtn')) {
      const r = await ui.ask({ title: 'Record lost time injury', intro: 'This resets the Days Without LTI counter for ' + S.facility + '.', submit: 'Reset counter', danger: true });
      if (r) { await db.setMeta('lti:' + S.facility, Date.now()); ui.toast('LTI recorded. Counter reset.', { type: 'warn' }); dashboard(); }
      return;
    }
    const v = e.target.closest('[data-view]'); if (v) showAudit(v.dataset.view);
  };
}

function auditRow(a) {
  return `<div class="list-row"><div><strong>${esc(a.templateTitle)}</strong><br><span class="muted">${fmtDate(a.ts)} · ${esc(a.inspector)} · ${esc(a.facility)}</span></div>
  <span class="badge ${scoreCls(a.score) === 'good' ? 'sev-low' : scoreCls(a.score) === 'warn' ? 'sev-medium' : 'sev-high'}">${a.score}%${a.failCount ? ' · ' + a.failCount + ' fail' : ''}</span>
  <button class="btn btn-sm" data-view="${a.id}" type="button">View</button></div>`;
}

async function showAudit(id) {
  const a = await db.get('audits', id); if (!a) return;
  const rows = a.items.map((i) => { const x = a.answers[i.id]; return `<li style="margin-bottom:12px"><span class="badge sev-${i.sev}">${eng.SEV_LABEL[i.sev]}</span> <strong class="${x.r === 'pass' ? 'good' : x.r === 'fail' ? 'bad' : 'muted'}">${(x.r || '').toUpperCase()}</strong><br>${esc(i.text)}${x.note ? `<br><em class="muted">“${esc(x.note)}”</em>` : ''}${(x.photos || []).length ? `<div class="thumbs">${x.photos.map((p) => `<img alt="Evidence" src="${p}">`).join('')}</div>` : ''}</li>`; }).join('');
  ui.showHTML(a.templateTitle, `<dl class="kv"><dt>Facility</dt><dd>${esc(a.facility)}</dd><dt>Date</dt><dd>${fmtDate(a.ts)}</dd><dt>Inspector</dt><dd>${esc(a.inspector)}</dd><dt>Score</dt><dd class="${scoreCls(a.score)}">${a.score}%</dd><dt>GPS</dt><dd>${a.geo ? a.geo.lat.toFixed(5) + ', ' + a.geo.lng.toFixed(5) + (a.geo.mock ? ' (mock)' : '') : '—'}</dd></dl>
  <ol style="padding-left:20px">${rows}</ol>${a.notes ? `<p><strong>Notes:</strong> ${esc(a.notes)}</p>` : ''}<p><strong>Sign-off</strong></p><img alt="Signature" src="${a.signature}" style="background:#fff;border-radius:8px;max-height:120px">`);
}

/* ---------------- Audits list & templates ---------------- */
async function audits() {
  const all = (await db.getAll('audits')).filter((a) => a.facility === S.facility).sort((a, b) => b.ts - a.ts);
  view.innerHTML = `<h1>Digital inspection checklists</h1><p class="muted">Facility: ${esc(S.facility)}</p>
  <div class="grid">${eng.TEMPLATES.map((t) => `<article class="card stack"><div style="font-size:2rem" aria-hidden="true">${t.icon}</div><h2>${esc(t.title)}</h2><p class="muted">${t.items.length} checks · ${esc(t.ref)}</p><a class="btn btn-primary" href="#/audit/${t.id}">Start inspection</a></article>`).join('')}</div>
  <h2 style="margin-top:var(--s5)">History</h2>
  ${all.length ? `<div class="list">${all.slice(0, 20).map(auditRow).join('')}</div>` : empty('📋', 'No audits logged yet for this facility', 'Start your first QHSE inspection by choosing a template above.')}`;
  view.onclick = (e) => { const v = e.target.closest('[data-view]'); if (v) showAudit(v.dataset.view); };
}

/* ---------------- Checklist runner ---------------- */
async function runAudit(tid) {
  const t = eng.getTemplate(tid); if (!t) { location.hash = '#/audits'; return; }
  const key = 'draft:' + tid + ':' + S.facility;
  let d = await db.getMeta(key, null);
  if (d) ui.toast('Restored your unsaved draft.'); else d = eng.newDraft(t, S.facility);
  const save = ui.debounce(() => db.setMeta(key, d).catch(() => {}), 500);
  let curItem = null;

  view.innerHTML = `<a href="#/audits" class="btn btn-ghost btn-sm">← Templates</a>
  <h1>${esc(t.title)}</h1>
  <div class="sticky-progress"><div class="row-between"><strong id="prog">0 / ${t.items.length} answered</strong><strong id="live">Score —</strong></div><div class="bar" id="bar"><i style="width:0"></i></div></div>
  <div id="items">${t.items.map((i) => `<article class="item" data-id="${i.id}" data-r="">
    <div class="item-head"><span class="badge sev-${i.sev}">${eng.SEV_LABEL[i.sev]}</span><p>${esc(i.text)}</p></div>
    <div class="seg" role="radiogroup" aria-label="Result for: ${esc(i.text)}">
      <button type="button" class="seg-btn pass" role="radio" aria-checked="false" data-r="pass">Pass</button>
      <button type="button" class="seg-btn fail" role="radio" aria-checked="false" data-r="fail">Fail</button>
      <button type="button" class="seg-btn na" role="radio" aria-checked="false" data-r="na">N/A</button></div>
    <div class="item-tools"><textarea rows="2" data-note placeholder="Note / observation" aria-label="Note"></textarea>
      <div class="row"><button type="button" class="btn btn-sm" data-act="mic">🎤 Voice note</button><button type="button" class="btn btn-sm" data-act="photo">📷 Photo</button><button type="button" class="btn btn-sm" data-act="snap">🖼 Snapshot</button></div>
      <div class="thumbs"></div></div></article>`).join('')}</div>
  <section class="card" style="margin-top:var(--s4)"><h2>Location & sign-off</h2>
    <div class="field"><label for="geo">Geo-coordinates</label><div class="row"><input id="geo" readonly placeholder="Not captured" style="flex:1 1 200px"><button type="button" class="btn" id="geoBtn">📍 Capture</button></div></div>
    <div class="field"><label for="notes">General notes</label><textarea id="notes" rows="3"></textarea></div>
    <div class="field"><label for="insp">Inspector name</label><input id="insp" autocomplete="name" required></div>
    <label for="sig">Digital signature</label><canvas id="sig" class="sig" aria-label="Signature pad"></canvas>
    <div class="row" style="margin-top:var(--s2)"><button type="button" class="btn btn-sm" id="sigClear">Clear signature</button></div>
    <div class="row" style="margin-top:var(--s4)"><button type="button" class="btn btn-primary" id="submit">Submit audit</button><button type="button" class="btn btn-ghost" id="discard">Discard draft</button></div></section>
  <input type="file" id="file" accept="image/*" capture="environment" hidden>`;

  const sig = ui.initSignature($('#sig'));
  const thumbs = (id) => { const c = $(`.item[data-id="${id}"] .thumbs`); c.innerHTML = d.answers[id].photos.map((p) => `<img alt="Evidence photo" src="${p}">`).join(''); };
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
  };
  t.items.forEach((i) => { $(`.item[data-id="${i.id}"] [data-note]`).value = d.answers[i.id].note; thumbs(i.id); });
  $('#notes').value = d.notes; $('#insp').value = d.inspector; if (d.geo) $('#geo').value = d.geo.lat.toFixed(5) + ', ' + d.geo.lng.toFixed(5) + (d.geo.mock ? ' (mock)' : '');
  refresh();

  view.onclick = async (e) => {
    const seg = e.target.closest('.seg-btn');
    if (seg) { const id = seg.closest('.item').dataset.id; d.answers[id].r = seg.dataset.r; refresh(); save(); return; }
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
      await db.del('meta', key); localStorage.setItem('ss_user', d.inspector);
      ui.toast(`Audit saved · ${audit.score}% · ${capas.length} CAPA raised.`, { type: audit.score >= 75 ? 'success' : 'warn' });
      location.hash = capas.length ? '#/capa' : '#/dashboard';
    }
  };
  view.oninput = (e) => {
    if (e.target.matches('[data-note]')) { d.answers[e.target.closest('.item').dataset.id].note = e.target.value; save(); }
    else if (e.target.id === 'notes') { d.notes = e.target.value; save(); }
    else if (e.target.id === 'insp') { d.inspector = e.target.value; save(); }
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
  view.innerHTML = `<h1>Hazard / near-miss report</h1><p class="muted">Fast field submission · 5×5 risk matrix · ${esc(S.facility)}</p>
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
  <h2 style="margin-top:var(--s5)">Recent reports</h2>
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
  view.innerHTML = `<h1>Corrective action tracker</h1>
  <div class="chips" role="group" aria-label="Filter by status">${filters.map((f) => `<button class="chip" type="button" data-f="${f}" aria-pressed="${f === S.capaFilter}">${f}${f === 'All' ? ' (' + all.length + ')' : ' (' + all.filter((c) => c.status === f).length + ')'}</button>`).join('')}</div>
  ${rows.length ? `<div class="list">${rows.map((c) => {
    const s = eng.sla(c.due, c.status), idx = eng.STATUSES.indexOf(c.status), closed = idx === 3;
    return `<article class="card" data-id="${c.id}"><div class="row"><span class="badge sev-${c.severity}">${eng.SEV_LABEL[c.severity]}</span><span class="badge ${closed ? 'st-closed' : 'st'}">${c.status}</span><span class="sla ${s.cls}">${s.text}</span></div>
    <h3 style="margin-top:var(--s2)">${esc(c.title)}</h3>
    <p class="muted">Source: ${c.source} · Due ${fmtDate(c.due, false)}${c.assignee ? ' · Assigned to ' + esc(c.assignee) : ''}${c.signoff ? ' · Signed off by ' + esc(c.signoff.by) : ''}</p>
    <ol class="stepper" aria-label="Status pipeline">${eng.STATUSES.map((n, i) => `<li class="${i < idx || closed ? 'done' : i === idx ? 'cur' : ''}">${n}</li>`).join('')}</ol>
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
  view.innerHTML = `<h1>Archive & storage</h1>
  <div class="grid-2"><section class="card"><h2>Storage telemetry</h2>
    <p><span class="badge ${est && est.persisted ? 'sev-low' : 'sev-medium'}">${est ? (est.persisted ? '🔒 Persistent storage granted' : 'Best-effort storage (not persisted)') : 'Storage API unavailable'}</span></p>
    ${est ? `<div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div><p class="hint">${MB(est.usage)} used of ${MB(est.quota)} (${pct.toFixed(2)}%)</p>` : ''}
    <dl class="kv"><dt>Audits</dt><dd>${na}</dd><dt>Hazard reports</dt><dd>${nh}</dd><dt>CAPA records</dt><dd>${nc}</dd></dl>
    <p class="hint">IndexedDB comfortably holds 10,000+ records. Export a JSON backup regularly for 2–3 year regulatory retention.</p>
    ${est && !est.persisted ? '<button class="btn btn-primary" id="persist" type="button">Request persistent storage</button>' : ''}</section>
  <section class="card"><h2>Backup & restore</h2><div class="stack">
    <button class="btn btn-primary" id="expJson" type="button">⬇ Export full backup (JSON)</button>
    <div class="row"><select id="csvStore" aria-label="CSV dataset" style="flex:1 1 140px"><option value="audits">Audits</option><option value="hazards">Hazards</option><option value="capas">CAPA</option></select><button class="btn" id="expCsv" type="button">⬇ Export CSV</button></div>
    <div><label for="imp">Import JSON backup (merges by record ID)</label><input id="imp" type="file" accept="application/json,.json"></div></div></section></div>
  <h2 style="margin-top:var(--s5)">Audit history · all facilities</h2>
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
  $('#imp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const r = await db.importAll(JSON.parse(await f.text())); ui.toast(`Imported ${r.audits} audits, ${r.hazards} hazards, ${r.capas} CAPA.`, { type: 'success' }); archive(); }
    catch (err) { ui.toast('Import failed: ' + err.message, { type: 'error' }); }
  };
}

/* ---------------- Shell: facility, badge, theme ---------------- */
function setupShell() {
  ui.applyTheme(); $('#themeBtn').onclick = ui.cycleTheme;
  const sel = $('#facility');
  sel.innerHTML = eng.FACILITIES.map((f) => `<option${f.name === S.facility ? ' selected' : ''}>${esc(f.name)}</option>`).join('');
  sel.onchange = () => { S.facility = sel.value; localStorage.setItem('ss_facility', S.facility); route(); };
  const badge = () => { const b = $('#syncBadge'), on = navigator.onLine; b.className = 'badge ' + (on ? 'on' : 'off'); b.textContent = (on ? 'Online' : 'Offline') + ' · IndexedDB ' + (dbReady ? 'ready' : 'error'); };
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

/* ---------------- Boot ---------------- */
function boot() {
  let shell = { badge() {} };
  try { shell = setupShell(); } catch (e) { console.error('Shell setup failed', e); }
  try { setupPWA(); } catch (e) { console.error('PWA setup failed', e); }
  window.addEventListener('hashchange', route);
  route();                                   // render immediately; never wait on storage
  db.open().then(() => shell.badge(true)).catch((err) => { shell.badge(false); ui.toast('Local database unavailable: ' + err.message, { type: 'error', sticky: true }); })
    .finally(() => { db.requestPersistence().catch(() => {}); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
