// Equipment.
//
// The loadout is chosen from what the character is legally proficient with, and
// then the AC and the attack records are *derived from what was chosen*. That
// direction matters: the alternative -- picking an AC that suits the role and
// then finding armour to justify it -- is exactly the failure mode this project
// exists to avoid.
//
// Armour is selected by computing the actual resulting AC for every legal
// option, including any unarmoured-defence feature, and taking the best (with a
// nudge toward the role's preferred silhouette). A monk therefore ends up
// unarmoured because the numbers say so, not because a rule said "monks wear no
// armour".

import { armorClass, meetsStrengthRequirement, weaponAbility } from '../../rules/srd51/combat.js';
import { modifiersOfType } from './class-builder.js';

const ARMOR_CATEGORIES = ['light', 'medium', 'heavy'];

/** Does the character's proficiency list cover this weapon? */
export function isProficientWithWeapon(weapon, weaponProfs) {
  for (const p of weaponProfs) {
    if (p.id === weapon.id) return true;
    if (p.id === weapon.proficiency) return true; // 'simple' / 'martial'
  }
  return false;
}

export const isProficientWithArmor = (armor, armorProfs) =>
  armorProfs.some((p) => p.id === armor.armorType)
  || (armor.armorType === 'shield' && armorProfs.some((p) => p.id === 'shields'));

/** The unarmoured formula a feature grants, if any, resolved to a number. */
function unarmoredFormula(features, mods) {
  const [mod] = modifiersOfType(features, 'unarmored-defense');
  if (!mod) return null;
  const parts = [{ label: 'unarmoured defence', value: mod.base, base: true }];
  let value = mod.base;
  for (const ability of mod.abilities) {
    value += mods[ability];
    if (mods[ability] !== 0) parts.push({ label: abilityLabel(ability), value: mods[ability] });
  }
  return { value, parts, allowShield: mod.allowShield };
}

const abilityLabel = (a) => ({
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
}[a]);

/** Style preferences, as a small AC-equivalent bonus during selection only. */
const STYLE_BIAS = {
  'heavy-martial': { heavy: 1.5, medium: 0.5, light: 0, none: -1, shield: 0.5 },
  'sword-and-board': { heavy: 1.5, medium: 0.75, light: 0, none: -1, shield: 2 },
  'two-handed': { heavy: 1, medium: 0.5, light: 0, none: -0.5, shield: -3 },
  'light-ranged': { heavy: -1.5, medium: 0, light: 1, none: 0, shield: -2 },
  'light-finesse': { heavy: -2, medium: 0, light: 1, none: 0.5, shield: -1 },
  'caster-armored': { heavy: 0, medium: 1, light: 0.5, none: -0.5, shield: 1.5 },
  'caster-light': { heavy: -2, medium: -0.5, light: 0.5, none: 0.5, shield: -0.5 },
};

/**
 * Chooses armour and shield. Every candidate is scored by the AC it actually
 * produces, so the choice is never inconsistent with the recorded number.
 */
export function chooseArmor({ registry, profile, proficiencies, features, mods, scores, cls, stream }) {
  const bias = STYLE_BIAS[profile] || STYLE_BIAS['light-ranged'];
  const unarmored = unarmoredFormula(features, mods);
  const metalRestricted = !!cls.armorRestriction;

  const shield = registry.get('srd51:armor.shield');
  const canShield = isProficientWithArmor(shield, proficiencies.armor);
  const shieldAllowedUnarmored = !unarmored || unarmored.allowShield !== false;

  const candidates = [];
  const pushCandidate = (armor, withShield) => {
    const ac = armorClass({
      armor: armor ? { ...armor } : null,
      shield: withShield ? { name: shield.name, acBonus: shield.acBonus } : null,
      dexMod: mods.dex,
      unarmoredFormula: armor ? null : unarmored,
    });
    const category = armor ? armor.armorType : 'none';
    const score = ac.total + (bias[category] || 0) + (withShield ? bias.shield : 0);
    candidates.push({ armor, shield: withShield ? shield : null, ac, score, category });
  };

  // Unarmoured is always legal.
  pushCandidate(null, false);
  if (canShield && shieldAllowedUnarmored) pushCandidate(null, true);

  for (const armor of registry.all('armor')) {
    if (armor.armorType === 'shield') continue;
    if (!ARMOR_CATEGORIES.includes(armor.armorType)) continue;
    if (!isProficientWithArmor(armor, proficiencies.armor)) continue;
    if (!meetsStrengthRequirement(armor, scores.str)) continue;
    // Druids will not wear metal; the restriction is on the class entity.
    if (metalRestricted && /chain|plate|scale|splint|ring/i.test(armor.name)) continue;
    pushCandidate(armor, false);
    if (canShield) pushCandidate(armor, true);
  }

  candidates.sort((a, b) => b.score - a.score);
  // Among near-equal options let the stream choose, so two scouts are not clones.
  const best = candidates[0].score;
  const shortlist = candidates.filter((c) => c.score >= best - 0.75);
  return stream.choice(shortlist);
}

/** Weapon shortlists per combat style, in order of preference. */
const WEAPON_PLANS = {
  'melee-heavy': { melee: ['greatsword', 'greataxe', 'maul', 'halberd', 'greatclub', 'quarterstaff'], ranged: ['javelin', 'handaxe'] },
  'two-handed': { melee: ['greataxe', 'greatsword', 'maul', 'glaive', 'greatclub'], ranged: ['javelin'] },
  'melee-defensive': { melee: ['longsword', 'warhammer', 'battleaxe', 'mace', 'morningstar', 'quarterstaff'], ranged: ['javelin', 'light-hammer'] },
  'finesse-melee': { melee: ['rapier', 'shortsword', 'scimitar', 'dagger'], ranged: ['dagger', 'shortbow'] },
  'finesse-skirmish': { melee: ['rapier', 'shortsword', 'scimitar', 'dagger'], ranged: ['shortbow', 'crossbow-hand', 'crossbow-light', 'dart'] },
  'ranged-skirmish': { melee: ['shortsword', 'scimitar', 'spear', 'quarterstaff', 'dagger'], ranged: ['longbow', 'shortbow', 'crossbow-light'] },
  ranged: { melee: ['shortsword', 'dagger', 'quarterstaff', 'mace'], ranged: ['longbow', 'crossbow-heavy', 'shortbow', 'crossbow-light', 'sling'] },
  support: { melee: ['mace', 'quarterstaff', 'scimitar', 'club'], ranged: ['crossbow-light', 'sling', 'dart'] },
};

/** Picks the first weapon in a preference list the character can actually use. */
function pickWeapon(registry, slugs, weaponProfs, twoHandedOK = true) {
  for (const slug of slugs) {
    const weapon = registry.get(`srd51:weapon.${slug}`);
    if (!weapon) continue;
    if (!isProficientWithWeapon(weapon, weaponProfs)) continue;
    if (!twoHandedOK && weapon.properties.includes('two-handed')) continue;
    return weapon;
  }
  return null;
}

/**
 * Builds the full inventory: weapons, armour, a pack, a spellcasting focus when
 * one is required, ammunition for any ranged weapon taken, and coin.
 */
export function buildEquipment({ registry, plan, cls, background, proficiencies, features, mods, scores, stream }) {
  const warnings = [];
  const armorChoice = chooseArmor({
    registry, profile: plan.equipmentProfile, proficiencies, features, mods, scores, cls, stream,
  });

  const weaponPlan = WEAPON_PLANS[plan.combatStyle] || WEAPON_PLANS.ranged;
  const holdingShield = !!armorChoice.shield;
  const melee = pickWeapon(registry, weaponPlan.melee, proficiencies.weapons, !holdingShield)
    || pickWeapon(registry, ['quarterstaff', 'club', 'dagger'], proficiencies.weapons, !holdingShield);
  const ranged = pickWeapon(registry, weaponPlan.ranged, proficiencies.weapons, !holdingShield)
    || pickWeapon(registry, ['dagger', 'dart', 'sling'], proficiencies.weapons, true);

  const inventory = [];
  const add = (entity, opts = {}) => {
    if (!entity) return;
    const existing = inventory.find((i) => i.id === entity.id);
    if (existing) { existing.quantity += opts.quantity || 1; return; }
    inventory.push({
      id: entity.id, name: entity.name, source: entity.source,
      quantity: opts.quantity || 1,
      equipped: !!opts.equipped,
      weight: entity.weight ?? 0,
      kind: entity.kind,
      ...(opts.note ? { note: opts.note } : {}),
    });
  };

  if (armorChoice.armor) add(armorChoice.armor, { equipped: true });
  if (armorChoice.shield) add(armorChoice.shield, { equipped: true });
  if (melee) add(melee, { equipped: true });
  if (ranged && ranged.id !== melee?.id) {
    // A two-handed ranged weapon cannot be wielded at the same time as a shield
    // or a two-handed melee weapon; it is carried, not equipped.
    const bothTwoHanded = ranged.properties.includes('two-handed')
      && (holdingShield || melee?.properties.includes('two-handed'));
    add(ranged, { equipped: !bothTwoHanded, note: bothTwoHanded ? 'stowed; requires two free hands' : undefined });
  }

  // Ammunition for anything that needs it.
  for (const weapon of [melee, ranged]) {
    if (weapon?.ammo) add(registry.get(weapon.ammo), { quantity: 1 });
  }

  // Class kit, background kit, and a focus when the class casts.
  const kit = cls.startingKit || {};
  add(registry.get(kit.pack));
  for (const id of kit.extras || []) add(registry.get(id));
  for (const id of background.equipment || []) add(registry.get(id));

  if (cls.spellcasting && kit.focus) {
    const hasFocus = inventory.some((i) => registry.get(i.id)?.focus === kit.focus);
    if (!hasFocus) {
      const focus = registry.all('gear').find((g) => g.focus === kit.focus);
      if (focus) add(focus, { equipped: true, note: 'spellcasting focus' });
      else warnings.push(`no ${kit.focus} focus available in the enabled content`);
    }
  }

  const goldPieces = Math.round((background.startingGold || 0) / 100);
  const currency = { cp: 0, sp: 0, ep: 0, gp: goldPieces, pp: 0 };

  const carried = inventory.reduce((sum, i) => sum + i.weight * i.quantity, 0);
  if (carried > scores.str * 15) {
    warnings.push(`carrying ${Math.round(carried)} lb against a capacity of ${scores.str * 15} lb`);
  }

  return {
    inventory,
    currency,
    armor: armorChoice.armor || null,
    shield: armorChoice.shield || null,
    armorClass: armorChoice.ac,
    meleeWeapon: melee,
    rangedWeapon: ranged,
    warnings,
  };
}

/**
 * Attack records, derived from the equipped weapons. Nothing is written down
 * that is not computed here from the weapon entity plus the ability scores.
 */
export function buildAttacks({ equipment, mods, proficiencyBonus, proficiencies, features, level, cls }) {
  const attacks = [];
  const seen = new Set();
  const fightingStyles = (features.filter((f) => f.name.includes('Fighting Style')) || []).length;

  for (const weapon of [equipment.meleeWeapon, equipment.rangedWeapon]) {
    if (!weapon || seen.has(weapon.id)) continue;
    seen.add(weapon.id);

    const ability = weaponAbility(weapon, mods);
    const proficient = isProficientWithWeapon(weapon, proficiencies.weapons);
    const bonus = mods[ability] + (proficient ? proficiencyBonus : 0);

    const twoHanded = weapon.properties.includes('two-handed')
      || (weapon.versatileDamage && !equipment.shield);
    const dice = twoHanded && weapon.versatileDamage ? weapon.versatileDamage : weapon.damage;

    attacks.push({
      name: weapon.name,
      source: { id: weapon.id, name: weapon.name, source: weapon.source },
      attackType: weapon.category === 'ranged' ? 'ranged' : 'melee',
      attackBonus: bonus,
      abilityUsed: ability,
      proficient,
      ...(weapon.category === 'melee' ? { reach: weapon.reach || 5 } : {}),
      ...(weapon.range ? { normalRange: weapon.range[0], longRange: weapon.range[1] } : {}),
      ...(weapon.thrownRange ? { thrownRange: weapon.thrownRange } : {}),
      damage: [{
        dice,
        bonus: mods[ability],
        type: weapon.damageType,
        note: twoHanded && weapon.versatileDamage ? 'two-handed' : undefined,
      }],
      properties: weapon.properties,
      calculation: {
        total: bonus,
        parts: [
          { label: abilityLabel(ability), value: mods[ability] },
          ...(proficient ? [{ label: 'proficiency bonus', value: proficiencyBonus }] : []),
        ],
      },
    });
  }

  // Features that add a damage rider get their own line rather than being
  // silently folded into a weapon's damage.
  const sneak = modifiersOfType(features, 'sneak-attack-dice');
  if (sneak.length) {
    attacks.push({
      name: 'Sneak Attack', attackType: 'special',
      source: { id: cls.id, name: cls.name, source: cls.source },
      damage: [{ dice: `${Math.ceil(level / 2)}d6`, bonus: 0, type: 'as weapon' }],
      properties: ['once per turn', 'requires advantage or an adjacent ally'],
      description: 'Extra damage with a finesse or ranged weapon.',
    });
  }
  const martialArts = modifiersOfType(features, 'martial-arts-die');
  if (martialArts.length) {
    const die = martialArts[0].perLevel[Math.min(level, 20)];
    const ability = mods.dex >= mods.str ? 'dex' : 'str';
    attacks.push({
      name: 'Unarmed Strike (Martial Arts)', attackType: 'melee', reach: 5,
      source: { id: cls.id, name: cls.name, source: cls.source },
      attackBonus: mods[ability] + proficiencyBonus,
      abilityUsed: ability, proficient: true,
      damage: [{ dice: `1d${die}`, bonus: mods[ability], type: 'bludgeoning' }],
      properties: ['bonus action strike after the Attack action'],
      calculation: {
        total: mods[ability] + proficiencyBonus,
        parts: [{ label: abilityLabel(ability), value: mods[ability] }, { label: 'proficiency bonus', value: proficiencyBonus }],
      },
    });
  }

  return { attacks, fightingStyles };
}

export { abilityLabel };
