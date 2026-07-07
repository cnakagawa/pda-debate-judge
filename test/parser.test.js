// Tests for the POI detection pipeline. Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { parseTranscript, tokenize, classifyUtterance } from '../src/parser.js';
import { judge } from '../src/evaluate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sample = (f) => fs.readFileSync(path.join(__dirname, '..', 'samples', f), 'utf8');

test('tokenize handles "Speaker: text" lines', () => {
  const u = tokenize('Government 1: Hello there.\nOpposition 1: Point of information.');
  assert.equal(u.length, 2);
  assert.equal(u[0].rawSpeaker, 'Government 1');
  assert.equal(u[1].text, 'Point of information.');
});

test('tokenize merges continuation lines from the same speaker', () => {
  const u = tokenize('Aiko: This is a long\nsentence split across lines.');
  assert.equal(u.length, 1);
  assert.match(u[0].text, /long sentence split/);
});

test('tokenize strips WebVTT headers, cue numbers and timestamps', () => {
  const u = tokenize('WEBVTT\n\n1\n00:00:03.120 --> 00:00:07.400\nBen: Hi.');
  assert.equal(u.length, 1);
  assert.equal(u[0].rawSpeaker, 'Ben');
  assert.equal(u[0].text, 'Hi.');
});

test('classifyUtterance detects POI requests and accepts', () => {
  assert.equal(classifyUtterance({ text: 'Point of information.' }), 'poi_request');
  assert.equal(classifyUtterance({ text: 'POI?' }), 'poi_request');
  assert.equal(classifyUtterance({ text: 'Accepted.' }, { poiPending: true }), 'poi_accept');
  assert.equal(classifyUtterance({ text: 'No, thank you.' }, { poiPending: true }), 'poi_decline');
});

test('named transcript: builds accepted POI as a structured event', () => {
  const parsed = parseTranscript(sample('1_named_speakers.txt'), {});
  assert.ok(parsed.poiEvents.length >= 3, 'should find several POIs');

  // The first POI: Opposition 1 asks Government 1, accepted, with Q and A.
  const first = parsed.poiEvents[0];
  assert.equal(first.requester, 'Opposition 1');
  assert.equal(first.target_speaker, 'Government 1');
  assert.equal(first.status, 'accepted');
  assert.match(first.question_text, /low-income families/);
  assert.ok(first.response_text && first.response_text.length > 0, 'has a response');
});

test('named transcript: detects a declined POI', () => {
  const parsed = parseTranscript(sample('1_named_speakers.txt'), {});
  const declined = parsed.poiEvents.find((e) => e.status === 'declined');
  assert.ok(declined, 'a POI was declined ("No, thank you, I will continue")');
});

test('partial "Participant" transcript still produces POI events with review flags', () => {
  const parsed = parseTranscript(sample('2_partial_participant.txt'), {});
  assert.ok(parsed.poiEvents.length >= 2);
  // Single-label transcript → speaker resolution is unreliable → flagged.
  const flagged = parsed.poiEvents.filter((e) => e.needs_manual_review);
  assert.ok(flagged.length >= 1, 'low-confidence POIs must be flagged for review');
  // An ignored POI ("Information." then "No thank you, I'll continue").
  assert.ok(parsed.poiEvents.some((e) => e.status === 'ignored' || e.status === 'declined'));
});

test('noisy Zoom VTT: parses speakers and an ignored POI', () => {
  const parsed = parseTranscript(sample('3_noisy_zoom_vtt.txt'), {});
  const labels = parsed.speakers.map((s) => s.label);
  assert.ok(labels.includes('Aiko Tanaka'));
  assert.ok(labels.includes('Ben Carter'));
  // Aiko's "POI." that Ben answers "Not right now" → ignored.
  const ignored = parsed.poiEvents.find((e) => e.status === 'ignored' || e.status === 'declined');
  assert.ok(ignored, 'Ben refusing Aiko\'s POI should be captured');
});

test('every POIEvent has the required shape', () => {
  const parsed = parseTranscript(sample('1_named_speakers.txt'), {});
  for (const e of parsed.poiEvents) {
    for (const k of ['requester', 'target_speaker', 'question_text', 'status', 'requester_team', 'target_team', 'confidence', 'needs_manual_review', 'evaluation']) {
      assert.ok(k in e, `POIEvent missing key ${k}`);
    }
    assert.ok(['accepted', 'declined', 'ignored', 'unclear'].includes(e.status));
    assert.ok(typeof e.confidence === 'number');
  }
});

test('judge() produces a winner, scores and evaluated POIs', () => {
  const parsed = parseTranscript(sample('1_named_speakers.txt'), {});
  const j = judge(parsed);
  assert.ok(j.winner);
  assert.ok(Array.isArray(j.speakers) && j.speakers.length >= 1);
  assert.ok(j.poiEvents.every((e) => e.evaluation && typeof e.evaluation.comment === 'string'));
  assert.ok(Array.isArray(j.educationalFeedback) && j.educationalFeedback.length >= 1);
});
