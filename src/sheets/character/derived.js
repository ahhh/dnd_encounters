// Derived statistics.
//
// Everything here is a function of choices already recorded on the sheet, and
// every result carries the parts it was assembled from. That is what lets the
// document answer "why is this save +7?" and what lets the validator recompute
// the same number from the same inputs without sharing this code.

import { ABILITIES, abilityModifier } from '../../rules/srd51/abilities.js';
import { initiative, passiveScore } from '../../rules/srd51/combat.js';
import { modifiersOfType } from './class-builder.js';
import { abilityLabel } from './equipment-builder.js';

/** Saving throws for all six abilities, proficient or not. */
export function buildSavingThrows({ mods, saveProficiencies, proficiencyBonus }) {
  return ABILITIES.map((ability) => {
    const proficient = saveProficiencies.includes(ability);
    const total = mods[ability] + (proficient ? proficiencyBonus : 0);
    return {
      ability,
      proficient,
      modifier: total,
      calculation: {
        total,
        parts: [
          { label: abilityLabel(ability), value: mods[ability] },
          ...(proficient ? [{ label: 'proficiency bonus', value: proficiencyBonus }] : []),
        ],
      },
    };
  });
}

/** Every skill, with proficiency, expertise and the Jack of All Trades rider. */
export function buildSkills({ registry, mods, proficiencies, proficiencyBonus, features }) {
  const proficient = new Set(proficiencies.skills.map((p) => p.id));
  const expert = new Set(proficiencies.expertise);
  const halfAll = modifiersOfType(features, 'half-proficiency-all-checks').length > 0;
  const half = Math.floor(proficiencyBonus / 2);

  return registry.all('skill').map((skill) => {
    const parts = [{ label: abilityLabel(skill.ability), value: mods[skill.ability] }];
    let total = mods[skill.ability];
    let rank = 'none';

    if (expert.has(skill.id)) {
      total += proficiencyBonus * 2;
      parts.push({ label: 'expertise (x2 proficiency)', value: proficiencyBonus * 2 });
      rank = 'expertise';
    } else if (proficient.has(skill.id)) {
      total += proficiencyBonus;
      parts.push({ label: 'proficiency bonus', value: proficiencyBonus });
      rank = 'proficient';
    } else if (halfAll && half > 0) {
      total += half;
      parts.push({ label: 'Jack of All Trades (half proficiency)', value: half });
      rank = 'half';
    }

    return {
      id: skill.id, name: skill.name, ability: skill.ability,
      proficiency: rank, modifier: total,
      source: proficiencies.skills.find((p) => p.id === skill.id)?.source || null,
      calculation: { total, parts },
    };
  });
}

/** Movement: species base speed plus any structured speed modifiers. */
export function buildMovement({ species, features, level, equipment }) {
  const modes = [];
  let walk = species.speed;
  const parts = [{ label: `${species.name} base speed`, value: species.speed, base: true }];

  for (const mod of modifiersOfType(features, 'speed-bonus')) {
    const heavy = equipment.armor?.armorType === 'heavy';
    if (mod.condition?.includes('heavy') && heavy) continue;
    walk += mod.value;
    parts.push({ label: `feature bonus${mod.condition ? ` (${mod.condition})` : ''}`, value: mod.value });
  }
  for (const mod of modifiersOfType(features, 'unarmored-movement')) {
    if (equipment.armor || equipment.shield) continue;
    const bonus = mod.perLevel[Math.min(level, 20)];
    if (!bonus) continue;
    walk += bonus;
    parts.push({ label: 'Unarmoured Movement', value: bonus });
  }

  modes.push({ type: 'walk', value: walk, calculation: { total: walk, parts } });

  for (const mod of modifiersOfType(features, 'movement')) {
    modes.push({ type: mod.mode, value: mod.matchWalk ? walk : mod.value });
  }
  return modes;
}

/** Senses granted by species traits or class features. */
export function buildSenses({ species, features, skills }) {
  const senses = [];
  const push = (type, range, source) => {
    const existing = senses.find((s) => s.type === type);
    if (existing) { existing.range = Math.max(existing.range, range); return; }
    senses.push({ type, range, source });
  };

  for (const trait of species.traits || []) {
    for (const mod of (trait.modifiers || []).filter((m) => m.type === 'sense')) {
      push(mod.sense, mod.range, `${species.name}: ${trait.name}`);
    }
  }
  for (const mod of modifiersOfType(features, 'sense')) {
    push(mod.sense, mod.range, 'class feature');
  }

  const perception = skills.find((s) => s.id === 'srd51:skill.perception');
  senses.push({
    type: 'passive Perception',
    value: passiveScore(perception ? perception.modifier : 0),
    source: 'derived',
  });
  return senses;
}

/** Damage resistances and condition riders that come from traits and features. */
export function buildDefenses({ species, features }) {
  const resistances = [];
  const conditionImmunities = [];
  const notes = [];

  for (const trait of species.traits || []) {
    for (const mod of trait.modifiers || []) {
      if (mod.type === 'resistance') resistances.push({ damage: mod.damage, source: `${species.name}: ${trait.name}` });
      if (mod.type === 'ancestry-resistance') notes.push(`${trait.name}: resistance is set by draconic ancestry`);
      if (mod.type === 'condition-advantage') notes.push(`advantage on saves against being ${mod.condition}`);
    }
  }
  for (const mod of modifiersOfType(features, 'condition-immunity')) {
    conditionImmunities.push(...mod.conditions);
  }
  return { resistances, conditionImmunities, notes };
}

/** Initiative, kept separate because features may modify it later. */
export function buildInitiative(mods, bonuses = 0) {
  const total = initiative(mods.dex, bonuses);
  return {
    total,
    parts: [
      { label: 'Dexterity', value: mods.dex },
      ...(bonuses ? [{ label: 'feature bonuses', value: bonuses }] : []),
    ],
  };
}

export { abilityModifier, ABILITIES };
