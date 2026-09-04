// Encounter difficulty model.
//
// The SRD publishes XP by challenge rating and nothing else about building an
// encounter -- no party thresholds, no multiplier table. So, exactly as with
// `challenge.js`, this is an explicit *project-defined* model. The difference
// is that this one is derived rather than transcribed: every number below comes
// out of the SRD's own XP ladder, from one anchoring claim.
//
//   A standard encounter for four characters of level L is one creature of
//   CR L.
//
// That single sentence gives a per-character share of `xpForCR(L) / 4`, and
// everything else -- difficulty bands, party size scaling, group size scaling
// -- is a multiplier on it. `tools/verify.mjs encounters` re-derives the table
// and checks it stays monotonic and inside sane bounds.
//
// Two independent scalings are at work and they are deliberately kept apart:
//
//   budget      grows with party level and party size -- how much the party
//               can take
//   multiplier  grows with the *number* of enemies -- how much more a given
//               pile of XP hurts when it is split across many turns
//
// Conflating them is the classic way to get this wrong: six goblins and one
// ogre can carry identical raw XP and be nothing alike at the table.

import { CR_LADDER, formatCR, parseCR, xpForCR } from './proficiency.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round2 = (n) => Math.round(n * 100) / 100;

export const DIFFICULTIES = ['light', 'standard', 'hard', 'deadly'];

/**
 * Difficulty as a multiple of the standard budget. "Standard" is 1 by
 * construction -- it is the anchor, not a tuned value.
 */
export const DIFFICULTY_FACTOR = {
  light: 0.5,
  standard: 1,
  hard: 1.5,
  deadly: 2.25,
};

export const DIFFICULTY_LABELS = {
  trivial: 'trivial',
  light: 'light',
  standard: 'standard',
  hard: 'hard',
  deadly: 'deadly',
  overwhelming: 'overwhelming',
};

/**
 * One character's share of a standard encounter, in XP. Derived, not tabled:
 * a level-L character is worth a quarter of a CR-L creature.
 */
export function standardShare(partyLevel) {
  return xpForCR(clamp(Math.round(partyLevel), 1, 20)) / 4;
}

/** The party's whole standard-encounter budget, before difficulty. */
export const standardBudget = (partyLevel, partySize) =>
  standardShare(partyLevel) * Math.max(1, Math.round(partySize));

/** The XP an encounter of the requested difficulty should adjust to. */
export function partyBudget({ partyLevel, partySize, difficulty = 'standard' }) {
  const factor = DIFFICULTY_FACTOR[difficulty] ?? 1;
  return Math.round(standardBudget(partyLevel, partySize) * factor);
}

/**
 * The action-economy multiplier: what a pile of XP is actually worth once it is
 * divided into that many separate turns, concentrations and saving throws.
 *
 *   multiplier = 1 + 0.5 * partyFactor * log2(enemies)
 *
 * A doubling of the enemy count is worth a flat half-step, which is what makes
 * the curve smooth where a banded table jumps -- three enemies and four enemies
 * should not price identically while four and five differ. `partyFactor` bends
 * it for party size, because a bigger party has more turns of its own to answer
 * with; it is clamped so a duo or a party of eight stays inside the model's
 * calibrated range rather than running off the end of it.
 */
export function groupMultiplier(enemyCount, partySize = 4) {
  const n = Math.max(1, Math.round(enemyCount));
  if (n === 1) return 1;
  const partyFactor = clamp(4 / Math.max(1, Math.round(partySize)), 0.7, 1.35);
  return round2(clamp(1 + 0.5 * partyFactor * Math.log2(n), 1, 4));
}

/** Raw and adjusted XP for a list of challenge ratings. */
export function encounterXP(crs, partySize = 4) {
  const raw = crs.reduce((sum, cr) => sum + xpForCR(cr), 0);
  const multiplier = groupMultiplier(crs.length, partySize);
  return { count: crs.length, raw, multiplier, adjusted: Math.round(raw * multiplier) };
}

/**
 * Where an adjusted XP total actually lands for this party. Reported as a ratio
 * against the standard budget as well as a label, because "1.7x standard" says
 * more at a table than "hard" does.
 */
export function difficultyOf(adjusted, { partyLevel, partySize }) {
  const standard = standardBudget(partyLevel, partySize);
  const ratio = standard > 0 ? adjusted / standard : 0;
  const label = ratio < 0.35 ? 'trivial'
    : ratio < 0.75 ? 'light'
      : ratio < 1.25 ? 'standard'
        : ratio < 1.85 ? 'hard'
          : ratio < 3 ? 'deadly'
            : 'overwhelming';
  return { label, ratio: round2(ratio), standard, adjusted };
}

/**
 * Below this, an enemy is scenery: the party spends a cantrip on it and moves
 * on, so counting its XP toward the encounter's weight overstates the fight.
 * A sixteenth of one character's standard share -- roughly "four of these are
 * worth a quarter of one round of one character's attention".
 */
export const minimumRelevantXP = (partyLevel) => standardShare(partyLevel) / 16;

/** Whether a challenge rating still contributes meaningfully at this level. */
export const isRelevant = (cr, partyLevel) => xpForCR(cr) >= minimumRelevantXP(partyLevel);

/**
 * A single enemy this far above the party's level ends fights in one or two
 * turns in either direction. Legal -- a solo dragon is a real encounter -- but
 * always worth saying out loud.
 */
export const isSpike = (cr, partyLevel) => parseCR(cr) > partyLevel + 5;

/** The rungs of the CR ladder worth considering for a party at this level. */
export function relevantLadder(partyLevel, { maxCR = 30 } = {}) {
  const floor = minimumRelevantXP(partyLevel);
  return CR_LADDER.filter((cr) => cr <= maxCR && xpForCR(cr) >= floor);
}

/** Nearest rung of the ladder by XP rather than by rating. */
export function crForXP(xp, ladder = CR_LADDER) {
  let best = ladder[0];
  let bestDist = Infinity;
  for (const cr of ladder) {
    const d = Math.abs(xpForCR(cr) - xp);
    if (d < bestDist) { bestDist = d; best = cr; }
  }
  return best;
}

export { formatCR, parseCR, xpForCR };
