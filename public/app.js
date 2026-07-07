// app.js — Debate Judge Bot frontend (vanilla JS, no build step).
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  sessionId: null,
  config: { governmentName: 'Government', oppositionName: 'Opposition', speakersPerSide: 3 },
  speakers: [],
  poiEvents: [],
  utterances: [],
  stats: null,
  judgment: null,
  llm: false,
};

// ---- helpers ---------------------------------------------------------------
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function confClass(c) { return c >= 0.7 ? 'hi' : c >= 0.45 ? 'mid' : 'lo'; }

function goStep(n) {
  $$('.panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== String(n)));
  $$('.step').forEach((s) => {
    const step = Number(s.dataset.step);
    s.classList.toggle('active', step === n);
    s.classList.toggle('done', step < n && !!state.sessionId);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- init ------------------------------------------------------------------
async function init() {
  try {
    const h = await api('GET', '/api/health');
    state.llm = h.llm;
    const badge = $('#llmBadge');
    badge.textContent = h.llm ? `AI: on (${h.model})` : 'AI: off · rule-based mode';
    badge.classList.toggle('on', h.llm);
  } catch { /* offline */ }

  try {
    const samples = await api('GET', '/api/samples');
    const sel = $('#sampleSelect');
    samples.forEach((s) => {
      const o = document.createElement('option');
      o.value = s.name; o.textContent = '📄 ' + s.title;
      sel.appendChild(o);
    });
  } catch { /* no samples */ }

  wireEvents();
}

function wireEvents() {
  $$('.step').forEach((b) => b.addEventListener('click', () => {
    const n = Number(b.dataset.step);
    if (n > 1 && !state.sessionId) { toast('Parse a transcript first.'); return; }
    goStep(n);
  }));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => goStep(Number(b.dataset.goto))));

  $('#fileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $('#transcript').value = await f.text();
    toast(`Loaded ${f.name}`);
  });
  $('#sampleSelect').addEventListener('change', async (e) => {
    if (!e.target.value) return;
    const txt = await fetch('/api/samples/' + encodeURIComponent(e.target.value)).then((r) => r.text());
    $('#transcript').value = txt;
    toast('Sample loaded — press Parse.');
  });
  $('#clearBtn').addEventListener('click', () => { $('#transcript').value = ''; });

  $('#parseBtn').addEventListener('click', doParse);
  $('#saveSpeakersBtn').addEventListener('click', saveSpeakers);
  $('#savePoisBtn').addEventListener('click', () => savePois(false));
  $('#judgeBtn').addEventListener('click', () => savePois(true));
  $('#addPoiBtn').addEventListener('click', addPoiRow);
  $('#reJudgeBtn').addEventListener('click', doJudge);
  $('#exportBtn').addEventListener('click', exportJson);
}

// ---- STEP 1: parse ---------------------------------------------------------
async function doParse() {
  const transcript = $('#transcript').value.trim();
  if (!transcript) { toast('Please paste a transcript first.'); return; }
  const config = {
    governmentName: $('#govName').value.trim() || 'Government',
    oppositionName: $('#oppName').value.trim() || 'Opposition',
    speakersPerSide: Number($('#perSide').value) || 3,
  };
  const status = $('#parseStatus');
  status.innerHTML = '<span class="spin"></span> Parsing…';
  try {
    const data = await api('POST', '/api/parse', { transcript, config, useLlm: $('#useLlm').checked });
    Object.assign(state, {
      sessionId: data.sessionId, config: data.config, speakers: data.speakers,
      poiEvents: data.poiEvents, utterances: data.utterances, stats: data.stats,
    });
    status.textContent = `✓ ${data.refinedBy}${data.refinedBy.includes('llm') ? '' : (state.llm ? '' : ' (rule-based)')}`;
    renderSpeakers();
    renderPois();
    toast(`Found ${state.stats.poiCount} POI event(s), ${state.stats.needsReview} need review.`);
    goStep(2);
  } catch (e) {
    status.textContent = '✗ ' + e.message;
    toast('Parse failed: ' + e.message);
  }
}

// ---- STEP 2: speakers ------------------------------------------------------
function renderSpeakers() {
  const tbody = $('#speakerTable tbody');
  tbody.innerHTML = '';
  const teamOptions = [state.config.governmentName, state.config.oppositionName, 'neutral', 'unknown'];
  state.speakers.forEach((sp, i) => {
    const tr = document.createElement('tr');
    if (sp.needs_manual_review) tr.classList.add('needs-review');
    tr.innerHTML = `
      <td><b>${esc(sp.label)}</b></td>
      <td><input data-k="role" data-i="${i}" value="${esc(sp.role)}" /></td>
      <td><select data-k="team" data-i="${i}">${teamOptions.map((t) => `<option ${t === sp.team ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
      <td><span class="badge ${confClass(sp.confidence)}">${Math.round(sp.confidence * 100)}%</span><div class="conf-bar"><i style="width:${Math.round(sp.confidence * 100)}%"></i></div></td>
      <td>${sp.needs_manual_review ? '<span class="review-pill">要確認 review</span>' : '<span class="badge hi">ok</span>'}</td>`;
    tbody.appendChild(tr);
  });
  $('#speakerStats').innerHTML =
    `<span>Speakers: <b>${state.speakers.length}</b></span>` +
    `<span>Need review: <b>${state.speakers.filter((s) => s.needs_manual_review).length}</b></span>`;

  tbody.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.i == null) return;
    const sp = state.speakers[Number(el.dataset.i)];
    sp[el.dataset.k] = el.value;
    if (el.dataset.k === 'team') { sp.needs_manual_review = false; el.closest('tr').classList.remove('needs-review'); }
  }, { once: false });
}

async function saveSpeakers() {
  const status = $('#speakerStatus');
  status.innerHTML = '<span class="spin"></span> Saving…';
  try {
    const data = await api('PUT', `/api/session/${state.sessionId}/speakers`, { speakers: state.speakers });
    state.speakers = data.speakers; state.poiEvents = data.poiEvents;
    status.textContent = '✓ saved';
    renderPois();
    goStep(3);
  } catch (e) { status.textContent = '✗ ' + e.message; }
}

// ---- STEP 3: POIs ----------------------------------------------------------
function speakerLabels() {
  const labels = state.speakers.map((s) => s.label);
  return labels.length ? labels : Array.from(new Set(state.utterances.map((u) => u.rawSpeaker).filter(Boolean)));
}

function renderPois() {
  const tbody = $('#poiTable tbody');
  tbody.innerHTML = '';
  const labels = speakerLabels();
  const speakerOpts = (val) => `<option value="">—</option>` +
    labels.map((l) => `<option ${l === val ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const statuses = ['accepted', 'declined', 'ignored', 'unclear'];

  state.poiEvents.forEach((ev, i) => {
    const tr = document.createElement('tr');
    if (ev.needs_manual_review) tr.classList.add('needs-review');
    tr.dataset.i = i;
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><select data-k="requester">${speakerOpts(ev.requester)}</select>
          <div class="mini team-r">${esc(ev.requester_team || '')}</div></td>
      <td><select data-k="target_speaker">${speakerOpts(ev.target_speaker)}</select>
          <div class="mini team-t">${esc(ev.target_team || '')}</div></td>
      <td><textarea data-k="question_text" rows="2">${esc(ev.question_text)}</textarea></td>
      <td><textarea data-k="response_text" rows="2">${esc(ev.response_text || '')}</textarea></td>
      <td><select data-k="status" class="status-${ev.status}">${statuses.map((s) => `<option ${s === ev.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><span class="badge ${confClass(ev.confidence)}">${Math.round((ev.confidence || 0) * 100)}%</span></td>
      <td>${ev.needs_manual_review ? '<span class="review-pill">要確認</span>' : '<span class="badge hi">ok</span>'}</td>
      <td><button class="btn ghost del" title="delete">✕</button></td>`;
    tbody.appendChild(tr);
  });
  updatePoiStats();

  tbody.oninput = (e) => {
    const el = e.target;
    const tr = el.closest('tr'); if (!tr) return;
    const ev = state.poiEvents[Number(tr.dataset.i)];
    const k = el.dataset.k; if (!k) return;
    ev[k] = el.value;
    if (k === 'requester') tr.querySelector('.team-r').textContent = teamOf(el.value);
    if (k === 'target_speaker') tr.querySelector('.team-t').textContent = teamOf(el.value);
    if (k === 'status') el.className = 'status-' + el.value;
    ev.needs_manual_review = false;
    tr.classList.remove('needs-review');
    tr.querySelector('td:nth-child(8)').innerHTML = '<span class="badge hi">ok</span>';
  };
  tbody.onclick = (e) => {
    if (!e.target.classList.contains('del')) return;
    const tr = e.target.closest('tr');
    state.poiEvents.splice(Number(tr.dataset.i), 1);
    renderPois();
  };
}
function teamOf(label) {
  const s = state.speakers.find((x) => x.label === label);
  return s ? s.team : 'unknown';
}
function updatePoiStats() {
  const p = state.poiEvents;
  $('#poiStats').innerHTML =
    `<span>POIs: <b>${p.length}</b></span>` +
    `<span>Accepted: <b>${p.filter((e) => e.status === 'accepted').length}</b></span>` +
    `<span>Declined: <b>${p.filter((e) => e.status === 'declined').length}</b></span>` +
    `<span>Ignored: <b>${p.filter((e) => e.status === 'ignored').length}</b></span>` +
    `<span>Need review: <b>${p.filter((e) => e.needs_manual_review).length}</b></span>`;
}
function addPoiRow() {
  state.poiEvents.push({
    id: 'poi_manual_' + state.poiEvents.length,
    requester: null, target_speaker: null, question_text: '', response_text: null,
    status: 'accepted', requester_team: 'unknown', target_team: 'unknown',
    confidence: 1, needs_manual_review: false,
    evaluation: { relevance: null, challenge_strength: null, strategic_value: null, clarity: null, response_quality: null, comment: '' },
  });
  renderPois();
}

async function savePois(thenJudge) {
  const status = $('#poiStatus');
  status.innerHTML = '<span class="spin"></span> Saving…';
  try {
    // normalize empty response strings to null
    state.poiEvents.forEach((e) => { if (e.response_text === '') e.response_text = null; });
    const data = await api('PUT', `/api/session/${state.sessionId}/pois`, { poiEvents: state.poiEvents });
    state.poiEvents = data.poiEvents;
    status.textContent = '✓ saved';
    renderPois();
    if (thenJudge) doJudge();
  } catch (e) { status.textContent = '✗ ' + e.message; }
}

// ---- STEP 4: judge ---------------------------------------------------------
async function doJudge() {
  goStep(4);
  $('#result').innerHTML = '<div class="rfd"><span class="spin"></span> Judging… evaluating each POI and aggregating scores.</div>';
  try {
    const j = await api('POST', `/api/session/${state.sessionId}/judge`, { useLlm: $('#useLlm').checked });
    state.judgment = j;
    renderResult(j);
  } catch (e) {
    $('#result').innerHTML = `<div class="rfd">✗ ${esc(e.message)}</div>`;
  }
}

function renderResult(j) {
  const gov = state.config.governmentName, opp = state.config.oppositionName;
  const winClass = j.winner === gov ? 'gov' : j.winner === opp ? 'opp' : '';
  const relColor = { high: 'hi', medium: 'mid', low: 'lo' }[j.reliability] || 'mid';

  let html = `
    <div class="verdict">
      <div class="reliability">Winner / 勝敗</div>
      <div class="winner ${winClass}">${esc(j.winner)}</div>
      <div class="reliability">margin ${j.margin ?? '–'} · reliability
        <span class="badge ${relColor}">${j.reliability}</span>
        ${j.reviewNeeded ? `· ⚠️ ${j.reviewNeeded} POI(s) still need review` : ''}
        · <span class="badge mid">${esc(j.generatedBy)}</span></div>
    </div>`;

  if (j.reasonForDecision) html += `<div class="section-title">Reason for decision</div><div class="rfd">${esc(j.reasonForDecision)}</div>`;

  // team cards
  html += `<div class="section-title">Teams / チーム評価</div><div class="cards">`;
  ['government', 'opposition'].forEach((key) => {
    const t = j.teams && j.teams[key];
    if (!t) return;
    html += `<div class="card"><h3>${esc(t.team)}</h3>
      <div class="score">${t.overall ?? '–'}<span style="font-size:.9rem;color:var(--muted)">/5</span></div>
      <div class="metric"><span>Speaker avg</span><b>${t.speakerAverage ?? '–'}</b></div>
      <div class="metric"><span>POI offense (Q quality)</span><b>${t.poiOffense ?? '–'}</b></div>
      <div class="metric"><span>POI defense (response)</span><b>${t.poiDefense ?? '–'}</b></div>
    </div>`;
  });
  html += `</div>`;

  // speaker cards
  html += `<div class="section-title">Speakers / スピーカー評価</div><div class="cards">`;
  (j.speakers || []).forEach((s) => {
    html += `<div class="card"><h3>${esc(s.role || s.label)} <span style="font-size:.75rem;color:var(--muted)">${esc(s.team)}</span></h3>
      <div class="score">${s.score ?? '–'}<span style="font-size:.9rem;color:var(--muted)">/5</span></div>
      <div class="metric"><span>POI offered</span><b>${s.poi?.poiOffered ?? 0}</b></div>
      <div class="metric"><span>POI faced / answered</span><b>${s.poi?.poiReceived ?? 0} / ${s.poi?.poiAnswered ?? 0}</b></div>
      <div class="metric"><span>Avg Q / response quality</span><b>${s.poi?.avgQuestionQuality ?? '–'} / ${s.poi?.avgResponseQuality ?? '–'}</b></div>
      <p style="font-size:.82rem;color:var(--muted);margin:8px 0 0">${esc(s.comment || '')}</p>
    </div>`;
  });
  html += `</div>`;

  // POI evaluation table
  html += `<div class="section-title">POI evaluation / POI評価</div><div class="table-wrap"><table>
    <thead><tr><th>#</th><th>Requester → Target</th><th>Question</th><th>Status</th>
    <th>Rel</th><th>Chal</th><th>Strat</th><th>Clar</th><th>Resp</th><th>Comment</th></tr></thead><tbody>`;
  (j.poiEvents || []).forEach((e, i) => {
    const ev = e.evaluation || {};
    html += `<tr>
      <td>${i + 1}</td>
      <td>${esc(e.requester || '?')} <span style="color:var(--muted)">(${esc(e.requester_team)})</span><br>→ ${esc(e.target_speaker || '?')} <span style="color:var(--muted)">(${esc(e.target_team)})</span></td>
      <td>${esc(e.question_text || '—')}</td>
      <td><span class="status-${e.status}">${e.status}</span></td>
      <td>${fmt(ev.relevance)}</td><td>${fmt(ev.challenge_strength)}</td><td>${fmt(ev.strategic_value)}</td>
      <td>${fmt(ev.clarity)}</td><td>${fmt(ev.response_quality)}</td>
      <td style="min-width:220px;font-size:.8rem;color:var(--muted)">${esc(ev.comment || '')}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;

  // comments + educational feedback
  if (j.comments?.length) {
    html += `<div class="section-title">Judge comments / 改善コメント</div><ul class="list">${j.comments.map((c) => `<li>${mdBold(c)}</li>`).join('')}</ul>`;
  }
  if (j.educationalFeedback?.length) {
    html += `<div class="section-title">Educational feedback / 教育的フィードバック</div><ul class="list">${j.educationalFeedback.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
  }

  $('#result').innerHTML = html;
}
function fmt(n) { return n == null ? '<span style="color:var(--muted)">–</span>' : Number(n).toFixed(1); }
function mdBold(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }

function exportJson() {
  const blob = new Blob([JSON.stringify({ config: state.config, speakers: state.speakers, poiEvents: state.poiEvents, judgment: state.judgment }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'debate-judgment.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

init();
