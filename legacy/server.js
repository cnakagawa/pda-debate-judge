// server.js — Debate Judge Bot API + static UI.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { parseTranscript } from './src/parser.js';
import { judge as ruleJudge } from './src/evaluate.js';
import * as store from './src/store.js';
import { llmAvailable, llmRefineParse, llmJudge } from './src/llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Health / capability ---------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, llm: llmAvailable(), model: process.env.CLAUDE_MODEL || 'claude-sonnet-5' });
});

// ---- Sample transcripts ----------------------------------------------------
app.get('/api/samples', (_req, res) => {
  const dir = path.join(__dirname, 'samples');
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));
    res.json(files.map((f) => ({
      name: f,
      title: f.replace(/\.txt$/, '').replace(/_/g, ' '),
    })));
  } catch {
    res.json([]);
  }
});
app.get('/api/samples/:name', (req, res) => {
  const safe = path.basename(req.params.name);
  const file = path.join(__dirname, 'samples', safe);
  if (!file.endsWith('.txt') || !fs.existsSync(file)) return res.status(404).json({ error: 'not found' });
  res.type('text/plain').send(fs.readFileSync(file, 'utf8'));
});

// ---- Parse a transcript into a session -------------------------------------
// Body: { transcript, config?, useLlm? }
app.post('/api/parse', async (req, res) => {
  try {
    const { transcript, config = {}, useLlm = true } = req.body || {};
    if (!transcript || !String(transcript).trim()) {
      return res.status(400).json({ error: 'transcript is required' });
    }
    const parsed = parseTranscript(transcript, config);
    let refinedBy = 'heuristic';

    if (useLlm && llmAvailable()) {
      const refined = await llmRefineParse(transcript, parsed, parsed.config);
      if (refined) {
        if (Array.isArray(refined.speakers) && refined.speakers.length) {
          parsed.speakers = mergeSpeakers(parsed.speakers, refined.speakers);
        }
        if (Array.isArray(refined.poiEvents) && refined.poiEvents.length) {
          parsed.poiEvents = mergePoiEvents(parsed.poiEvents, refined.poiEvents);
        }
        refinedBy = 'heuristic+llm';
      }
    }

    const session = store.createSession({ ...parsed, rawTranscript: transcript }, { refinedBy });
    res.json({ sessionId: session.id, refinedBy, llmAvailable: llmAvailable(), ...publicView(session) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ---- Read a session --------------------------------------------------------
app.get('/api/session/:id', (req, res) => {
  const s = store.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(publicView(s));
});

// ---- Save edited speakers --------------------------------------------------
app.put('/api/session/:id/speakers', (req, res) => {
  const { speakers } = req.body || {};
  if (!Array.isArray(speakers)) return res.status(400).json({ error: 'speakers array required' });
  const s = store.replaceSpeakers(req.params.id, speakers);
  if (!s) return res.status(404).json({ error: 'session not found' });
  // Re-derive team labels on POI events from the corrected speakers.
  syncPoiTeams(s);
  store.replacePoiEvents(s.id, s.poiEvents);
  res.json(publicView(store.getSession(s.id)));
});

// ---- Save edited POI events ------------------------------------------------
app.put('/api/session/:id/pois', (req, res) => {
  const { poiEvents } = req.body || {};
  if (!Array.isArray(poiEvents)) return res.status(400).json({ error: 'poiEvents array required' });
  const s = store.replacePoiEvents(req.params.id, poiEvents);
  if (!s) return res.status(404).json({ error: 'session not found' });
  syncPoiTeams(s);
  store.replacePoiEvents(s.id, s.poiEvents);
  res.json(publicView(store.getSession(s.id)));
});

// ---- Patch a single POI event ----------------------------------------------
app.patch('/api/session/:id/pois/:poiId', (req, res) => {
  const ev = store.updatePoiEvent(req.params.id, req.params.poiId, req.body || {});
  if (!ev) return res.status(404).json({ error: 'not found' });
  res.json(ev);
});

// ---- Run / re-run the judgment ---------------------------------------------
// Body: { useLlm? }
app.post('/api/session/:id/judge', async (req, res) => {
  const s = store.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const useLlm = (req.body || {}).useLlm !== false;

  try {
    // Always compute the transparent rule-based judgment first.
    const base = ruleJudge(s);
    let judgment = base;

    if (useLlm && llmAvailable()) {
      const llm = await llmJudge(s, s.config);
      if (llm) judgment = mergeJudgment(base, llm);
    }

    store.updateSession(s.id, { poiEvents: base.poiEvents, judgment });
    res.json(judgment);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function publicView(s) {
  return {
    sessionId: s.id,
    config: s.config,
    utterances: s.utterances,
    speakers: s.speakers,
    poiEvents: s.poiEvents,
    stats: s.stats,
    judgment: s.judgment || null,
    meta: s.meta || {},
  };
}

// When speakers are re-labelled, recompute requester_team / target_team.
function syncPoiTeams(s) {
  const teamOf = (label) => {
    if (!label) return 'unknown';
    const sp = (s.speakers || []).find((x) => x.label === label);
    return sp ? sp.team : 'unknown';
  };
  for (const ev of s.poiEvents || []) {
    ev.requester_team = teamOf(ev.requester);
    ev.target_team = teamOf(ev.target_speaker);
  }
}

function mergeSpeakers(base, llm) {
  const byLabel = new Map(base.map((s) => [s.label, s]));
  for (const r of llm) {
    if (!r.label) continue;
    const existing = byLabel.get(r.label) || { label: r.label };
    byLabel.set(r.label, {
      ...existing,
      role: r.role ?? existing.role,
      team: r.team ?? existing.team,
      confidence: r.confidence ?? existing.confidence,
      needs_manual_review: r.needs_manual_review ?? existing.needs_manual_review,
    });
  }
  return Array.from(byLabel.values());
}

function mergePoiEvents(base, llm) {
  // Prefer LLM structure but keep the heuristic _src mapping when ids match.
  const byId = new Map(base.map((e) => [e.id, e]));
  return llm.map((r, i) => {
    const b = byId.get(r.id) || base[i] || {};
    return {
      id: r.id || b.id || 'poi' + i,
      requester: r.requester ?? b.requester ?? null,
      target_speaker: r.target_speaker ?? b.target_speaker ?? null,
      question_text: r.question_text ?? b.question_text ?? '',
      response_text: r.response_text ?? b.response_text ?? null,
      status: r.status ?? b.status ?? 'unclear',
      requester_team: r.requester_team ?? b.requester_team ?? 'unknown',
      target_team: r.target_team ?? b.target_team ?? 'unknown',
      confidence: r.confidence ?? b.confidence ?? 0.5,
      needs_manual_review: r.needs_manual_review ?? b.needs_manual_review ?? false,
      _src: b._src || {},
      evaluation: b.evaluation || { relevance: null, challenge_strength: null, strategic_value: null, clarity: null, response_quality: null, comment: '' },
    };
  });
}

function mergeJudgment(base, llm) {
  // Layer the LLM's richer text/scores over the rule-based skeleton.
  const poiById = new Map((llm.poiEvaluations || []).map((p) => [p.id, p]));
  const poiEvents = base.poiEvents.map((e) => {
    const p = poiById.get(e.id);
    if (!p) return e;
    return { ...e, evaluation: { ...e.evaluation, ...p, comment: p.comment ?? e.evaluation.comment } };
  });

  const spById = new Map((llm.speakers || []).map((s) => [s.label, s]));
  const speakers = base.speakers.map((s) => {
    const l = spById.get(s.label);
    return l ? { ...s, score: l.score ?? s.score, comment: l.comment ?? s.comment } : s;
  });

  return {
    ...base,
    winner: llm.winner ?? base.winner,
    margin: llm.margin ?? base.margin,
    reasonForDecision: llm.reasonForDecision || null,
    poiEvents,
    speakers,
    comments: (llm.comments && llm.comments.length ? llm.comments : base.comments),
    educationalFeedback: (llm.educationalFeedback && llm.educationalFeedback.length ? llm.educationalFeedback : base.educationalFeedback),
    teams: base.teams,
    llmTeams: llm.teams || null,
    poiSummary: base.poiSummary,
    generatedBy: 'rule-based+llm',
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Debate Judge Bot running on http://0.0.0.0:${PORT}  (LLM: ${llmAvailable() ? 'on' : 'off — rule-based mode'})`);
});
