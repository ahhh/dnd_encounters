// Deterministic randomness.
//
// Every random choice in a sheet comes from a *named stream*. A stream is
// derived from hash(seed | namespace | rerollCounter), never from a shared
// global sequence, which is what makes the two guarantees in the build plan
// hold at once:
//
//   1. same seed + same spec + same reroll state  ->  byte-identical sheet
//   2. drawing one more personality value can never move AC, HP or spells
//
// Guarantee 2 is the reason streams exist at all. If every generator pulled
// from one sequence, inserting a roll anywhere would shift everything after
// it, and "reroll the personality" would silently rebuild the character.

/** FNV-1a. Turns a string into a u32. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Small fast PRNG. Returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeds are user-typed, so they are normalised before hashing: "Ember Raven"
 * and "ember-raven" must not silently be two different characters.
 */
export function normalizeSeed(seed) {
  return String(seed ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

// --- namespaces ---------------------------------------------------------------

export const NPC_NAMESPACES = [
  'npc:identity', 'npc:species', 'npc:class', 'npc:background',
  'npc:abilities', 'npc:skills', 'npc:equipment', 'npc:spells',
  'npc:personality',
];

export const ENEMY_NAMESPACES = [
  'enemy:base', 'enemy:features', 'enemy:actions',
  'enemy:equipment', 'enemy:spells', 'enemy:personality',
];

/**
 * A reroll scope names the namespaces it resets. Rerolling "identity" must not
 * touch mechanics, so the scopes are deliberately narrow; "build" is the wide
 * one because species/class/background feed everything downstream.
 */
export const REROLL_SCOPES = {
  everything: [...NPC_NAMESPACES, ...ENEMY_NAMESPACES],
  identity: ['npc:identity'],
  build: ['npc:species', 'npc:class', 'npc:background', 'npc:abilities',
    'npc:skills', 'npc:equipment', 'npc:spells'],
  abilities: ['npc:abilities', 'npc:skills', 'npc:equipment', 'npc:spells'],
  skills: ['npc:skills'],
  equipment: ['npc:equipment'],
  spells: ['npc:spells'],
  personality: ['npc:personality'],
  'enemy-base': ENEMY_NAMESPACES,
  'enemy-features': ['enemy:features'],
  'enemy-actions': ['enemy:actions'],
  'enemy-spells': ['enemy:spells'],
  'enemy-personality': ['enemy:personality'],
};

/** Bump the reroll counters a scope covers. Returns a new state object. */
export function applyReroll(rerolls, scope) {
  const names = REROLL_SCOPES[scope];
  if (!names) throw new Error(`unknown reroll scope: ${scope}`);
  const next = { ...rerolls };
  for (const ns of names) next[ns] = (next[ns] || 0) + 1;
  return next;
}

// --- streams ------------------------------------------------------------------

/**
 * One namespaced stream. Every helper the build plan requires lives here so
 * that no generator is ever tempted to reach for Math.random().
 */
class Stream {
  constructor(namespace, seedU32) {
    this.namespace = namespace;
    this.seedU32 = seedU32;
    this.next = mulberry32(seedU32);
    this.draws = 0;
  }

  /** Raw float in [0, 1). */
  float() { this.draws++; return this.next(); }

  /** Float in [lo, hi). */
  range(lo, hi) { return lo + this.float() * (hi - lo); }

  /** Integer in [lo, hi], inclusive at both ends. */
  int(lo, hi) { return Math.floor(lo + this.float() * (hi - lo + 1)); }

  /** True with probability p. */
  chance(p) { return this.float() < p; }

  choice(arr) {
    if (!arr.length) throw new Error(`choice() on empty array in ${this.namespace}`);
    return arr[Math.floor(this.float() * arr.length)];
  }

  /**
   * Weighted choice. `weightOf` maps an item to a non-negative number; items
   * weighing zero are unreachable rather than merely unlikely, which is what
   * lets scoring functions veto illegal options outright.
   */
  weighted(arr, weightOf) {
    let total = 0;
    const weights = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const w = Math.max(0, weightOf(arr[i], i) || 0);
      weights[i] = w;
      total += w;
    }
    if (total <= 0) return this.choice(arr); // every candidate vetoed: fall back to uniform
    let roll = this.float() * total;
    for (let i = 0; i < arr.length; i++) {
      roll -= weights[i];
      if (roll < 0) return arr[i];
    }
    return arr[arr.length - 1];
  }

  /** Fisher-Yates on a copy. The input is never mutated. */
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** n distinct items, without replacement. Returns fewer if the pool is small. */
  sample(arr, n) {
    return this.shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length)));
  }

  /**
   * Weighted sample without replacement. Used wherever a scored pool must
   * yield several picks (skills, spells) and the top pick must not simply win
   * every time.
   */
  sampleWeighted(arr, n, weightOf) {
    const pool = arr.slice();
    const out = [];
    while (out.length < n && pool.length) {
      const pick = this.weighted(pool, weightOf);
      out.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
    return out;
  }

  /** Roll `count`d`sides`. Only used where a ruleset explicitly rolls dice. */
  dice(count, sides) {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += this.int(1, sides);
    return sum;
  }

  /** A derived sub-stream, for per-entity seeds inside a batch. */
  derive(suffix) {
    return new Stream(`${this.namespace}/${suffix}`,
      hashString(`${this.namespace}|${this.seedU32}|${suffix}`));
  }
}

/**
 * The root of a generation run. Streams are memoised so that asking for
 * `npc:skills` twice inside one generation continues the same sequence rather
 * than restarting it.
 */
export class SeedContext {
  constructor(seed, rerolls = {}) {
    this.seed = normalizeSeed(seed);
    this.rerolls = { ...rerolls };
    this._streams = new Map();
  }

  stream(namespace) {
    let s = this._streams.get(namespace);
    if (!s) {
      const counter = this.rerolls[namespace] || 0;
      s = new Stream(namespace, hashString(`${this.seed}|${namespace}|${counter}`));
      this._streams.set(namespace, s);
    }
    return s;
  }

  /** A child context for entity `index` of a batch. Independent of siblings. */
  child(suffix) {
    return new SeedContext(`${this.seed}:${suffix}`, this.rerolls);
  }

  /** Namespaces actually drawn from, for the debug inspector. */
  usage() {
    return [...this._streams.values()].map((s) => ({
      namespace: s.namespace, seedU32: s.seedU32, draws: s.draws,
    }));
  }
}

export const createSeedContext = (seed, rerolls) => new SeedContext(seed, rerolls);
