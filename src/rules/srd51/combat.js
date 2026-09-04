// Derived combat maths.
//
// Every one of these is a pure function of values already on the sheet. The
// builders call them to produce numbers; the validators call them again to
// check the numbers. Because they take explicit arguments rather than reading a
// sheet, a validator cannot accidentally "check" a value against itself.

import { abilityModifier } from './abilities.js';

/** Weapon attack bonus: ability + proficiency (when proficient) + magic. */
export const attackBonus = (abilityMod, proficient, proficiencyBonus, magic = 0) =>
  abilityMod + (proficient ? proficiencyBonus : 0) + magic;

/** Spell save DC and spell attack bonus both hang off the casting ability. */
export const spellSaveDC = (abilityMod, proficiencyBonus, magic = 0) =>
  8 + abilityMod + proficiencyBonus + magic;

export const spellAttackBonus = (abilityMod, proficiencyBonus, magic = 0) =>
  abilityMod + proficiencyBonus + magic;

/**
 * Armour Class from an actual equipped loadout. `armor` may be null (unarmoured),
 * and an unarmoured-defence feature supplies its own formula instead.
 */
export function armorClass({ armor, shield, dexMod, unarmoredFormula, bonuses = [] }) {
  const parts = [];
  let base;
  if (armor) {
    const capped = armor.maxDexBonus === null || armor.maxDexBonus === undefined
      ? dexMod
      : Math.min(dexMod, armor.maxDexBonus);
    base = armor.baseAC + capped;
    parts.push({ label: armor.name, value: armor.baseAC, base: true });
    if (capped !== 0) parts.push({ label: 'Dexterity', value: capped });
    if (armor.magicBonus) {
      base += armor.magicBonus;
      parts.push({ label: 'magic', value: armor.magicBonus });
    }
  } else if (unarmoredFormula) {
    base = unarmoredFormula.value;
    parts.push(...unarmoredFormula.parts);
  } else {
    base = 10 + dexMod;
    parts.push({ label: 'unarmoured', value: 10, base: true });
    if (dexMod !== 0) parts.push({ label: 'Dexterity', value: dexMod });
  }
  if (shield) {
    base += shield.acBonus;
    parts.push({ label: shield.name, value: shield.acBonus });
  }
  for (const b of bonuses) {
    base += b.value;
    parts.push(b);
  }
  return { total: base, parts };
}

/** Whether a Strength score meets an armour's minimum, per SRD heavy armour. */
export const meetsStrengthRequirement = (armor, strScore) =>
  !armor || !armor.strengthRequirement || strScore >= armor.strengthRequirement;

/**
 * Which ability a weapon attack uses. Finesse takes the better of STR/DEX,
 * ranged weapons use DEX, everything else STR. Thrown melee weapons still use
 * the melee ability, which is why `attackType` alone is not enough.
 */
export function weaponAbility(weapon, mods) {
  const props = weapon.properties || [];
  if (props.includes('finesse')) return mods.dex >= mods.str ? 'dex' : 'str';
  if (weapon.category === 'ranged') return 'dex';
  return 'str';
}

/** "1d8" -> average 4.5. Used by CR evaluation and by damage display. */
export function averageDamage(expr) {
  const m = /^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/.exec(String(expr).trim());
  if (!m) {
    const flat = Number(expr);
    return Number.isFinite(flat) ? flat : 0;
  }
  const count = Number(m[1]);
  const sides = Number(m[2]);
  const sign = m[3] === '-' ? -1 : 1;
  const bonus = m[4] ? sign * Number(m[4]) : 0;
  return count * (sides + 1) / 2 + bonus;
}

/** Renders `{dice:'1d8', bonus:3}` as "1d8 + 3". */
export function damageString(dmg) {
  const parts = [];
  if (dmg.dice) parts.push(dmg.dice);
  if (dmg.bonus) parts.push(`${dmg.bonus > 0 ? '+' : '-'} ${Math.abs(dmg.bonus)}`);
  const text = parts.join(' ') || '0';
  return dmg.type ? `${text} ${dmg.type}` : text;
}

/** Average of a full damage expression including its flat bonus. */
export const damageAverage = (dmg) =>
  averageDamage(dmg.dice || '0') + (dmg.bonus || 0);

/** Initiative is Dexterity plus whatever structured bonuses apply. */
export const initiative = (dexMod, bonuses = 0) => dexMod + bonuses;

/** Passive score: 10 + the skill's total modifier. */
export const passiveScore = (skillModifier, bonus = 0) => 10 + skillModifier + bonus;

export { abilityModifier };
