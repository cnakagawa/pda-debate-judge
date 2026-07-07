// evaluate.js
// Rule-based POI evaluation and final debate judgment.
//
// These heuristics are deliberately transparent and run with no external
// service, so the app produces a usable judgment offline. When an API key is
// configured, src/llm.js replaces the comments/scores with far richer output;
// the rule-based path is the always-available fallback and safety net.

function words(t) {
  return (String(t || '').toLowerCase().match(/[a-z']+/g) || []);
}
function wordCount(t) {
  return words(t).length;
}
function clamp(n, lo = 0, hi = 5) {
  return Math.max(lo, Math.min(hi, n));
}
function round1(n) {
  return Math.round(n * 10) / 10;
}

const STOP = new Set(('the a an and or but of to in on for is are be that this it as we you they i he she our your their with will would should can may not no do does did have has had').split(' '));

function contentWords(t) {
  return words(t).filter((w) => w.length > 3 && !STOP.has(w));
}

function overlap(a, b) {
  const sa = new Set(contentWords(a));
  const sb = new Set(contentWords(b));
  if (!sa.size || !sb.size) return 0;
  let hit = 0;
  for (const w of sa) if (sb.has(w)) hit++;
  return hit / sa.size;
}

const CHALLENGE = /\b(but|however|isn'?t it|contradict|weakness|wrong|false|fail|ignore|evidence|prove|why|how (can|do|does|would)|surely|actually|in fact|no evidence|unfair|inconsistent|flaw|assume|assumption|really)\b/i;
const DIRECT_ANSWER = /\b(yes|no|because|the reason|that('?s| is) (why|because)|to answer|the answer|our (point|argument) (is|stands)|as i said|precisely|correct|incorrect|first|actually)\b/i;

// ---------------------------------------------------------------------------
// POI evaluation
// ---------------------------------------------------------------------------

export function evaluatePoi(ev, ctx = {}) {
  const q = ev.question_text || '';
  const floorText = ctx.floorText || '';

  const evalOut = {
    relevance: 0,
    challenge_strength: 0,
    strategic_value: 0,
    clarity: 0,
    response_quality: null,
    comment: '',
  };

  if (!q) {
    evalOut.comment = ev.status === 'ignored'
      ? 'POI was offered but not taken; no question content to assess. An ignored POI can still pressure the speaker, but repeated refusals may look evasive.'
      : 'No question text captured. Please confirm the transcript mapping before scoring.';
    // Give minimal signal for ignored/declined so aggregation still works.
    if (ev.status === 'ignored' || ev.status === 'declined') {
      evalOut.relevance = 2; evalOut.challenge_strength = 2;
      evalOut.strategic_value = 2; evalOut.clarity = 2;
    }
    ev.evaluation = evalOut;
    return ev;
  }

  // Relevance: content overlap with the speech being interrupted + is-it-a-question.
  const ov = overlap(q, floorText);
  evalOut.relevance = clamp(1.5 + ov * 5 + (/\?$/.test(q.trim()) ? 0.8 : 0));

  // Challenge strength: does it push on a weakness?
  const challengeHits = (q.match(CHALLENGE) || []).length;
  evalOut.challenge_strength = clamp(1.5 + challengeHits * 1.3);

  // Clarity: short and single-sentence scores high; rambling scores low.
  const wc = wordCount(q);
  const sentences = (q.match(/[.?!]+/g) || []).length || 1;
  let clarity = 5;
  if (wc > 25) clarity -= (wc - 25) / 8;
  if (sentences > 1) clarity -= (sentences - 1) * 1.2;
  evalOut.clarity = clamp(round1(clarity), 1);

  // Strategic value: relevance + challenge, lightly rewarded for being pointed.
  evalOut.strategic_value = clamp(round1((evalOut.relevance + evalOut.challenge_strength) / 2 + (challengeHits ? 0.5 : 0)));

  // Response quality: only if the POI was accepted and answered.
  if (ev.status === 'accepted' && ev.response_text) {
    const r = ev.response_text;
    const addressesQ = overlap(q, r);
    const direct = DIRECT_ANSWER.test(r) ? 1 : 0;
    const defends = wordCount(r) >= 8 ? 1 : 0; // gave a real answer, not a brush-off
    evalOut.response_quality = clamp(round1(1 + addressesQ * 4 + direct + defends * 0.8));
  } else if (ev.status === 'accepted' && !ev.response_text) {
    evalOut.response_quality = 1; // accepted but no answer captured / no real answer
  } else {
    evalOut.response_quality = null; // declined / ignored → not applicable
  }

  evalOut.comment = buildPoiComment(ev, evalOut);
  ev.evaluation = evalOut;
  return ev;
}

function buildPoiComment(ev, e) {
  const bits = [];
  bits.push(e.relevance >= 3.5 ? 'On-topic and engages the speech directly.'
    : e.relevance >= 2 ? 'Loosely connected to the argument on the floor.'
    : 'Weak link to the point being made.');
  bits.push(e.challenge_strength >= 3.5 ? 'Presses on a genuine weakness.'
    : e.challenge_strength >= 2 ? 'Mild challenge; could target the clash harder.'
    : 'More of a clarification than an attack.');
  bits.push(e.clarity >= 4 ? 'Crisp and easy to answer under pressure.'
    : e.clarity >= 2.5 ? 'Understandable but could be tighter.'
    : 'Too long/complex for a POI — trim to one sharp question.');
  if (ev.status === 'accepted') {
    if (e.response_quality == null || e.response_quality <= 1.5) bits.push('The speaker did not really answer it — an opening for the other side.');
    else if (e.response_quality >= 3.5) bits.push('The speaker answered directly and defended the case well.');
    else bits.push('The speaker partly addressed it but left room for follow-up.');
  } else if (ev.status === 'declined') {
    bits.push('Declined — reasonable if time was short, but the pressure still lands.');
  } else if (ev.status === 'ignored') {
    bits.push('Ignored — repeated refusals can read as evasive to a judge.');
  }
  return bits.join(' ');
}

// ---------------------------------------------------------------------------
// Aggregate POI stats per speaker & team
// ---------------------------------------------------------------------------

export function aggregatePoi(poiEvents, speakers) {
  const bySpeaker = {};
  const ensure = (label) => {
    if (!label) return null;
    if (!bySpeaker[label]) {
      bySpeaker[label] = {
        label,
        offered: 0, accepted_by_opp: 0,
        received: 0, answered: 0, declined: 0, ignored: 0,
        avgQuestionQuality: [], avgResponseQuality: [],
      };
    }
    return bySpeaker[label];
  };

  for (const ev of poiEvents) {
    const req = ensure(ev.requester);
    const tgt = ensure(ev.target_speaker);
    const e = ev.evaluation || {};
    const qQuality = e.relevance != null
      ? (e.relevance + e.challenge_strength + e.strategic_value + e.clarity) / 4
      : null;
    if (req) {
      req.offered += 1;
      if (qQuality != null) req.avgQuestionQuality.push(qQuality);
    }
    if (tgt) {
      tgt.received += 1;
      if (ev.status === 'accepted') tgt.answered += 1;
      if (ev.status === 'declined') tgt.declined += 1;
      if (ev.status === 'ignored') tgt.ignored += 1;
      if (e.response_quality != null) tgt.avgResponseQuality.push(e.response_quality);
    }
  }

  const avg = (a) => (a.length ? round1(a.reduce((s, x) => s + x, 0) / a.length) : null);
  const speakerRows = Object.values(bySpeaker).map((s) => ({
    label: s.label,
    team: (speakers.find((x) => x.label === s.label) || {}).team || 'unknown',
    role: (speakers.find((x) => x.label === s.label) || {}).role || 'unknown',
    poiOffered: s.offered,
    poiReceived: s.received,
    poiAnswered: s.answered,
    poiDeclined: s.declined,
    poiIgnored: s.ignored,
    avgQuestionQuality: avg(s.avgQuestionQuality),
    avgResponseQuality: avg(s.avgResponseQuality),
  }));

  const teams = {};
  for (const row of speakerRows) {
    const t = row.team || 'unknown';
    if (!teams[t]) teams[t] = { team: t, offered: 0, received: 0, answered: 0, declined: 0, ignored: 0, q: [], r: [] };
    teams[t].offered += row.poiOffered;
    teams[t].received += row.poiReceived;
    teams[t].answered += row.poiAnswered;
    teams[t].declined += row.poiDeclined;
    teams[t].ignored += row.poiIgnored;
    if (row.avgQuestionQuality != null) teams[t].q.push(row.avgQuestionQuality);
    if (row.avgResponseQuality != null) teams[t].r.push(row.avgResponseQuality);
  }
  const teamRows = Object.values(teams).map((t) => ({
    team: t.team,
    poiOffered: t.offered,
    poiReceived: t.received,
    poiAnswered: t.answered,
    poiDeclined: t.declined,
    poiIgnored: t.ignored,
    avgQuestionQuality: avg(t.q),
    avgResponseQuality: avg(t.r),
  }));

  return { speakerRows, teamRows };
}

// ---------------------------------------------------------------------------
// Final judgment (rule-based)
// ---------------------------------------------------------------------------

export function judge(parsed) {
  const { poiEvents, speakers, utterances, config } = parsed;

  // Evaluate every POI (idempotent — safe to re-run after manual edits).
  for (const ev of poiEvents) {
    const floorText = findFloorText(ev, utterances);
    evaluatePoi(ev, { floorText });
  }

  const { speakerRows, teamRows } = aggregatePoi(poiEvents, speakers);

  // Rough speech quality per speaker from transcript signals (length, POIs
  // taken, engagement). This is intentionally coarse without an LLM.
  const speechStats = {};
  for (const u of utterances) {
    if (u.type !== 'constructive_speech' && u.type !== 'reply_speech') continue;
    const l = u.rawSpeaker;
    if (!l) continue;
    speechStats[l] = speechStats[l] || { totalWords: 0, turns: 0 };
    speechStats[l].totalWords += wordCount(u.text);
    speechStats[l].turns += 1;
  }

  const govName = config.governmentName;
  const oppName = config.oppositionName;

  const speakerScores = speakerRows.map((row) => {
    const ss = speechStats[row.label] || { totalWords: 0 };
    // Content score proxy: substance (words), capped; POI engagement bonus.
    const substance = clamp(2.2 + Math.min(ss.totalWords, 400) / 130, 1, 5);
    const poiOffenseBonus = row.avgQuestionQuality != null ? (row.avgQuestionQuality - 2.5) * 0.4 : 0;
    const poiDefenseBonus = row.avgResponseQuality != null ? (row.avgResponseQuality - 2.5) * 0.4 : 0;
    const evasionPenalty = row.poiIgnored * 0.2 + row.poiDeclined * 0.1;
    const score = clamp(round1(substance + poiOffenseBonus + poiDefenseBonus - evasionPenalty), 1, 5);
    return {
      label: row.label,
      role: row.role,
      team: row.team,
      score,          // 1..5
      matterManner: {
        substance: round1(substance),
        poiOffense: row.avgQuestionQuality,
        poiDefense: row.avgResponseQuality,
      },
      poi: row,
      comment: speakerComment(row),
    };
  });

  const teamScore = (teamName) => {
    const members = speakerScores.filter((s) => s.team === teamName);
    if (!members.length) return null;
    const speechAvg = members.reduce((a, s) => a + s.score, 0) / members.length;
    const teamPoi = teamRows.find((t) => t.team === teamName) || {};
    return {
      team: teamName,
      speakerAverage: round1(speechAvg),
      poiOffense: teamPoi.avgQuestionQuality,
      poiDefense: teamPoi.avgResponseQuality,
      // Overall weights speech heavily, POI as the tie-relevant margin.
      overall: round1(speechAvg + ((teamPoi.avgQuestionQuality || 2.5) - 2.5) * 0.25 + ((teamPoi.avgResponseQuality || 2.5) - 2.5) * 0.2),
      members,
    };
  };

  const gov = teamScore(govName);
  const opp = teamScore(oppName);

  let winner = 'undecided';
  let margin = 0;
  if (gov && opp) {
    margin = round1(Math.abs(gov.overall - opp.overall));
    winner = gov.overall === opp.overall ? 'tie' : gov.overall > opp.overall ? govName : oppName;
  } else if (gov) winner = govName;
  else if (opp) winner = oppName;

  const reviewNeeded = poiEvents.filter((e) => e.needs_manual_review).length;

  return {
    winner,
    margin,
    reliability: reviewNeeded === 0 ? 'high' : reviewNeeded <= 2 ? 'medium' : 'low',
    reviewNeeded,
    teams: { government: gov, opposition: opp },
    speakers: speakerScores,
    poiSummary: { speakerRows, teamRows },
    poiEvents,
    comments: buildJudgeComments({ gov, opp, winner, margin, speakerScores, teamRows, reviewNeeded }),
    educationalFeedback: buildEducationalFeedback(speakerScores, poiEvents),
    generatedBy: 'rule-based',
  };
}

function findFloorText(ev, utterances) {
  // Concatenate the target speaker's speech near the POI for relevance scoring.
  const idx = ev._src?.anchorIdx ?? ev._src?.requestIdx ?? 0;
  const target = ev.target_speaker;
  let text = '';
  for (let i = Math.max(0, idx - 4); i < Math.min(utterances.length, idx + 2); i++) {
    if (utterances[i].rawSpeaker === target &&
        (utterances[i].type === 'constructive_speech' || utterances[i].type === 'reply_speech')) {
      text += ' ' + utterances[i].text;
    }
  }
  return text.trim();
}

function speakerComment(row) {
  const parts = [];
  if (row.poiOffered > 0) {
    parts.push(`Offered ${row.poiOffered} POI${row.poiOffered > 1 ? 's' : ''}` +
      (row.avgQuestionQuality != null ? ` (avg quality ${row.avgQuestionQuality}/5)` : '') + '.');
  } else {
    parts.push('Offered no POIs — engage the other bench more to score interaction points.');
  }
  if (row.poiReceived > 0) {
    parts.push(`Faced ${row.poiReceived} POI${row.poiReceived > 1 ? 's' : ''}: answered ${row.poiAnswered}, declined ${row.poiDeclined}, ignored ${row.poiIgnored}` +
      (row.avgResponseQuality != null ? `, avg response ${row.avgResponseQuality}/5` : '') + '.');
    if (row.poiIgnored >= 2) parts.push('Taking at least one POI would look more confident.');
  }
  return parts.join(' ');
}

function buildJudgeComments({ gov, opp, winner, margin, teamRows, reviewNeeded }) {
  const lines = [];
  if (winner === 'tie') lines.push('This is scored as a tie on the available signals — the POI margin did not separate the teams.');
  else if (winner === 'undecided') lines.push('Not enough resolved speaker/team data to declare a winner. Confirm the speaker mapping and re-run.');
  else lines.push(`On balance the debate goes to **${winner}** by a ${margin <= 0.3 ? 'narrow' : margin <= 0.8 ? 'clear' : 'decisive'} margin (${margin} pts).`);

  const gPoi = teamRows.find((t) => t.team === (gov && gov.team)) || {};
  const oPoi = teamRows.find((t) => t.team === (opp && opp.team)) || {};
  lines.push(`POI battle — Government offered ${gPoi.poiOffered || 0} / answered ${gPoi.poiAnswered || 0}; Opposition offered ${oPoi.poiOffered || 0} / answered ${oPoi.poiAnswered || 0}.`);
  if (reviewNeeded > 0) lines.push(`⚠️ ${reviewNeeded} POI event(s) still need manual confirmation — the result may change after you correct them.`);
  return lines;
}

function buildEducationalFeedback(speakerScores, poiEvents) {
  const tips = [];
  const anyOffered = poiEvents.some((e) => e.requester);
  if (!anyOffered) tips.push('No POIs were clearly detected. In parliamentary debate, offering 2–3 sharp POIs per speech is expected — it shows engagement and scores interaction points.');
  const weakClarity = poiEvents.filter((e) => (e.evaluation?.clarity ?? 5) < 2.5).length;
  if (weakClarity) tips.push(`${weakClarity} POI(s) were too long. A good POI is one sentence: "Isn't it true that…?" — quotable and hard to dodge.`);
  const ignored = poiEvents.filter((e) => e.status === 'ignored').length;
  if (ignored >= 2) tips.push('Several POIs were ignored. Accepting one or two per speech is strategically safer than refusing all of them.');
  const strong = poiEvents.filter((e) => (e.evaluation?.challenge_strength ?? 0) >= 3.5).length;
  if (strong) tips.push(`${strong} POI(s) landed a real challenge — good instinct for attacking the clash rather than asking for clarification.`);
  tips.push('Remember: a POI should target the *link* in your opponent\'s argument (why A leads to B), not just the claim.');
  return tips;
}
