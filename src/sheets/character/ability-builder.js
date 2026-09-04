// Ability scores.
//
// Three supported methods, all deterministic. Every one records the base array,
// where each value was assigned and why, and each adjustment separately -- the
// validator recomputes the final score by re-adding the recorded parts, so a
// score that "looks right" but was written by hand fails.

import {
  ABILITIES, STANDARD_ARRAY, applyAdjustments, buildPointBuyArray,
  pointBuyCost, POINT_BUY_BUDGET, rollAbilityArray, modifiers,
} from '../../rules/srd51/abilities.js';

/**
 * Orders the abilities by how much this build wants them. The class's own
 * saving-throw proficiencies break ties, because a class that saves with
 * Constitution wants Constitution even when the role does not say so.
 */
export function abilityPriority(plan, cls) {
  const order = plan.preferredAbilities.slice();

  // The casting ability has to rank somewhere, but where depends on how much of
  // the class it actually drives. A wizard is its Intelligence; a ranger is a
  // bow that happens to know four spells, so Wisdom sits behind Dexterity.
  const casting = cls?.spellcasting?.ability;
  if (casting) {
    const progression = cls.spellcasting.progression;
    const insertAt = progression === 'full' || progression === 'pact' ? 0 : 2;
    const current = order.indexOf(casting);
    if (current > insertAt) {
      order.splice(current, 1);
      order.splice(insertAt, 0, casting);
    }
  }

  for (const a of ABILITIES) if (!order.includes(a)) order.push(a);

  // Constitution is never the top pick and never the dump stat.
  const conIndex = order.indexOf('con');
  if (conIndex > 2) {
    order.splice(conIndex, 1);
    order.splice(2, 0, 'con');
  }
  return order;
}

/** Produces the base array for the requested method. */
function baseArray(method, stream, priority) {
  if (method === 'rolled') {
    return { array: rollAbilityArray(stream), method, note: '4d6 drop lowest, sorted descending' };
  }
  if (method === 'point-buy') {
    const { array, spent } = buildPointBuyArray(stream, priority.length);
    return {
      array: array.slice().sort((a, b) => b - a), method,
      note: `${spent} of ${POINT_BUY_BUDGET} points spent`, pointsSpent: spent,
    };
  }
  return { array: STANDARD_ARRAY.slice(), method: 'standard-array', note: 'standard array' };
}

/**
 * Assigns the array to abilities in priority order, then applies species
 * adjustments. Flexible adjustments (the half-elf's two floating +1s) go to the
 * highest-priority abilities the species has not already raised.
 */
export function buildAbilities({ method, stream, plan, cls, species }) {
  const priority = abilityPriority(plan, cls);
  const base = baseArray(method, stream, priority);

  const assigned = {};
  const assignment = [];
  priority.forEach((ability, i) => {
    assigned[ability] = base.array[i];
    assignment.push({ ability, value: base.array[i], rank: i + 1 });
  });

  const adjustments = (species.abilityAdjustments || []).map((adj) => ({
    ...adj, source: { type: 'species', id: species.id, name: species.name },
  }));

  if (species.flexibleAdjustments) {
    const { count, value, exclude = [] } = species.flexibleAdjustments;
    const taken = new Set([...exclude, ...adjustments.map((a) => a.ability)]);
    const picks = priority.filter((a) => !taken.has(a)).slice(0, count);
    for (const ability of picks) {
      adjustments.push({
        ability, value, chosen: true,
        source: { type: 'species', id: species.id, name: `${species.name} (choice)` },
      });
    }
  }

  const { final, breakdown } = applyAdjustments(assigned, adjustments);
  return {
    method: base.method,
    note: base.note,
    baseArray: base.array,
    pointsSpent: base.pointsSpent,
    priority,
    assignment,
    base: assigned,
    adjustments,
    scores: final,
    breakdown,
  };
}

/**
 * Applies Ability Score Improvements. Each is recorded as an explicit
 * BuildChoice: which level granted it, and what was taken. The default is +2 to
 * the build's top ability that is still below 20, falling back to two +1s and
 * then to the sole SRD feat when the prerequisites are met.
 */
export function applyASIs({ abilities, asiLevels, level, plan, stream, grapplerFeat }) {
  const scores = { ...abilities.scores };
  const choices = [];
  const feats = [];
  const priority = abilities.priority;

  for (const asiLevel of asiLevels.filter((l) => l <= level)) {
    const belowCap = priority.filter((a) => scores[a] < 20);
    if (!belowCap.length) {
      choices.push({ level: asiLevel, choiceType: 'asi', selected: [], note: 'all abilities at 20' });
      continue;
    }

    const primary = belowCap[0];
    const takeFeat = grapplerFeat
      && scores.str >= 13
      && plan.combatStyle.startsWith('melee')
      && !feats.length
      && stream.chance(0.18);

    if (takeFeat) {
      feats.push(grapplerFeat);
      choices.push({
        level: asiLevel, choiceType: 'feat',
        selected: [{ id: grapplerFeat.id, name: grapplerFeat.name, source: grapplerFeat.source }],
      });
      continue;
    }

    if (scores[primary] <= 18) {
      scores[primary] += 2;
      choices.push({
        level: asiLevel, choiceType: 'asi',
        selected: [{ ability: primary, value: 2 }],
      });
    } else {
      const pair = belowCap.slice(0, 2);
      for (const a of pair) scores[a] += 1;
      choices.push({
        level: asiLevel, choiceType: 'asi',
        selected: pair.map((a) => ({ ability: a, value: 1 })),
      });
    }
  }

  return { scores, choices, feats, modifiers: modifiers(scores) };
}

export { modifiers, pointBuyCost };
