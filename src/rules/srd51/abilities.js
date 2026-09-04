// Ability scores.
//
// Rules model: SRD 5.1 (CC-BY-4.0). Scores are produced by an explicitly
// supported method and then adjusted by species; nothing here ever invents a
// "plausible looking" number, because the validator recomputes every one of
// them from the recorded base + adjustments.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_NAMES = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

/** The single definition of the modifier rule. Validators re-derive it. */
export const abilityModifier = (score) => Math.floor((score - 10) / 2);

export const modifiers = (scores) => {
  const out = {};
  for (const a of ABILITIES) out[a] = abilityModifier(scores[a]);
  return out;
};

/** Formats a modifier the way a sheet prints it: +3, -1, +0. */
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

// --- generation methods -------------------------------------------------------

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** Point buy: 27 points, scores 8-15 before species adjustments. */
export const POINT_BUY_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

export const pointBuyCost = (array) =>
  array.reduce((sum, score) => sum + (POINT_BUY_COST[score] ?? Infinity), 0);

/**
 * Deterministic rolled scores: 4d6 drop lowest, six times, from a named
 * stream. Offered because the plan allows an "explicit supported deterministic
 * rolling method" -- it is reproducible, but it is not the default because
 * rolled arrays make level-to-level comparisons meaningless.
 */
export function rollAbilityArray(stream) {
  const array = [];
  for (let i = 0; i < 6; i++) {
    const dice = [stream.int(1, 6), stream.int(1, 6), stream.int(1, 6), stream.int(1, 6)]
      .sort((a, b) => b - a);
    array.push(dice[0] + dice[1] + dice[2]);
  }
  return array.sort((a, b) => b - a);
}

/**
 * Builds a point-buy array that spends the whole budget, biased toward the
 * priority order. Walks the priorities repeatedly buying the next point where
 * it is affordable, so the result is always legal by construction.
 */
export function buildPointBuyArray(stream, priorityCount = 6) {
  const scores = new Array(6).fill(POINT_BUY_MIN);
  let spent = 0;
  let guard = 0;
  while (guard++ < 64) {
    let bought = false;
    for (let i = 0; i < priorityCount && i < 6; i++) {
      const next = scores[i] + 1;
      if (next > POINT_BUY_MAX) continue;
      const delta = POINT_BUY_COST[next] - POINT_BUY_COST[scores[i]];
      if (spent + delta > POINT_BUY_BUDGET) continue;
      // A little jitter so two characters with the same plan are not identical.
      if (i > 1 && stream.chance(0.18)) continue;
      scores[i] = next;
      spent += delta;
      bought = true;
    }
    if (!bought) break;
  }
  return { array: scores, spent };
}

/** Species adjustments cannot push a starting score past 20. */
export const MAX_STARTING_SCORE = 20;

/**
 * Applies the recorded adjustments to a base array. Returns both the totals and
 * a per-ability breakdown, because the sheet must be able to explain each one.
 */
export function applyAdjustments(base, adjustments) {
  const final = {};
  const breakdown = {};
  for (const a of ABILITIES) {
    const list = adjustments.filter((adj) => adj.ability === a);
    const bonus = list.reduce((sum, adj) => sum + adj.value, 0);
    final[a] = Math.min(MAX_STARTING_SCORE, (base[a] || 0) + bonus);
    breakdown[a] = { base: base[a] || 0, adjustments: list, final: final[a] };
  }
  return { final, breakdown };
}
