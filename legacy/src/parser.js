// parser.js
// Turns a raw Zoom transcript (or pasted debate log) into structured data:
//   - utterances (with speaker label, text, classified type)
//   - speakers   (unique labels + inferred debate role / team + confidence)
//   - poiEvents  (structured POIEvent objects, the core of this system)
//
// Design goal: produce a reliable *draft* with NO external services, so the
// human-in-the-loop UI always has something to correct. An optional LLM layer
// (src/llm.js) can refine this draft when an API key is available.

// ---------------------------------------------------------------------------
// 1. Marker vocabularies (kept here so they are easy to tune)
// ---------------------------------------------------------------------------

const RE = {
  // A speaker offering a Point of Information.
  poiRequest: /\b(poi|points? of information|point of order|on that point|on your point|would you (take|accept|yield)|may i (ask|offer|come in|interject)|i have (a|an) (poi|point)|point,? (sir|madam)?)\b/i,
  // Very short standalone offers ("Information?", "POI?", "Information.").
  poiRequestShort: /^\s*(poi|information|point)\s*[.?!]*\s*$/i,

  // Floor holder accepting an offered POI.
  accept: /\b(accept(ed)?|yes,?\s*(please|go ahead|sure)?|go ahead|please (do|go ahead)?|i(?:'| wi)ll take (it|that|your point)|sure|of course|by all means)\b/i,
  // Floor holder declining an offered POI.
  decline: /\b(decline[d]?|no,?\s*thank(s| you)|not (now|right now|at (this|the) (time|moment))|i(?:'| wi)ll (continue|pass|come back)|maybe later|later,?\s*thank|no,?\s*thank you|not yet|hold that)\b/i,

  // Chair / moderator / timekeeper / adjudicator. Deliberately narrow —
  // phrases debaters commonly use ("this house", "the motion") are excluded
  // so an opening speech is not mistaken for a chair announcement.
  chair: /\b(i (now )?call upon|order,?\s*order|protected (time|minute)|welcome to (today'?s|the) debate|adjudicat|as (the|your) (chair|timekeeper|moderator)|next speaker,? please|time,?\s*speaker|your time (starts|is up)|floor is (yours|open)|we (now )?(move|turn) to the reply)\b/i,

  // Reply / summary speech announcement.
  reply: /\b(reply speech|summary speech|reply from|now (the|for the) reply)\b/i,

  question: /\?\s*$/,
};

// Words that hint the utterance is a *speaker role* (used to identify chair etc.)
const CHAIR_LABELS = /(chair|moderator|judge|adjudicat|timekeeper|host|facilitator|mc)\b/i;

// ---------------------------------------------------------------------------
// 2. Tokenizing raw text into utterances
// ---------------------------------------------------------------------------

// Recognizes several common shapes of a transcript line:
//   "Speaker 1: text"
//   "[00:01:23] Speaker 1: text"
//   "00:01:23 Speaker: text"
//   WebVTT blocks (timestamp line, then "Speaker: text")
//   plain lines with no label
const LABEL_LINE = /^\s*(?:\[?(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\]?\s+)?([A-Za-z0-9][^:]{0,40}?):\s*(.*\S)?\s*$/;
const TIMESTAMP_ONLY = /^\s*\[?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\]?\s*(?:-->\s*\d{1,2}:\d{2}.*)?$/;
const VTT_HEADER = /^\s*(WEBVTT|NOTE\b|Kind:|Language:).*/i;
const CUE_NUMBER = /^\s*\d+\s*$/;

export function tokenize(raw) {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
  const utterances = [];
  let pendingTime = null;
  let lastSpeaker = null;

  const push = (speaker, text, time) => {
    const clean = (text || '').trim();
    if (!clean) return;
    // Merge consecutive lines from the same speaker with no new label
    // (common in Zoom VTT where one sentence spans several cues).
    const prev = utterances[utterances.length - 1];
    if (prev && speaker === '__CONT__') {
      prev.text = (prev.text + ' ' + clean).trim();
      return;
    }
    const spk = speaker === '__CONT__' ? lastSpeaker : speaker;
    utterances.push({
      id: 'u' + utterances.length,
      index: utterances.length,
      rawSpeaker: spk || null,
      text: clean,
      time: time || null,
    });
    if (spk) lastSpeaker = spk;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    if (VTT_HEADER.test(line) || CUE_NUMBER.test(line)) continue;
    if (TIMESTAMP_ONLY.test(line)) {
      const m = line.match(/\d{1,2}:\d{2}(?::\d{2})?/);
      pendingTime = m ? m[0] : pendingTime;
      continue;
    }
    const m = line.match(LABEL_LINE);
    if (m && m[2]) {
      const time = m[1] || pendingTime;
      push(m[2].trim(), m[3] || '', time);
      pendingTime = null;
    } else {
      // No label: continuation of the previous speaker.
      push('__CONT__', line, pendingTime);
      pendingTime = null;
    }
  }
  return utterances;
}

// ---------------------------------------------------------------------------
// 3. Classifying utterances
// ---------------------------------------------------------------------------

function wordCount(t) {
  return (t.trim().match(/\S+/g) || []).length;
}

function isChairLabel(label) {
  return !!label && CHAIR_LABELS.test(label);
}

// Returns one of the classification categories the task asks for.
export function classifyUtterance(u, ctx = {}) {
  const t = u.text;
  const wc = wordCount(t);

  if (isChairLabel(u.rawSpeaker) || RE.chair.test(t)) return 'chair';
  if (RE.reply.test(t)) return 'reply_speech';

  const looksShort = wc <= 8;

  // Accept / decline only make sense when a POI is pending on the floor.
  if (ctx.poiPending) {
    if (looksShort && RE.decline.test(t)) return 'poi_decline';
    if (looksShort && RE.accept.test(t)) return 'poi_accept';
  }

  if (RE.poiRequestShort.test(t)) return 'poi_request';
  if (looksShort && RE.poiRequest.test(t)) return 'poi_request';
  // "I have a POI" style even if a bit longer.
  if (wc <= 14 && RE.poiRequest.test(t)) return 'poi_request';

  if (wc >= 25) return 'constructive_speech';
  if (wc <= 4 && !/[a-z]{4,}/i.test(t)) return 'noise';
  return wc >= 12 ? 'constructive_speech' : 'unclassified';
}

// ---------------------------------------------------------------------------
// 4. Building POIEvents (anchor-based state machine)
// ---------------------------------------------------------------------------
//
// A POI interaction generally looks like:
//   [request]  by the challenger      ("Point of information.")
//   [accept/decline] by floor holder  ("Accepted." / "No, thank you.")
//   [question] by the challenger       (only if accepted)
//   [response] by floor holder         (only if accepted)
//
// Zoom transcripts are messy, so we anchor on the most distinctive signals
// (accept/decline markers and explicit POI requests) and look around them.

const NEAR = 3; // how many utterances to look back for a request

function newPoiEvent(partial) {
  return {
    id: partial.id,
    requester: partial.requester ?? null,
    target_speaker: partial.target_speaker ?? null,
    question_text: partial.question_text ?? '',
    response_text: partial.response_text ?? null,
    status: partial.status ?? 'unclear', // accepted | declined | ignored | unclear
    requester_team: 'unknown',
    target_team: 'unknown',
    confidence: partial.confidence ?? 0.5,
    needs_manual_review: false,
    // source utterance indices, used by the UI to highlight / re-map
    _src: {
      requestIdx: partial.requestIdx ?? null,
      anchorIdx: partial.anchorIdx ?? null,
      questionIdx: partial.questionIdx ?? null,
      responseIdx: partial.responseIdx ?? null,
    },
    evaluation: {
      relevance: null,
      challenge_strength: null,
      strategic_value: null,
      clarity: null,
      response_quality: null,
      comment: '',
    },
  };
}

// Determine the "floor holder" (person giving the current speech) at each
// utterance index, based on the longest running speaker of substantive text.
function computeFloorHolders(utterances, types) {
  const floor = new Array(utterances.length).fill(null);
  let current = null;
  for (let i = 0; i < utterances.length; i++) {
    const t = types[i];
    if (t === 'constructive_speech' || t === 'reply_speech') {
      current = utterances[i].rawSpeaker || current;
    }
    floor[i] = current;
  }
  // Back-fill the very start (before the first speech was detected).
  let firstKnown = floor.find((x) => x);
  for (let i = 0; i < floor.length && !floor[i]; i++) floor[i] = firstKnown || null;
  return floor;
}

export function buildPoiEvents(utterances, types, floor) {
  const events = [];
  const consumed = new Set();
  let seq = 0;

  for (let j = 0; j < utterances.length; j++) {
    const t = types[j];
    if (t !== 'poi_accept' && t !== 'poi_decline') continue;

    const targetSpeaker = utterances[j].rawSpeaker || floor[j] || null;

    // Look back for the request (ideally a *different* speaker offering a POI).
    let requestIdx = null;
    for (let k = j - 1; k >= 0 && k >= j - NEAR; k--) {
      if (types[k] === 'poi_request' && utterances[k].rawSpeaker !== targetSpeaker) {
        requestIdx = k;
        break;
      }
    }
    // Fallback: when every line shares one label (Zoom "Participant"), the
    // request right before the accept belongs to this POI even though the
    // label matches — consume it so it is not double-counted as "ignored".
    if (requestIdx == null && types[j - 1] === 'poi_request') requestIdx = j - 1;
    const requester = requestIdx != null && utterances[requestIdx].rawSpeaker !== targetSpeaker
      ? utterances[requestIdx].rawSpeaker
      : null;

    const ev = newPoiEvent({
      id: 'poi' + seq++,
      requester,
      target_speaker: targetSpeaker,
      status: t === 'poi_accept' ? 'accepted' : 'declined',
      requestIdx,
      anchorIdx: j,
      confidence: requestIdx != null ? 0.8 : 0.55,
    });
    if (requestIdx != null) consumed.add(requestIdx);
    consumed.add(j);

    if (ev.status === 'accepted') {
      // Question: the next utterance by the requester (or nearest question).
      for (let k = j + 1; k < utterances.length && k <= j + NEAR; k++) {
        const isRequester = requester ? utterances[k].rawSpeaker === requester : utterances[k].rawSpeaker !== targetSpeaker;
        if (isRequester && types[k] !== 'poi_accept' && types[k] !== 'poi_decline') {
          ev.question_text = utterances[k].text;
          ev._src.questionIdx = k;
          consumed.add(k);
          // Response: the floor holder's next substantive utterance.
          for (let r = k + 1; r < utterances.length && r <= k + NEAR + 1; r++) {
            if (utterances[r].rawSpeaker === targetSpeaker) {
              ev.response_text = utterances[r].text;
              ev._src.responseIdx = r;
              consumed.add(r);
              break;
            }
          }
          break;
        }
      }
      // If the request line ITSELF carried the question ("POI: why is that
      // fair?"), use it — but not when it is just a bare marker ("POI?").
      if (!ev.question_text && requestIdx != null &&
          RE.question.test(utterances[requestIdx].text) &&
          !RE.poiRequestShort.test(utterances[requestIdx].text) &&
          wordCount(utterances[requestIdx].text) >= 4) {
        ev.question_text = utterances[requestIdx].text;
        ev._src.questionIdx = requestIdx;
      }
      // Positional fallback (e.g. every label is "Participant", so speaker
      // matching fails): after an accept, the very next line is usually the
      // question and the one after is the response. Draft it, but low-confidence
      // so the human confirms who said what.
      if (!ev.question_text && j + 1 < utterances.length && !consumed.has(j + 1) &&
          types[j + 1] !== 'poi_accept' && types[j + 1] !== 'poi_decline') {
        ev.question_text = utterances[j + 1].text;
        ev._src.questionIdx = j + 1;
        consumed.add(j + 1);
        if (j + 2 < utterances.length && !consumed.has(j + 2)) {
          ev.response_text = utterances[j + 2].text;
          ev._src.responseIdx = j + 2;
          consumed.add(j + 2);
        }
        ev.confidence = Math.min(ev.confidence, 0.4); // positional guess
      }
      if (!ev.question_text) ev.confidence = Math.min(ev.confidence, 0.5);
      if (!ev.response_text) ev.confidence = Math.min(ev.confidence, 0.55);
    }

    events.push(ev);
  }

  // Any POI request that never got an accept/decline anchor → ignored POI.
  for (let i = 0; i < utterances.length; i++) {
    if (types[i] !== 'poi_request' || consumed.has(i)) continue;
    const target = floor[i] || null;
    const ev = newPoiEvent({
      id: 'poi' + seq++,
      requester: utterances[i].rawSpeaker || null,
      target_speaker: target,
      question_text: RE.question.test(utterances[i].text) ? utterances[i].text : '',
      status: 'ignored',
      requestIdx: i,
      confidence: 0.5,
    });
    events.push(ev);
  }

  // Order by first source index so the table matches transcript order.
  events.sort((a, b) => (a._src.requestIdx ?? a._src.anchorIdx ?? 0) - (b._src.requestIdx ?? b._src.anchorIdx ?? 0));
  return events;
}

// ---------------------------------------------------------------------------
// 5. Speaker / team inference
// ---------------------------------------------------------------------------
//
// Zoom often gives useless labels ("Participant", "Speaker 1"). We infer a
// debate role for each distinct label and attach a confidence, so the UI can
// flag low-confidence ones for manual review.

function inferSpeakers(utterances, types, config) {
  const order = []; // distinct non-chair labels in first-appearance order
  const seen = new Map();
  for (let i = 0; i < utterances.length; i++) {
    const label = utterances[i].rawSpeaker;
    if (!label) continue;
    if (isChairLabel(label) || types[i] === 'chair') {
      if (!seen.has(label)) {
        seen.set(label, { label, role: 'Chair', team: 'neutral', confidence: 0.9 });
        order.push(label);
      }
      continue;
    }
    // A label counts as a "main speaker" once it gives a substantive speech.
    const substantive = types[i] === 'constructive_speech' || types[i] === 'reply_speech';
    if (!seen.has(label)) {
      seen.set(label, { label, role: null, team: 'unknown', confidence: 0.3, _speech: substantive });
      order.push(label);
    } else if (substantive) {
      seen.get(label)._speech = true;
    }
  }

  const perSide = Math.max(1, config?.speakersPerSide || 3);
  const govName = config?.governmentName || 'Government';
  const oppName = config?.oppositionName || 'Opposition';

  // Main speakers = labels that ever gave a substantive speech, in order.
  const mainSpeakers = order.filter((l) => seen.get(l)._speech);
  const distinctMain = mainSpeakers.length;

  // Heuristic: speeches alternate Gov, Opp, Gov, Opp ... Assign roles.
  const govLabel = (n) => `${govName} ${n}`;
  const oppLabel = (n) => `${oppName} ${n}`;

  if (distinctMain >= 2) {
    // Real distinct speakers → alternate sides, confidence moderate.
    let g = 0, o = 0;
    mainSpeakers.forEach((label, idx) => {
      const s = seen.get(label);
      if (idx % 2 === 0) {
        g += 1;
        s.team = govName;
        s.role = govLabel(g);
      } else {
        o += 1;
        s.team = oppName;
        s.role = oppLabel(o);
      }
      // If real names were used, alternation is a guess → medium confidence.
      s.confidence = 0.5;
    });
  } else if (distinctMain === 1) {
    // Everyone is "Participant" — a single label carries the whole debate.
    // We cannot separate speakers from labels alone; flag for review.
    const s = seen.get(mainSpeakers[0]);
    s.role = 'Unresolved (single label)';
    s.team = 'unknown';
    s.confidence = 0.15;
  }

  return order.map((l) => {
    const s = seen.get(l);
    return {
      label: s.label,
      role: s.role || 'unknown',
      team: s.team || 'unknown',
      confidence: s.confidence,
      needs_manual_review: (s.confidence ?? 0) < 0.5 && s.role !== 'Chair',
    };
  });
}

function teamForSpeaker(label, speakers) {
  if (!label) return 'unknown';
  const s = speakers.find((x) => x.label === label);
  return s ? s.team : 'unknown';
}

// ---------------------------------------------------------------------------
// 6. Top-level parse
// ---------------------------------------------------------------------------

export function parseTranscript(raw, config = {}) {
  const utterances = tokenize(raw);

  // First pass: classify with a rolling "is a POI pending?" context so that
  // "yes"/"no" are only read as accept/decline right after a request.
  const types = [];
  let poiPending = false;
  for (let i = 0; i < utterances.length; i++) {
    const type = classifyUtterance(utterances[i], { poiPending });
    types.push(type);
    if (type === 'poi_request') poiPending = true;
    else if (type === 'poi_accept' || type === 'poi_decline') poiPending = false;
    else if (type === 'constructive_speech' && poiPending) poiPending = false;
  }

  const floor = computeFloorHolders(utterances, types);
  const speakers = inferSpeakers(utterances, types, config);
  const poiEvents = buildPoiEvents(utterances, types, floor);

  // Attach team info + manual-review flags to each POI event.
  for (const ev of poiEvents) {
    ev.requester_team = teamForSpeaker(ev.requester, speakers);
    ev.target_team = teamForSpeaker(ev.target_speaker, speakers);
    const missing = !ev.requester || !ev.target_speaker ||
      (ev.status === 'accepted' && (!ev.question_text || !ev.response_text)) ||
      ev.requester_team === 'unknown' || ev.target_team === 'unknown';
    ev.needs_manual_review = ev.confidence < 0.6 || missing || ev.status === 'unclear';
  }

  // Attach classification back onto utterances for the UI.
  const utterancesOut = utterances.map((u, i) => ({
    ...u,
    type: types[i],
    floorHolder: floor[i],
  }));

  return {
    utterances: utterancesOut,
    speakers,
    poiEvents,
    config: {
      governmentName: config.governmentName || 'Government',
      oppositionName: config.oppositionName || 'Opposition',
      speakersPerSide: config.speakersPerSide || 3,
    },
    stats: {
      utteranceCount: utterancesOut.length,
      poiCount: poiEvents.length,
      accepted: poiEvents.filter((e) => e.status === 'accepted').length,
      declined: poiEvents.filter((e) => e.status === 'declined').length,
      ignored: poiEvents.filter((e) => e.status === 'ignored').length,
      needsReview: poiEvents.filter((e) => e.needs_manual_review).length,
    },
  };
}
