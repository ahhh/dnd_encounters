// Challenge rating evaluation.
//
// The SRD does not publish monster-building guidelines, so this is an explicit
// *project-defined* evaluation model, calibrated against the SRD 5.1 stat
// blocks shipped in the content pack. `tools/verify.mjs` re-runs it over every
// bundled creature and reports how far each one lands from its printed CR --
// that regression is what keeps the table honest rather than decorative.
//
// The procedure, deliberately simple and auditable:
//
//   defensive CR  <- effective HP (hit points scaled by damage resistances)
//                    then shifted by how far AC sits from the band's expectation
//   offensive CR  <- expected damage per round over three rounds
//                    then shifted by how far attack bonus / save DC sits
//   evaluated CR  <- the average of the two, snapped to the CR ladder
//
// Never used to *write* a CR onto a stat block imported from a source. It runs
// on variants and generated creatures only, plus verification.

import { CR_LADDER, formatCR, parseCR, proficiencyBonusForCR } from './proficiency.js';

/**
 * One row per CR: the values a creature at that rating is expected to show.
 * `hp` is the band's midpoint, `hpMax` its upper edge.
 */
export const CR_BANDS = [
  { cr: 0,     hp: 3,   hpMax: 6,   ac: 13, attack: 3, dpr: 1,   dprMax: 1,   dc: 13 },
  { cr: 0.125, hp: 9,   hpMax: 35,  ac: 13, attack: 3, dpr: 3,   dprMax: 3,   dc: 13 },
  { cr: 0.25,  hp: 43,  hpMax: 49,  ac: 13, attack: 3, dpr: 5,   dprMax: 5,   dc: 13 },
  { cr: 0.5,   hp: 56,  hpMax: 70,  ac: 13, attack: 3, dpr: 8,   dprMax: 8,   dc: 13 },
  { cr: 1,     hp: 78,  hpMax: 85,  ac: 13, attack: 3, dpr: 11,  dprMax: 14,  dc: 13 },
  { cr: 2,     hp: 93,  hpMax: 100, ac: 13, attack: 3, dpr: 17,  dprMax: 20,  dc: 13 },
  { cr: 3,     hp: 108, hpMax: 115, ac: 13, attack: 4, dpr: 23,  dprMax: 26,  dc: 13 },
  { cr: 4,     hp: 123, hpMax: 130, ac: 14, attack: 5, dpr: 29,  dprMax: 32,  dc: 14 },
  { cr: 5,     hp: 138, hpMax: 145, ac: 15, attack: 6, dpr: 35,  dprMax: 38,  dc: 15 },
  { cr: 6,     hp: 153, hpMax: 160, ac: 15, attack: 6, dpr: 41,  dprMax: 44,  dc: 15 },
  { cr: 7,     hp: 168, hpMax: 175, ac: 15, attack: 6, dpr: 47,  dprMax: 50,  dc: 15 },
  { cr: 8,     hp: 183, hpMax: 190, ac: 16, attack: 7, dpr: 53,  dprMax: 56,  dc: 16 },
  { cr: 9,     hp: 198, hpMax: 205, ac: 16, attack: 7, dpr: 59,  dprMax: 62,  dc: 16 },
  { cr: 10,    hp: 213, hpMax: 220, ac: 17, attack: 7, dpr: 65,  dprMax: 68,  dc: 16 },
  { cr: 11,    hp: 228, hpMax: 235, ac: 17, attack: 8, dpr: 71,  dprMax: 74,  dc: 17 },
  { cr: 12,    hp: 243, hpMax: 250, ac: 17, attack: 8, dpr: 77,  dprMax: 80,  dc: 17 },
  { cr: 13,    hp: 258, hpMax: 265, ac: 18, attack: 8, dpr: 83,  dprMax: 86,  dc: 18 },
  { cr: 14,    hp: 273, hpMax: 280, ac: 18, attack: 8, dpr: 89,  dprMax: 92,  dc: 18 },
  { cr: 15,    hp: 288, hpMax: 295, ac: 18, attack: 8, dpr: 95,  dprMax: 98,  dc: 18 },
  { cr: 16,    hp: 303, hpMax: 310, ac: 18, attack: 9, dpr: 101, dprMax: 104, dc: 18 },
  { cr: 17,    hp: 318, hpMax: 325, ac: 19, attack: 10, dpr: 107, dprMax: 110, dc: 19 },
  { cr: 18,    hp: 333, hpMax: 340, ac: 19, attack: 10, dpr: 113, dprMax: 116, dc: 19 },
  { cr: 19,    hp: 348, hpMax: 355, ac: 19, attack: 10, dpr: 119, dprMax: 122, dc: 19 },
  { cr: 20,    hp: 363, hpMax: 400, ac: 19, attack: 10, dpr: 125, dprMax: 140, dc: 19 },
  { cr: 21,    hp: 415, hpMax: 445, ac: 19, attack: 11, dpr: 146, dprMax: 152, dc: 20 },
  { cr: 22,    hp: 460, hpMax: 490, ac: 19, attack: 11, dpr: 158, dprMax: 164, dc: 20 },
  { cr: 23,    hp: 505, hpMax: 535, ac: 19, attack: 11, dpr: 170, dprMax: 176, dc: 20 },
  { cr: 24,    hp: 550, hpMax: 580, ac: 19, attack: 12, dpr: 182, dprMax: 188, dc: 21 },
  { cr: 25,    hp: 595, hpMax: 625, ac: 19, attack: 12, dpr: 194, dprMax: 200, dc: 21 },
  { cr: 26,    hp: 640, hpMax: 670, ac: 19, attack: 12, dpr: 206, dprMax: 212, dc: 21 },
  { cr: 27,    hp: 685, hpMax: 715, ac: 19, attack: 13, dpr: 218, dprMax: 224, dc: 22 },
  { cr: 28,    hp: 730, hpMax: 760, ac: 19, attack: 13, dpr: 230, dprMax: 236, dc: 22 },
  { cr: 29,    hp: 775, hpMax: 805, ac: 19, attack: 13, dpr: 242, dprMax: 248, dc: 22 },
  { cr: 30,    hp: 850, hpMax: 999, ac: 19, attack: 14, dpr: 254, dprMax: 999, dc: 23 },
];

/** Nearest rung of the CR ladder to a raw numeric estimate. */
export function snapCR(value) {
  let best = CR_LADDER[0];
  let bestDist = Infinity;
  for (const cr of CR_LADDER) {
    const d = Math.abs(cr - value);
    if (d < bestDist) { bestDist = d; best = cr; }
  }
  return best;
}

const bandFor = (cr) => CR_BANDS.find((b) => b.cr === cr) || CR_BANDS[CR_BANDS.length - 1];

/** Which band a value falls in, walking upward. Returns a fractional CR. */
function crFromCurve(value, key, maxKey) {
  for (let i = 0; i < CR_BANDS.length; i++) {
    const band = CR_BANDS[i];
    const ceiling = band[maxKey] ?? band[key];
    if (value <= ceiling) {
      const prev = CR_BANDS[i - 1];
      const floor = prev ? (prev[maxKey] ?? prev[key]) : 0;
      const span = ceiling - floor;
      const t = span > 0 ? (value - floor) / span : 0;
      const prevCR = prev ? prev.cr : 0;
      return prevCR + (band.cr - prevCR) * Math.max(0, Math.min(1, t));
    }
  }
  return 30;
}

/**
 * Resistances and immunities make hit points go further. The multiplier is a
 * flat approximation rather than a per-damage-type simulation -- documented as
 * an assumption on every evaluation it touches.
 */
export function effectiveHP(hp, { resistances = [], immunities = [], conditionImmunities = [], casterLevel = 0 } = {}) {
  // Immunities are worth more than resistances, condition immunities are worth
  // less than either, and the whole effect saturates: the eleventh resistance
  // does not double a creature again. Calibrated so a heavily warded
  // incorporeal undead lands near double, which is where the published stat
  // blocks sit. A caster's own defensive spells are credited separately,
  // because shield and mirror image do not appear anywhere in a damage list.
  const weighted = immunities.length * 1.5 + resistances.length + conditionImmunities.length * 0.4;
  const wards = Math.min(1.2, weighted * 0.11);
  const spells = Math.min(0.6, casterLevel * 0.06);
  const mult = 1 + wards + spells;
  return { value: Math.round(hp * mult), multiplier: Math.round(mult * 100) / 100 };
}

/**
 * Expected damage per round, averaged over the first three rounds of combat.
 * Recharge actions are counted at their probability of being available;
 * limited-use actions are amortised across the three rounds.
 */
export function damagePerRound(actions, { rounds = 3, spellDamage = 0 } = {}) {
  let best = 0;
  const contributions = [];
  for (const action of actions) {
    if (!action.damage || !action.damage.length) continue;
    let avg = action.damage.reduce((sum, d) => sum + (d.average || 0), 0);
    if (action.multiattackCount) avg *= action.multiattackCount;
    let weight = 1;
    if (action.recharge) weight = 0.55;          // ~5-6 on a d6, averaged over rounds
    else if (action.uses) weight = Math.min(1, action.uses / rounds);
    contributions.push({ name: action.name, average: avg, weight });
    if (action.primary) best = Math.max(best, avg);
  }
  if (spellDamage > 0) {
    contributions.push({ name: 'spellcasting', average: spellDamage, weight: 1, spell: true });
    best = Math.max(best, spellDamage);
  }
  const primary = best || Math.max(0, ...contributions.filter((c) => c.weight === 1).map((c) => c.average));
  const extras = contributions
    .filter((c) => c.weight < 1)
    .reduce((sum, c) => sum + c.average * c.weight, 0);

  // Control actions that deal no damage still cost the party turns and hit
  // points elsewhere. Scoring them at zero is what made the first version of
  // this model rate a ghost as CR 1, so they are credited at a fraction of the
  // creature's own best attack -- an approximation, and reported as one.
  const controlCount = actions.filter((a) => a.save && !(a.damage || []).length).length;
  const control = controlCount * primary * 0.4;
  if (controlCount) {
    contributions.push({ name: `${controlCount} control action(s)`, average: control, weight: 1, control: true });
  }

  return { value: Math.round((primary + extras + control) * 10) / 10, contributions };
}

/**
 * The full evaluation. Returns defensive, offensive and combined CRs plus the
 * assumptions the numbers rest on, so a warning is always explainable.
 */
export function evaluateCR({
  hp, ac, resistances, immunities, conditionImmunities, actions,
  attackBonus, saveDC, traits = [], spellcasting = null,
}) {
  const assumptions = [];
  const warnings = [];

  // A spellcaster's contribution is estimated from the highest spell level it
  // can cast. This is the coarsest part of the model by a wide margin -- the
  // difference between a wizard with fireball and one with wall of force is
  // invisible to it -- so it is always reported as an assumption.
  const topSpell = spellcasting ? highestSpellLevel(spellcasting) : 0;
  const casterLevel = spellcasting ? (spellcasting.casterLevel || topSpell * 2) : 0;

  const ehp = effectiveHP(hp, { resistances, immunities, conditionImmunities, casterLevel: topSpell ? casterLevel : 0 });
  if (ehp.multiplier > 1) {
    assumptions.push(`Hit points scaled x${ehp.multiplier} for resistances, immunities${topSpell ? ' and defensive spellcasting' : ''}`);
  }
  let defensive = crFromCurve(ehp.value, 'hp', 'hpMax');
  const defBand = bandFor(snapCR(defensive));
  // Divided by three rather than two, and clamped: AC is a real signal but a
  // wide miss on it should not swamp the hit point measurement.
  const acDelta = clampInt(Math.round(((ac ?? defBand.ac) - defBand.ac) / 3), -2, 2);
  if (acDelta !== 0) {
    defensive = Math.max(0, defensive + acDelta);
    assumptions.push(`AC ${ac} is ${acDelta > 0 ? '+' : ''}${acDelta * 2} from the CR ${formatCR(defBand.cr)} expectation`);
  }

  const dpr = damagePerRound(actions || [], { spellDamage: topSpell ? 6 * topSpell : 0 });
  if (topSpell) {
    assumptions.push(`Spellcasting credited as ${6 * topSpell} damage per round from a level ${topSpell} spell list`);
  }
  let offensive = crFromCurve(dpr.value, 'dpr', 'dprMax');
  const offBand = bandFor(snapCR(offensive));
  const reference = saveDC != null && attackBonus == null
    ? { value: saveDC, expected: offBand.dc, label: 'Save DC' }
    : { value: attackBonus, expected: offBand.attack, label: 'Attack bonus' };
  if (reference.value != null) {
    const delta = Math.round((reference.value - reference.expected) / 2);
    if (delta !== 0) {
      offensive = Math.max(0, offensive + delta);
      assumptions.push(`${reference.label} ${reference.value} is ${delta > 0 ? '+' : ''}${delta * 2} from the CR ${formatCR(offBand.cr)} expectation`);
    }
  }

  assumptions.push(`Damage per round ${dpr.value}, averaged over 3 rounds`);
  if (dpr.contributions.some((c) => c.control)) {
    assumptions.push('Non-damaging control actions credited at 40% of the best attack');
  }
  if (traits.length) {
    assumptions.push(`${traits.length} trait(s) not scored numerically; review by hand`);
  }
  if (!actions || !actions.length) {
    warnings.push('No damaging actions found; offensive rating is a floor, not a measurement');
  }

  const evaluated = snapCR((defensive + offensive) / 2);
  return {
    evaluatedCR: formatCR(evaluated),
    evaluatedValue: evaluated,
    defensiveCR: formatCR(snapCR(defensive)),
    offensiveCR: formatCR(snapCR(offensive)),
    effectiveHP: ehp.value,
    damagePerRound: dpr.value,
    proficiencyBonus: proficiencyBonusForCR(evaluated),
    assumptions,
    warnings,
  };
}

/**
 * Policy check. A generated creature may miss its target by one rung -- CR is
 * granular and the model is an approximation -- but not by more.
 */
export function crWithinPolicy(targetCR, evaluatedCR, tolerance = 1) {
  const t = parseCR(targetCR);
  const e = parseCR(evaluatedCR);
  const ti = CR_LADDER.indexOf(snapCR(t));
  const ei = CR_LADDER.indexOf(snapCR(e));
  if (ti < 0 || ei < 0) return false;
  return Math.abs(ti - ei) <= tolerance;
}

export { formatCR, parseCR, bandFor };

/** The highest spell level a creature's spellcasting block can reach. */
function highestSpellLevel(spellcasting) {
  let top = 0;
  for (const group of spellcasting.groups || []) {
    top = Math.max(top, group.level || 0);
    for (const spell of group.spells || []) {
      if (typeof spell === 'object' && spell.level) top = Math.max(top, spell.level);
    }
  }
  return top;
}

const clampInt = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
