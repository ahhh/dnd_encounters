// Permalinks.
//
// Generation is deterministic: seed + spec + rerolls + versions reproduce a
// sheet exactly. So a link needs to carry nothing but those four things --
// there is no document to store, nothing to upload and no server to ask. The
// URL *is* the encounter.
//
// What travels is the *form* state rather than the normalized generator spec.
// The two hold the same information, but the form is what the sidebar reads and
// writes, so a decoded link drops straight into `state` and the controls agree
// with the sheet on screen without a translation step in between.
//
// Only fields that differ from the defaults are written. That is the whole
// reason `DEFAULT_FORMS` lives here rather than inline in the bootstrap: the
// delta encoding is only correct if the defaults it subtracts against are the
// same object the app actually starts from. A typical link comes out near 150
// characters instead of 450, which is the difference between one that survives
// being pasted into a chat client and one that arrives wrapped.

import { GENERATOR_VERSION } from '../core/version.js';
import { fingerprint } from '../core/ids.js';

/**
 * The state each tab's form starts in. The single source of truth: the app
 * boots from these, and the codec subtracts against them.
 */
export const DEFAULT_FORMS = {
  character: {
    level: 5, role: 'scout', theme: 'Forest Guide',
    species: 'random', class: 'random', background: 'random',
    abilityMethod: 'standard-array', hpPolicy: 'fixed',
    spellcaster: 'any', rangePreference: 'any', requiredSkill: '', named: true,
  },
  creature: {
    mode: 'existing', targetCR: '3', creatureType: 'any', family: 'undead',
    environment: 'crypt', role: 'any', baseCreature: 'random',
    spellcaster: 'any', flying: 'any', ranged: 'any',
    theme: '', withPersonality: true,
  },
  group: {
    partyLevel: 5, partySize: 4, difficulty: 'standard',
    shape: 0, style: 0,
    mode: 'existing', creatureType: 'any', family: 'any', environment: 'any',
    theme: '', maxEnemies: 16, mixedTiers: true, cohesion: true, withPersonality: true,
  },
};

export const KINDS = Object.keys(DEFAULT_FORMS);

/** A fresh copy, so a caller mutating its form never edits the defaults. */
export const defaultForm = (kind) => ({ ...DEFAULT_FORMS[kind] });

// Keys the codec claims for itself. No form field uses any of them, and this
// is the check that keeps that true if one ever gets added.
const RESERVED = ['kind', 'seed', 'rr', 'gen'];
for (const kind of KINDS) {
  for (const key of RESERVED) {
    if (key in DEFAULT_FORMS[kind]) throw new Error(`form field "${key}" collides with a reserved link key`);
  }
}

/**
 * A short stamp over everything that participates in the reproduction contract
 * besides the spec itself. A link carrying a different stamp was made by a
 * generator that may not answer the same way, which is worth saying out loud
 * rather than silently rendering something else.
 */
export function versionStamp(registry) {
  return fingerprint({
    generator: GENERATOR_VERSION,
    packs: registry.packs.map((p) => `${p.id}@${p.version}`),
  }).slice(0, 8);
}

// --- rerolls ---------------------------------------------------------------------
//
// Reroll counters are part of the reproduction contract, so a link made after a
// reroll has to carry them or it quietly describes a different sheet. The
// namespace prefix is implied by the kind and stripped, which is what keeps
// `npc:identity` from arriving as `npc%3Aidentity`.

const REROLL_PREFIX = { character: 'npc:', creature: 'enemy:' };

function encodeRerolls(kind, rerolls) {
  const prefix = REROLL_PREFIX[kind];
  if (!prefix || !rerolls) return '';
  return Object.entries(rerolls)
    .filter(([ns, n]) => ns.startsWith(prefix) && Number(n) > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([ns, n]) => `${ns.slice(prefix.length)}.${Math.round(n)}`)
    .join('-');
}

function decodeRerolls(kind, text) {
  const prefix = REROLL_PREFIX[kind];
  if (!prefix || !text) return {};
  const out = {};
  for (const part of text.split('-')) {
    const [name, count] = part.split('.');
    const n = Number(count);
    if (!name || !Number.isFinite(n) || n <= 0) continue;
    out[`${prefix}${name}`] = Math.round(n);
  }
  return out;
}

// --- codec -------------------------------------------------------------------------

/** Reads a link value back as the type its default says it should be. */
function coerce(value, fallback) {
  if (typeof fallback === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof fallback === 'boolean') return value === 'true' || value === '1';
  return String(value);
}

/** The hash body describing this state. No leading "#". */
export function encodeState({ kind, seed, form, rerolls, stamp }) {
  const defaults = DEFAULT_FORMS[kind];
  if (!defaults) return '';
  const params = new URLSearchParams();
  params.set('kind', kind);
  params.set('seed', seed || 'unseeded');
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = form?.[key];
    if (value === undefined || value === null || value === fallback) continue;
    params.set(key, String(value));
  }
  const rr = encodeRerolls(kind, rerolls);
  if (rr) params.set('rr', rr);
  if (stamp) params.set('gen', stamp);
  return params.toString();
}

/**
 * Parses a hash back into state, or null if there is nothing usable in it.
 * Unknown keys are ignored and malformed values fall back to their defaults: a
 * hand-edited or truncated link should still open something rather than an
 * error page.
 */
export function decodeHash(hash) {
  const text = String(hash || '').replace(/^#/, '');
  if (!text) return null;

  let params;
  try {
    params = new URLSearchParams(text);
  } catch {
    return null;
  }

  const kind = params.get('kind');
  if (!KINDS.includes(kind)) return null;

  const form = {};
  for (const [key, fallback] of Object.entries(DEFAULT_FORMS[kind])) {
    if (!params.has(key)) continue;
    form[key] = coerce(params.get(key), fallback);
  }

  return {
    kind,
    seed: (params.get('seed') || '').trim() || 'unseeded',
    form,
    rerolls: decodeRerolls(kind, params.get('rr')),
    stamp: params.get('gen') || null,
  };
}

/** The absolute URL for a hash body, for the clipboard. */
export function linkFor(hashBody, location = window.location) {
  return `${location.origin}${location.pathname}#${hashBody}`;
}
