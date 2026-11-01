// Checklist templates, scoring, risk matrix, CAPA generation and SLA helpers.
export const FACILITIES = [
  { name: 'Substation Automation Unit', lat: 24.4539, lng: 54.3773 },
  { name: 'Water Desalination Facility', lat: 24.2992, lng: 54.6973 },
  { name: 'Power Plant Control Room', lat: 24.4667, lng: 54.3667 },
  { name: 'Wonderware SCADA Server Room', lat: 24.4872, lng: 54.3541 }
];
export const SEV = { low: 1, medium: 2, high: 3, critical: 5 };
export const SEV_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
export const SLA_DAYS = { critical: 1, high: 7, medium: 30, low: 90 };
export const STATUSES = ['Open', 'Assigned', 'Under Rectification', 'Verified Closed'];

const it = (id, sev, text) => ({ id, sev, text });
export const TEMPLATES = [
  { id: 'plc', icon: '🗄', title: 'Control Panel & PLC Cabinet Inspection', ref: 'Annexure-SCT-HR-001 · ISO 45001',
    items: [
      it('p1', 'critical', 'LOTO applied and zero-energy verified before cabinet access.'),
      it('p2', 'high', '24VDC and 230VAC terminals physically segregated, barriered and labelled.'),
      it('p3', 'high', 'Protective earth (PE) bonding and shield terminations continuity verified.'),
      it('p4', 'medium', 'Wire ferrules fitted on all terminations; no exposed strands or loose lugs.'),
      it('p5', 'medium', 'Cabinet IP rating maintained: gaskets, gland plates and door seals intact.'),
      it('p6', 'medium', 'Cooling fan and filter clean and running; cabinet temperature within limits.'),
      it('p7', 'low', 'Shock / arc-flash labels and as-built drawings present in cabinet pocket.')
    ] },
  { id: 'srv', icon: '🖥', title: 'SCADA Server Room & Cyber-Physical Safety', ref: 'ISO 45001 · ISO 9001',
    items: [
      it('s1', 'high', 'Redundant UPS units healthy, load balanced, battery test within last 6 months.'),
      it('s2', 'critical', 'FM200 suppression: gauge in green, panel free of faults, manual release guarded.'),
      it('s3', 'critical', 'Emergency stop and exit routes accessible and unobstructed.'),
      it('s4', 'high', 'Cable trench gas check (LEL / H2S / CO) done; trench covers intact.'),
      it('s5', 'medium', 'Temperature (18–27 °C) and humidity (40–60 % RH) within setpoints and logged.'),
      it('s6', 'high', 'OT/IT segregation intact: firewall in place, no unauthorised USB or remote tools.'),
      it('s7', 'low', 'Housekeeping: no combustible storage, cable management tidy.')
    ] },
  { id: 'fld', icon: '🛠', title: 'Field Instrumentation & Hot Work Hazard Assessment', ref: 'ISO 45001 · ISO 14001',
    items: [
      it('f1', 'critical', 'Hot work permit valid; gas test done; fire watch assigned.'),
      it('f2', 'critical', 'Instrument ATEX / hazardous-zone rating matches the area classification.'),
      it('f3', 'high', 'Intrinsic safety barriers intact; IS loops segregated and identified.'),
      it('f4', 'high', 'PPE adhered to: FR clothing, hard hat, safety shoes, gloves, eye protection.'),
      it('f5', 'high', 'Process isolation / depressurisation of impulse lines verified before work.'),
      it('f6', 'medium', 'Calibration tag present, in-date and traceable.'),
      it('f7', 'medium', 'Safe access / fall protection for elevated transmitters in place.'),
      it('f8', 'low', 'Job safety analysis (JSA) briefed and signed by crew.')
    ] },
  { id: 'wwm', icon: '💾', title: 'Wonderware / PLC System Maintenance Safety Routine', ref: 'ISO 9001 · Change control',
    items: [
      it('w1', 'critical', 'Verified backup of PLC program and Wonderware project taken before hot-patching.'),
      it('w2', 'critical', 'ESD / safety-instrumented circuits verified unimpaired by the change.'),
      it('w3', 'high', 'Change approval (MOC) and rollback plan documented.'),
      it('w4', 'high', 'Alarm bypass / inhibit logged with authoriser and expiry time.'),
      it('w5', 'high', 'Post-change functional test done and all bypassed alarms re-enabled.'),
      it('w6', 'medium', 'Control room operators informed before and after the intervention.'),
      it('w7', 'medium', 'Software integrity check (hash / whitelist) completed on patched nodes.')
    ] }
];
export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id);

export const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function newDraft(t, facility) {
  const answers = {};
  t.items.forEach((i) => { answers[i.id] = { r: null, note: '', photos: [] }; });
  return { id: uid('aud'), templateId: t.id, templateTitle: t.title, facility, ts: Date.now(), inspector: localStorage.getItem('ss_user') || '', inspectorId: localStorage.getItem('ss_userid') || '', geo: null, notes: '', answers };
}

export function computeScore(t, answers) {
  let pass = 0, fail = 0, answered = 0, na = 0, critFails = 0;
  t.items.forEach((i) => {
    const r = answers[i.id] && answers[i.id].r;
    if (!r) return;
    answered++;
    if (r === 'pass') pass += SEV[i.sev];
    else if (r === 'fail') { fail += SEV[i.sev]; if (i.sev === 'critical') critFails++; }
    else na++;
  });
  const denom = pass + fail;
  return { score: denom ? Math.round((pass / denom) * 100) : 100, answered, total: t.items.length, na, critFails, failCount: t.items.filter((i) => answers[i.id] && answers[i.id].r === 'fail').length };
}

export function finalize(draft, signature) {
  const t = getTemplate(draft.templateId);
  const s = computeScore(t, draft.answers);
  const audit = { ...draft, ts: Date.now(), signature, score: s.score, failCount: s.failCount, critFails: s.critFails, naCount: s.na, total: s.total, items: t.items.map((i) => ({ id: i.id, text: i.text, sev: i.sev })) };
  const capas = t.items.filter((i) => draft.answers[i.id].r === 'fail').map((i) => makeCapa({
    source: 'audit', sourceId: audit.id, facility: draft.facility, sev: i.sev,
    title: i.text, note: draft.answers[i.id].note, by: draft.inspector
  }));
  return { audit, capas };
}

export function makeCapa({ source, sourceId, facility, sev, title, note = '', by = '' }) {
  const now = Date.now();
  return { id: uid('capa'), source, sourceId, facility, severity: sev, title, note, status: 'Open', assignee: '', created: now,
    due: now + SLA_DAYS[sev] * 864e5, history: [{ ts: now, status: 'Open', by, note: 'Raised from ' + source }], signoff: null };
}

export function riskLevel(p, s) {
  const v = p * s;
  if (v >= 17) return { v, key: 'critical', label: 'Critical', cls: 4 };
  if (v >= 10) return { v, key: 'high', label: 'High', cls: 3 };
  if (v >= 5) return { v, key: 'medium', label: 'Medium', cls: 2 };
  return { v, key: 'low', label: 'Low', cls: 1 };
}

export function sla(due, status) {
  if (status === 'Verified Closed') return { text: 'Closed', cls: 'good' };
  const ms = due - Date.now(), abs = Math.abs(ms);
  const d = Math.floor(abs / 864e5), h = Math.floor((abs % 864e5) / 36e5);
  const t = d ? d + 'd ' + h + 'h' : h + 'h ' + Math.floor((abs % 36e5) / 6e4) + 'm';
  if (ms < 0) return { text: 'Overdue by ' + t, cls: 'bad' };
  return { text: 'Due in ' + t, cls: ms < 2 * 864e5 ? 'warn' : 'good' };
}

export function toCSV(rows, cols) {
  const q = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n');
}

// ---------- Demo data (all records flagged demo:true so they can be removed without touching real data) ----------
export function buildDemo() {
  let seed = 20261031;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const now = Date.now();
  const SIG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100"><rect width="300" height="100" fill="#fff"/><path d="M20 70 C40 10 60 90 80 40 S120 20 140 60 S190 90 210 35 S260 50 280 30" fill="none" stroke="#0b0f19" stroke-width="3" stroke-linecap="round"/></svg>');
  const people = [['A. Rahman', 'ENG-1042'], ['M. Santos', 'ENG-2217'], ['K. Nair', 'ENG-3105']];
  const audits = [], capas = [], hazards = [], permits = {}, lti = {};
  const closeOut = (c, ageDays, by) => {
    const t0 = c.created;
    if (ageDays > 40) {
      c.status = 'Verified Closed'; c.assignee = by;
      c.history.push({ ts: t0 + 864e5, status: 'Assigned', by, note: 'Demo assignment' }, { ts: t0 + 3 * 864e5, status: 'Under Rectification', by, note: 'Work order raised' }, { ts: t0 + 6 * 864e5, status: 'Verified Closed', by, note: 'Verified on site' });
      c.signoff = { by, ts: t0 + 6 * 864e5 };
    } else if (ageDays > 20) {
      c.status = 'Under Rectification'; c.assignee = by;
      c.history.push({ ts: t0 + 864e5, status: 'Assigned', by, note: 'Demo assignment' }, { ts: t0 + 3 * 864e5, status: 'Under Rectification', by, note: 'Work order raised' });
    } else if (rnd() < 0.5) {
      c.status = 'Assigned'; c.assignee = by; c.history.push({ ts: t0 + 36e5, status: 'Assigned', by, note: 'Demo assignment' });
    }
  };
  FACILITIES.forEach((f, fi) => {
    permits[f.name] = [2, 1, 3, 0][fi]; lti[f.name] = now - [142, 87, 311, 29][fi] * 864e5;
    const n = 6;
    for (let k = 0; k < n; k++) {
      const daysAgo = Math.round((n - 1 - k) * 9 + rnd() * 3 + fi);
      const ts = now - daysAgo * 864e5 - Math.round(rnd() * 2e7);
      const t = TEMPLATES[(fi + k) % TEMPLATES.length], p = people[(fi + k) % people.length];
      const failP = 0.30 - k * 0.045, answers = {};
      t.items.forEach((i) => {
        const r = rnd();
        const res = r < 0.07 ? 'na' : rnd() < failP ? 'fail' : 'pass';
        answers[i.id] = { r: res, note: res === 'fail' ? 'Observed during demo inspection — corrective action required.' : '', photos: [] };
      });
      if (k < 2) answers[t.items[1].id].r = 'fail';
      const draft = { id: 'demo_aud_' + fi + '_' + k, templateId: t.id, templateTitle: t.title, facility: f.name, ts, inspector: p[0], inspectorId: p[1], geo: { lat: f.lat, lng: f.lng, mock: true }, notes: 'Demo inspection record.', answers };
      const r = finalize(draft, SIG);
      r.audit.ts = ts; r.audit.demo = true; audits.push(r.audit);
      r.capas.forEach((c, ci) => {
        c.id = 'demo_capa_' + draft.id + '_' + ci; c.created = ts; c.due = ts + SLA_DAYS[c.severity] * 864e5;
        c.history = [{ ts, status: 'Open', by: p[0], note: 'Raised from audit' }]; c.demo = true;
        closeOut(c, daysAgo, p[0]); capas.push(c);
      });
    }
    [[3, 4, 'Exposed terminals on marshalling panel after door left open', 'Hazard'], [2, 3, 'Trip hazard — loose cable across server aisle', 'Near-miss'], [4, 4, 'Unguarded FM200 manual release lever', 'Hazard']].forEach(([pr, sv, desc, type], hi) => {
      const rl = riskLevel(pr, sv), ts = now - Math.round((hi * 11 + 3 + fi * 2) * 864e5);
      const h = { id: 'demo_haz_' + fi + '_' + hi, ts, facility: f.name, type, desc, loc: 'Demo location ' + (hi + 1), reporter: people[hi % 3][0], p: pr, s: sv, score: rl.v, level: rl.key, demo: true };
      hazards.push(h);
      if (rl.v >= 10) {
        const c = makeCapa({ source: 'hazard', sourceId: h.id, facility: f.name, sev: rl.key, title: type + ': ' + desc, by: h.reporter });
        c.id = 'demo_capa_' + h.id; c.created = ts; c.due = ts + SLA_DAYS[rl.key] * 864e5; c.history[0].ts = ts; c.demo = true;
        closeOut(c, Math.round((now - ts) / 864e5), h.reporter); capas.push(c);
      }
    });
  });
  return { audits, hazards, capas, permits, lti };
}
