// llm.js
// Optional Claude enhancement layer. Everything here is best-effort: if there
// is no API key, or the call fails, callers fall back to the rule-based path.
//
// Enable by setting ANTHROPIC_API_KEY (and optionally CLAUDE_MODEL) in the
// environment / Replit Secrets.

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

export function llmAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function callClaude({ system, user, maxTokens = 4000, temperature = 0.2 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('no_api_key');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`claude_http_${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  return text;
}

// Pull a JSON object/array out of a model reply, tolerating code fences / prose.
function extractJson(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // Find the first balanced { … } or [ … ].
  const start = t.search(/[[{]/);
  if (start === -1) return null;
  const open = t[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === open) depth++;
    else if (t[i] === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Refine the heuristic parse: better speaker attribution + POI extraction.
// Returns { speakers?, poiEvents? } or null on failure.
// ---------------------------------------------------------------------------

export async function llmRefineParse(rawTranscript, draft, config) {
  if (!llmAvailable()) return null;
  const system = `You are an expert parliamentary-debate adjudicator and a careful transcript analyst.
You are given a messy Zoom transcript of an English impromptu debate and a heuristic DRAFT of its structure.
Zoom often mislabels speakers (e.g. everyone shows as "Participant"). Your job is to correct the DRAFT.
Return ONLY JSON, no prose.`;

  const user = `MOTION/CONFIG: Government="${config.governmentName}", Opposition="${config.oppositionName}", speakers per side=${config.speakersPerSide}.

RAW TRANSCRIPT:
"""
${rawTranscript.slice(0, 12000)}
"""

HEURISTIC DRAFT (speakers + POI events):
${JSON.stringify({ speakers: draft.speakers, poiEvents: draft.poiEvents.map(stripEval) }, null, 1).slice(0, 8000)}

TASK:
1. Re-attribute speakers to debate roles when the transcript makes it inferable (order of speeches, who holds the floor, chair/moderator lines). Keep the same "label" values.
2. Correct each POIEvent: who requested it, who it targeted, the exact question_text and response_text, and status (accepted/declined/ignored/unclear). Add any POIs the draft missed; remove false positives.
3. Set a realistic confidence (0..1) and needs_manual_review (true when you are genuinely unsure — do NOT hide uncertainty).

Return JSON of shape:
{
  "speakers": [{"label": string, "role": string, "team": "${config.governmentName}"|"${config.oppositionName}"|"neutral"|"unknown", "confidence": number, "needs_manual_review": boolean}],
  "poiEvents": [{"id": string, "requester": string|null, "target_speaker": string|null, "question_text": string, "response_text": string|null, "status": "accepted"|"declined"|"ignored"|"unclear", "requester_team": string, "target_team": string, "confidence": number, "needs_manual_review": boolean}]
}`;

  try {
    const text = await callClaude({ system, user, maxTokens: 4000, temperature: 0.1 });
    const json = extractJson(text);
    if (!json) return null;
    return json;
  } catch (e) {
    console.warn('[llm] refine failed:', e.message);
    return null;
  }
}

function stripEval(ev) {
  const { evaluation, _src, ...rest } = ev;
  return rest;
}

// ---------------------------------------------------------------------------
// Rich POI + speech evaluation and judge comments.
// Returns an object merged over the rule-based judgment, or null on failure.
// ---------------------------------------------------------------------------

export async function llmJudge(parsed, config) {
  if (!llmAvailable()) return null;
  const system = `You are a highly experienced parliamentary-debate adjudicator (Asian/British Parliamentary & PDA style).
Judge fairly on matter (argument), manner (delivery) and method (structure), and pay special attention to POIs.
Score POIs on: relevance to the clash, strength of the challenge, clarity/brevity, strategic value, and — if answered — the response quality.
Be constructive and educational. Return ONLY JSON.`;

  const compactPois = parsed.poiEvents.map((e) => ({
    id: e.id, requester: e.requester, requester_team: e.requester_team,
    target_speaker: e.target_speaker, target_team: e.target_team,
    status: e.status, question_text: e.question_text, response_text: e.response_text,
  }));
  const speeches = parsed.utterances
    .filter((u) => u.type === 'constructive_speech' || u.type === 'reply_speech')
    .map((u) => ({ speaker: u.rawSpeaker, type: u.type, text: u.text.slice(0, 800) }));

  const user = `CONFIG: Government="${config.governmentName}", Opposition="${config.oppositionName}".

SPEAKERS: ${JSON.stringify(parsed.speakers)}

SPEECHES: ${JSON.stringify(speeches).slice(0, 9000)}

POI EVENTS: ${JSON.stringify(compactPois).slice(0, 6000)}

Return JSON:
{
  "winner": "${config.governmentName}"|"${config.oppositionName}"|"tie",
  "margin": number,               // 0..5, size of the win
  "reasonForDecision": string,    // 2-4 sentences, the RFD
  "poiEvaluations": [{"id": string, "relevance": 0-5, "challenge_strength": 0-5, "strategic_value": 0-5, "clarity": 0-5, "response_quality": 0-5|null, "comment": string}],
  "speakers": [{"label": string, "score": 0-5, "comment": string}],
  "teams": [{"team": string, "overall": 0-5, "comment": string}],
  "comments": [string],           // judge comments / key moments
  "educationalFeedback": [string] // concrete coaching tips
}`;

  try {
    const text = await callClaude({ system, user, maxTokens: 5000, temperature: 0.3 });
    const json = extractJson(text);
    if (!json) return null;
    return json;
  } catch (e) {
    console.warn('[llm] judge failed:', e.message);
    return null;
  }
}
