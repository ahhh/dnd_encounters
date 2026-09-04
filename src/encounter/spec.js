// Encounter generation spec.
//
// An encounter request is a question about a *party*, not about a creature:
// "what should four level-5 characters be fighting?" Everything here describes
// the party and the shape of the answer; nothing here names a monster. Which
// creatures come back is decided by the composer and then filled in by the
// ordinary creature generator, one slot at a time.
//
// The two nudges are the interesting fields, and they are deliberately
// orthogonal:
//
//   shape  -- many weak enemies  <->  one strong enemy, at a fixed budget
//   style  -- melee bruisers     <->  spellcasters and artillery
//
// Both are signed integers in [-2, 2] rather than enumerated labels, because
// they are dials the composer reads numerically: a nudge is a bias applied to a
// scored search, never a hard filter that can make a request unsatisfiable.

import { DIFFICULTIES } from '../rules/srd51/encounter.js';
import { CREATURE_MODES } from '../sheets/creature/spec.js';

export const MAX_PARTY_SIZE = 8;
export const MAX_ENEMIES = 16;

/** The `shape` dial, from a horde to a solo. */
export const SHAPE_STEPS = [
  { value: -2, label: 'Horde — many, weak', crowdFactor: 3 },
  { value: -1, label: 'Pack — more, weaker', crowdFactor: 1.75 },
  { value: 0, label: 'Balanced', crowdFactor: 1 },
  { value: 1, label: 'Elite — fewer, stronger', crowdFactor: 0.5 },
  { value: 2, label: 'Solo — one big threat', crowdFactor: 0.25 },
];

/** The `style` dial, from pure melee to a caster line. */
export const STYLE_STEPS = [
  { value: -2, label: 'All melee', casterShare: 0, meleeShare: 0.9 },
  { value: -1, label: 'Mostly melee', casterShare: 0, meleeShare: 0.5 },
  { value: 0, label: 'Whatever fits', casterShare: 0, meleeShare: 0 },
  { value: 1, label: 'Some spellcasters', casterShare: 0.4, meleeShare: 0 },
  { value: 2, label: 'Caster-heavy', casterShare: 0.8, meleeShare: 0 },
];

const clampInt = (n, lo, hi, fallback) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
};

export const shapeStep = (value) => SHAPE_STEPS.find((s) => s.value === value) || SHAPE_STEPS[2];
export const styleStep = (value) => STYLE_STEPS.find((s) => s.value === value) || STYLE_STEPS[2];

export function normalizeEncounterSpec(spec = {}) {
  return {
    seed: String(spec.seed ?? 'unseeded'),
    ruleset: spec.ruleset || 'srd51',
    contentPacks: spec.contentPacks || ['srd51', 'openflavor'],

    // The party the encounter is being built for.
    partyLevel: clampInt(spec.partyLevel, 1, 20, 5),
    partySize: clampInt(spec.partySize, 1, MAX_PARTY_SIZE, 4),
    difficulty: DIFFICULTIES.includes(spec.difficulty) ? spec.difficulty : 'standard',

    // The nudges.
    shape: clampInt(spec.shape, -2, 2, 0),
    style: clampInt(spec.style, -2, 2, 0),

    // Passed straight through to each creature request.
    mode: CREATURE_MODES.includes(spec.mode) ? spec.mode : 'existing',
    creatureType: spec.creatureType && spec.creatureType !== 'any' ? String(spec.creatureType) : null,
    family: spec.family && spec.family !== 'any' ? String(spec.family) : null,
    environment: spec.environment && spec.environment !== 'any' ? String(spec.environment) : null,
    theme: spec.theme ? String(spec.theme) : '',
    withPersonality: spec.withPersonality !== false,

    // Composition policy.
    maxEnemies: clampInt(spec.maxEnemies, 1, MAX_ENEMIES, MAX_ENEMIES),
    mixedTiers: spec.mixedTiers !== false,
    cohesion: spec.cohesion !== false,
  };
}
