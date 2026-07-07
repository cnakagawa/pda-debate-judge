// store.js
// Tiny persistence layer for debate sessions and their POIEvents.
// File-backed JSON so edits survive a server restart on Replit, with an
// in-memory cache. No database required.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'sessions.json');

let cache = null;

function ensureLoaded() {
  if (cache) return cache;
  try {
    if (fs.existsSync(DATA_FILE)) {
      cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[store] could not read data file:', e.message);
  }
  if (!cache || typeof cache !== 'object') cache = { sessions: {}, seq: 0 };
  return cache;
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.warn('[store] could not write data file:', e.message);
  }
}

// Deterministic id generator (avoids Date.now/Math.random for reproducibility).
function nextId() {
  const c = ensureLoaded();
  c.seq = (c.seq || 0) + 1;
  return 's' + c.seq;
}

export function createSession(parsed, meta = {}) {
  const c = ensureLoaded();
  const id = nextId();
  c.sessions[id] = {
    id,
    createdOrder: c.seq,
    meta,
    ...parsed,
    judgment: null,
  };
  persist();
  return c.sessions[id];
}

export function getSession(id) {
  return ensureLoaded().sessions[id] || null;
}

export function updateSession(id, patch) {
  const c = ensureLoaded();
  if (!c.sessions[id]) return null;
  c.sessions[id] = { ...c.sessions[id], ...patch };
  persist();
  return c.sessions[id];
}

export function updatePoiEvent(id, poiId, patch) {
  const c = ensureLoaded();
  const s = c.sessions[id];
  if (!s) return null;
  const ev = (s.poiEvents || []).find((e) => e.id === poiId);
  if (!ev) return null;
  Object.assign(ev, patch);
  persist();
  return ev;
}

export function replacePoiEvents(id, poiEvents) {
  return updateSession(id, { poiEvents });
}

export function replaceSpeakers(id, speakers) {
  return updateSession(id, { speakers });
}

export function listSessions() {
  const c = ensureLoaded();
  return Object.values(c.sessions).map((s) => ({
    id: s.id,
    createdOrder: s.createdOrder,
    utteranceCount: (s.utterances || []).length,
    poiCount: (s.poiEvents || []).length,
  }));
}
