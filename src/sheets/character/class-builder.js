// Class progression.
//
// Reads the class table and returns exactly the features a character of this
// level has, with the subclass branch resolved. Nothing here invents a feature:
// if it is not in the table at or below the character's level, it is not on the
// sheet, and the validator rebuilds the same list to prove it.

import { averageHitDie, spellSlots } from '../../rules/srd51/progression.js';
import { proficiencyBonusForLevel } from '../../rules/srd51/proficiency.js';

/** The features a character of `level` has, including the chosen subclass. */
export function featuresForLevel(cls, level, subclassSlug) {
  return cls.features
    .filter((f) => f.level <= level)
    .filter((f) => !f.subclass || f.subclass === subclassSlug)
    .map((f) => ({
      name: f.name,
      level: f.level,
      description: f.description,
      kind: f.kind || 'feature',
      source: { type: f.subclass ? 'subclass' : 'class', id: cls.id, name: cls.name },
      ...(f.subclass ? { subclass: f.subclass } : {}),
      ...(f.modifiers ? { modifiers: f.modifiers } : {}),
      ...(f.resources ? { resources: f.resources } : {}),
      ...(f.choiceOptions ? { choiceOptions: f.choiceOptions } : {}),
    }));
}

/** Collects every structured modifier of a given type across the feature list. */
export const modifiersOfType = (features, type) =>
  features.flatMap((f) => (f.modifiers || []).filter((m) => m.type === type));

/**
 * Resolves the level-indexed values a feature carries -- rage uses, martial
 * arts die, unarmoured movement -- into concrete numbers for this level.
 */
export function resolveResources(features, level, abilityMods) {
  const pools = [];
  for (const feature of features) {
    for (const res of feature.resources || []) {
      let amount = res.amount ?? null;
      if (res.perLevel) amount = res.perLevel[Math.min(level, 20)];
      else if (res.formula === 'level') amount = level;
      else if (res.formula === 'level-x5') amount = level * 5;
      else if (res.formula === 'cha-mod-min-1') amount = Math.max(1, abilityMods.cha);
      else if (res.formula === 'cha-mod-plus-1') amount = 1 + abilityMods.cha;
      if (amount === null || amount === 0) continue;
      pools.push({
        name: res.name,
        max: amount === 999 ? 'unlimited' : amount,
        recharge: res.recharge,
        source: feature.name,
      });
    }
  }
  return pools;
}

/** Number of attacks per Attack action, from the highest Extra Attack feature. */
export function attacksPerAction(features) {
  const values = modifiersOfType(features, 'extra-attack').map((m) => m.count);
  return values.length ? Math.max(...values) : 1;
}

/** The scaling die of a feature such as Martial Arts, at this level. */
export function scalingValue(features, type, level, key = 'perLevel') {
  const mods = modifiersOfType(features, type);
  if (!mods.length) return null;
  const table = mods[0][key];
  return table ? table[Math.min(level, 20)] : null;
}

/**
 * Hit points. Level 1 is the full hit die; every level after uses the fixed
 * average unless the spec asked for rolled HP. Constitution applies per level,
 * as do features such as Dwarven Toughness.
 */
export function buildHitPoints({ cls, level, conMod, features, policy, stream }) {
  const die = cls.hitDie;
  const parts = [{ label: `${cls.name} hit die (level 1)`, value: die, base: true }];
  let total = die;

  const perLevel = policy === 'rolled'
    ? null
    : averageHitDie(die);

  let levelsTotal = 0;
  for (let l = 2; l <= level; l++) {
    levelsTotal += perLevel ?? stream.int(1, die);
  }
  if (level > 1) {
    parts.push({
      label: policy === 'rolled'
        ? `levels 2-${level} rolled`
        : `levels 2-${level} at ${perLevel} each`,
      value: levelsTotal,
    });
    total += levelsTotal;
  }

  const conTotal = conMod * level;
  if (conTotal !== 0) {
    parts.push({ label: `Constitution ${conMod >= 0 ? '+' : ''}${conMod} x ${level} levels`, value: conTotal });
    total += conTotal;
  }

  for (const mod of modifiersOfType(features, 'hp-per-level')) {
    const bonus = mod.value * level;
    parts.push({ label: `feature bonus (${mod.value}/level)`, value: bonus });
    total += bonus;
  }

  return {
    max: Math.max(1, total),
    current: Math.max(1, total),
    temporary: 0,
    policy,
    calculation: { total: Math.max(1, total), parts },
  };
}

/** Hit dice are always "level d(hit die)" for a single-class character. */
export const buildHitDice = (cls, level) => ([{ die: `d${cls.hitDie}`, total: level, remaining: level }]);

/**
 * Spellcasting progression for the class at this level: slots, cantrip count,
 * and how many spells the character knows or prepares.
 */
export function spellProgression(cls, level, abilityMod) {
  const sc = cls.spellcasting;
  if (!sc) return null;
  if (sc.startLevel && level < sc.startLevel) return null;

  const slots = spellSlots(sc.progression, level);
  const cantripsKnown = sc.cantripsKnown ? sc.cantripsKnown[Math.min(level, 20)] : 0;

  let known = null;
  let prepared = null;
  if (sc.spellsKnown) {
    known = sc.spellsKnown[Math.min(level, 20)];
  } else if (sc.preparedFormula === 'ability+level') {
    prepared = Math.max(1, abilityMod + level);
  } else if (sc.preparedFormula === 'ability+half-level') {
    prepared = Math.max(1, abilityMod + Math.floor(level / 2));
  }

  return {
    ability: sc.ability,
    progression: sc.progression,
    prepares: !!sc.prepares,
    ritual: !!sc.ritual,
    spellbook: !!sc.spellbook,
    listSlug: sc.listSlug,
    slots,
    cantripsKnown,
    spellsKnown: known,
    spellsPrepared: prepared,
  };
}

export { proficiencyBonusForLevel };
