// Composition search.
//
// The heart of the group generator, and the only part of it that is really
// about encounter *dynamics*. Given a budget and the two nudges, it decides how
// many enemies there are and what challenge rating each one sits at -- before
// any monster has been chosen.
//
// It follows the project's one architectural rule as literally as the character
// builder does: enumerate legal compositions first, derive their difficulty
// from the composition, and never write a difficulty label on top of a group
// that was assembled to look about right.
//
//   1. enumerate  every (count, rating) split that the enabled content can
//                 actually fill, including leader-plus-mooks splits
//   2. price      each one through the difficulty model -- raw XP, action
//                 economy multiplier, adjusted XP
//   3. score      distance from budget first, then adherence to the shape
//                 nudge, then table-management and rocket-tag penalties
//   4. draw       weighted-randomly from the best handful, so the same request
//                 on two seeds gives two different *correct* answers
//
// Step 4 matters as much as step 2. A search that always returns its argmax
// would make every level-5 party fight the same four creatures forever.

import { xpForCR, formatCR, parseCR } from '../rules/srd51/proficiency.js';
import {
  encounterXP, groupMultiplier, difficultyOf, isSpike, minimumRelevantXP,
} from '../rules/srd51/encounter.js';
import { shapeStep } from './spec.js';

/**
 * The enemy count the shape nudge is asking for, scaled by party size: "horde"
 * against two characters is not the same number of bodies as "horde" against
 * six. Preference, not constraint -- the budget still decides what is legal.
 */
export function preferredCount(spec) {
  const { crowdFactor } = shapeStep(spec.shape);
  return Math.max(1, Math.min(spec.maxEnemies, Math.round(spec.partySize * crowdFactor)));
}

/**
 * Prices one candidate composition and scores it. Every term is returned
 * alongside the total so the inspector can show why one composition beat
 * another -- an unexplainable search is one nobody can tune.
 */
function scoreComposition(tiers, spec, budget) {
  const crs = [];
  for (const tier of tiers) for (let i = 0; i < tier.count; i++) crs.push(tier.cr);
  const count = crs.length;
  if (!count) return null;

  const xp = encounterXP(crs, spec.partySize);
  const wanted = preferredCount(spec);

  // Distance from budget, as a proportion of it. Dominant term: a composition
  // that misses the budget is wrong no matter how well it matches the nudge.
  const budgetError = Math.abs(xp.adjusted - budget) / budget;

  // Distance from the requested crowd, in doublings. Logarithmic because the
  // step from 1 enemy to 2 is a bigger change of character than 8 to 9.
  const shapeError = Math.abs(Math.log2(count / wanted));

  const top = Math.max(...crs.map(parseCR));
  const bottom = Math.min(...crs.map(parseCR));

  // A lone enemy far above the party's level ends the fight in a couple of
  // turns in one direction or the other. Permitted -- a solo dragon is the
  // whole point of the Solo nudge -- but it costs something in the search.
  const spike = isSpike(top, spec.partyLevel) ? 0.45 : 0;

  // More than two enemies per character is a bookkeeping problem at the table
  // before it is a balance problem.
  const crowding = Math.max(0, count - spec.partySize * 2) * 0.06;

  // Within a leader-plus-mooks split, keep the gap readable: mooks that die to
  // a stiff breeze next to a leader that soaks the whole fight is one creature
  // with extra steps.
  const spread = top > 0 && bottom > 0 ? Math.log2(parseCR(top) / parseCR(bottom)) : 0;
  const spreadPenalty = Math.max(0, spread - 3) * 0.12;

  const score = budgetError * 4 + shapeError * 1.2 + spike + crowding + spreadPenalty;

  return {
    tiers: tiers.map((t) => ({ ...t, cr: formatCR(parseCR(t.cr)), xpEach: xpForCR(t.cr) })),
    count,
    crs: crs.map((cr) => formatCR(parseCR(cr))),
    rawXP: xp.raw,
    multiplier: xp.multiplier,
    adjustedXP: xp.adjusted,
    budget,
    terms: {
      budgetError: round3(budgetError),
      shapeError: round3(shapeError),
      spike,
      crowding: round3(crowding),
      spread: round3(spreadPenalty),
    },
    score: round3(score),
  };
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/** The two ladder rungs bracketing an XP value, both worth trying. */
function bracket(ladder, xp) {
  const out = new Set();
  let below = null;
  let above = null;
  for (const cr of ladder) {
    if (xpForCR(cr) <= xp) below = cr;
    if (xpForCR(cr) >= xp && above === null) above = cr;
  }
  if (below !== null) out.add(below);
  if (above !== null) out.add(above);
  if (!out.size && ladder.length) out.add(ladder[0]);
  return [...out];
}

/**
 * Enumerates candidate compositions.
 *
 * `ladder` is the challenge ratings the *enabled content* can actually supply
 * for this request -- passed in rather than taken from the CR table, so the
 * search never proposes a CR 13 undead when the enabled packs stop at CR 5.
 */
export function enumerateCompositions({ spec, budget, ladder }) {
  const candidates = [];
  const seen = new Set();
  const cap = Math.min(spec.maxEnemies, Math.max(1, spec.partySize * 4));
  const floor = minimumRelevantXP(spec.partyLevel);
  const usable = ladder.filter((cr) => xpForCR(cr) >= floor);
  const pool = usable.length ? usable : ladder;
  if (!pool.length) return candidates;

  const consider = (tiers) => {
    const key = tiers.map((t) => `${formatCR(parseCR(t.cr))}x${t.count}`).sort().join('+');
    if (seen.has(key)) return;
    seen.add(key);
    const scored = scoreComposition(tiers, spec, budget);
    if (scored) candidates.push(scored);
  };

  for (let n = 1; n <= cap; n++) {
    // What each enemy would have to be worth for n of them to hit the budget,
    // after the action-economy multiplier for a group of that size is taken
    // back out. This inversion is the whole trick: the multiplier depends on
    // the count, so the count has to be chosen before the rating can be.
    const rawTarget = budget / groupMultiplier(n, spec.partySize);
    const perEnemy = rawTarget / n;

    for (const cr of bracket(pool, perEnemy)) {
      consider([{ cr, count: n, tier: 'line' }]);
    }

    // Leader-plus-mooks. Priced the same way, and only offered where it can be
    // a real distinction: with one or two enemies there is no group to lead.
    if (!spec.mixedTiers || n < 3) continue;
    for (const mook of pool) {
      const mookCount = n - 1;
      const remaining = rawTarget - mookCount * xpForCR(mook);
      if (remaining <= xpForCR(mook)) continue; // the "leader" would not lead
      for (const leader of bracket(pool, remaining)) {
        if (parseCR(leader) <= parseCR(mook)) continue;
        consider([
          { cr: leader, count: 1, tier: 'leader' },
          { cr: mook, count: mookCount, tier: 'line' },
        ]);
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

/**
 * Picks a composition. Draws from the best candidates rather than taking the
 * winner outright, weighted so a clearly better composition still usually wins:
 * `exp(-4 * (score - best))` halves a candidate's odds for every ~0.17 of score
 * it gives up.
 */
export function composeEncounter({ spec, budget, ladder, stream, shortlist = 8 }) {
  const candidates = enumerateCompositions({ spec, budget, ladder });
  if (!candidates.length) return null;

  const best = candidates[0].score;
  const top = candidates.slice(0, shortlist);
  const chosen = stream.weighted(top, (c) => Math.exp(-4 * (c.score - best)));

  return {
    ...chosen,
    difficulty: difficultyOf(chosen.adjustedXP, spec),
    shortlist: top.map((c) => ({
      composition: describe(c), count: c.count, adjustedXP: c.adjustedXP,
      score: c.score, terms: c.terms, chosen: c === chosen,
    })),
    considered: candidates.length,
  };
}

/** "1x CR 5 + 4x CR 1/2", the way a DM would write it on a card. */
export const describe = (composition) => composition.tiers
  .map((t) => `${t.count}x CR ${t.cr}`)
  .join(' + ');

/**
 * Expands a composition into individual slots, hardest first, and assigns each
 * one the style constraints the `style` nudge asks for.
 *
 * Caster slots are handed out from the top down: a spellcaster leading a line
 * of brutes reads as a warband, whereas the reverse reads as an accident.
 */
export function expandSlots(composition, style) {
  const slots = [];
  for (const tier of composition.tiers) {
    for (let i = 0; i < tier.count; i++) {
      slots.push({ cr: tier.cr, tier: tier.tier, index: slots.length });
    }
  }
  slots.sort((a, b) => parseCR(b.cr) - parseCR(a.cr) || a.index - b.index);

  const casters = Math.round(slots.length * (style.casterShare || 0));
  const melee = Math.round(slots.length * (style.meleeShare || 0));

  return slots.map((slot, i) => ({
    ...slot,
    index: i,
    ordinal: i + 1,
    // A caster nudge fills from the front; a melee nudge fills from the back,
    // so at style 0 both are empty and the pool is left entirely alone.
    style: i < casters ? 'caster' : i >= slots.length - melee ? 'melee' : 'any',
  }));
}
