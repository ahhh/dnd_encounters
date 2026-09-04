// Independent character validation.
//
// This module deliberately does not import a single builder. It takes the
// finished sheet plus the registry and recomputes every derived number from the
// *recorded choices* -- the class entity, the armour entity, the ability
// breakdown -- using only the rules primitives. If the builder and the
// validator ever disagree, one of them is wrong and the sheet is rejected.
//
// A sheet with any error here is never returned as a success.

import { CODES, Issues } from '../../core/validation.js';
import { ABILITIES, abilityModifier } from '../../rules/srd51/abilities.js';
import { proficiencyBonusForLevel } from '../../rules/srd51/proficiency.js';
import { averageHitDie, spellSlots } from '../../rules/srd51/progression.js';
import {
  armorClass, attackBonus, meetsStrengthRequirement,
  spellAttackBonus, spellSaveDC, weaponAbility,
} from '../../rules/srd51/combat.js';

export function validateCharacter(sheet, registry) {
  const issues = new Issues();

  // --- structure and references --------------------------------------------------
  issues.require('id', sheet.id, 'sheet id');
  issues.require('seed', sheet.seed, 'seed');
  issues.require('identity.name', sheet.identity?.name, 'name');
  if (!(sheet.level >= 1 && sheet.level <= 20)) {
    issues.error(CODES.BAD_VALUE, 'level', `level ${sheet.level} is outside 1-20`);
  }

  issues.requireRef('species', sheet.species, registry, 'species');
  issues.requireRef('background', sheet.background, registry, 'background');
  issues.requireArray('classLevels', sheet.classLevels, 'class levels', 1);

  const species = registry.get(sheet.species?.id);
  const background = registry.get(sheet.background?.id);
  const classEntry = registry.get(sheet.classLevels?.[0]?.id);
  if (!classEntry) {
    issues.error(CODES.UNRESOLVED_REF, 'classLevels[0]', 'class does not resolve; cannot validate further');
    return issues.result();
  }
  if (sheet.classLevels[0].level !== sheet.level) {
    issues.error(CODES.MATH_MISMATCH, 'classLevels[0].level',
      'class level does not match character level');
  }

  const level = sheet.level;
  const mods = {};
  for (const a of ABILITIES) mods[a] = abilityModifier(sheet.abilityScores[a]);

  // --- ability scores and modifiers -------------------------------------------------
  for (const a of ABILITIES) {
    const score = sheet.abilityScores[a];
    if (!Number.isInteger(score) || score < 1 || score > 30) {
      issues.error(CODES.BAD_VALUE, `abilityScores.${a}`, `${a} score ${score} is out of range`);
      continue;
    }
    issues.expect(`abilityModifiers.${a}`, sheet.abilityModifiers[a], mods[a], `${a} modifier`);
  }
  validateAbilityProvenance(sheet, issues);

  // --- proficiency bonus ------------------------------------------------------------
  const pb = proficiencyBonusForLevel(level);
  issues.expect('proficiencyBonus', sheet.proficiencyBonus, pb, 'proficiency bonus');

  // --- class features ---------------------------------------------------------------
  const subclassSlug = sheet.classLevels[0].subclass?.slug || null;
  if (level >= classEntry.subclassLevel && !subclassSlug) {
    issues.error(CODES.MISSING_FIELD, 'classLevels[0].subclass',
      `a level ${level} ${classEntry.name} must have chosen a ${classEntry.subclassLabel}`);
  }
  if (subclassSlug && !classEntry.subclasses.some((s) => s.slug === subclassSlug)) {
    issues.error(CODES.ILLEGAL_CHOICE, 'classLevels[0].subclass',
      `${subclassSlug} is not a ${classEntry.name} subclass`);
  }
  const expected = classEntry.features
    .filter((f) => f.level <= level && (!f.subclass || f.subclass === subclassSlug))
    .map((f) => `${f.level}:${f.name}`);
  const actual = (sheet.features || []).map((f) => `${f.level}:${f.name}`);
  for (const key of expected) {
    if (!actual.includes(key)) {
      issues.error(CODES.COUNT_MISMATCH, 'features', `missing class feature ${key}`);
    }
  }
  for (const key of actual) {
    if (!expected.includes(key)) {
      issues.error(CODES.ILLEGAL_CHOICE, 'features', `feature ${key} is not granted at this level`);
    }
  }

  // --- hit points and hit dice -------------------------------------------------------
  validateHitPoints(sheet, classEntry, mods, issues);

  const hd = sheet.hitDice?.[0];
  if (!hd) issues.error(CODES.MISSING_FIELD, 'hitDice', 'hit dice missing');
  else {
    issues.expect('hitDice[0].die', hd.die, `d${classEntry.hitDie}`, 'hit die');
    issues.expect('hitDice[0].total', hd.total, level, 'hit dice count');
  }

  // --- armour class -------------------------------------------------------------------
  validateArmorClass(sheet, registry, mods, issues);

  // --- initiative and movement ----------------------------------------------------------
  issues.expect('initiative', sheet.initiative, mods.dex, 'initiative');
  const walk = sheet.movement?.find((m) => m.type === 'walk');
  if (!walk) issues.error(CODES.MISSING_FIELD, 'movement', 'no walking speed');
  else if (walk.value < species.speed) {
    issues.error(CODES.MATH_MISMATCH, 'movement',
      `walking speed ${walk.value} is below the ${species.name} base of ${species.speed}`);
  }

  // --- saving throws ---------------------------------------------------------------------
  for (const save of sheet.savingThrows || []) {
    const proficient = save.proficient;
    issues.expect(`savingThrows.${save.ability}`, save.modifier,
      mods[save.ability] + (proficient ? pb : 0), `${save.ability} save`);
  }
  for (const ability of classEntry.savingThrows) {
    const save = (sheet.savingThrows || []).find((s) => s.ability === ability);
    if (!save?.proficient) {
      issues.error(CODES.ILLEGAL_CHOICE, `savingThrows.${ability}`,
        `${classEntry.name} grants ${ability} saving throw proficiency`);
    }
  }

  // --- skills -----------------------------------------------------------------------------
  const expertise = new Set(sheet.expertise || []);
  for (const skill of sheet.skills || []) {
    const entity = registry.get(skill.id);
    if (!entity) {
      issues.error(CODES.UNRESOLVED_REF, `skills.${skill.id}`, `unknown skill ${skill.id}`);
      continue;
    }
    let expectedMod = mods[entity.ability];
    if (skill.proficiency === 'expertise') expectedMod += pb * 2;
    else if (skill.proficiency === 'proficient') expectedMod += pb;
    else if (skill.proficiency === 'half') expectedMod += Math.floor(pb / 2);
    issues.expect(`skills.${entity.slug}`, skill.modifier, expectedMod, `${entity.name} modifier`);

    if (skill.proficiency !== 'none' && skill.proficiency !== 'half' && !skill.source) {
      issues.error(CODES.PROVENANCE, `skills.${entity.slug}`,
        `${entity.name} is proficient with no recorded source`);
    }
    if (expertise.has(skill.id) && skill.proficiency !== 'expertise') {
      issues.error(CODES.MATH_MISMATCH, `skills.${entity.slug}`,
        `${entity.name} is listed as expertise but not scored as one`);
    }
  }
  validateSkillEntitlement(sheet, classEntry, background, species, issues);

  // --- proficiency and equipment legality -----------------------------------------------------
  validateEquipment(sheet, registry, classEntry, issues);

  // --- attacks -----------------------------------------------------------------------------------
  validateAttacks(sheet, registry, mods, pb, issues);

  // --- feats --------------------------------------------------------------------------------------
  for (const feat of sheet.feats || []) {
    const entity = registry.get(feat.id);
    if (!entity) {
      issues.error(CODES.UNRESOLVED_REF, 'feats', `unknown feat ${feat.id}`);
      continue;
    }
    for (const prereq of entity.prerequisites || []) {
      if (prereq.type === 'ability' && sheet.abilityScores[prereq.ability] < prereq.min) {
        issues.error(CODES.PREREQ_FAILED, 'feats',
          `${entity.name} requires ${prereq.ability} ${prereq.min}, character has ${sheet.abilityScores[prereq.ability]}`);
      }
    }
  }
  const asiCount = (sheet.buildChoices || []).filter((c) => c.choiceType === 'asi' || c.choiceType === 'feat').length;
  const expectedASI = classEntry.asiLevels.filter((l) => l <= level).length;
  issues.expect('buildChoices.asi', asiCount, expectedASI, 'ability score improvement count');

  // --- languages ------------------------------------------------------------------------------------
  for (const lang of sheet.languages || []) {
    issues.requireRef('languages', lang, registry, 'language');
  }

  // --- spellcasting -----------------------------------------------------------------------------------
  validateSpellcasting(sheet, registry, classEntry, mods, pb, issues);

  // --- provenance -------------------------------------------------------------------------------------
  if (!sheet.generation?.attribution?.length) {
    issues.warn(CODES.PROVENANCE, 'generation.attribution', 'no attribution recorded');
  }

  return issues.result();
}

// --- individual checks ---------------------------------------------------------------

function validateAbilityProvenance(sheet, issues) {
  const gen = sheet.abilityGeneration;
  if (!gen) {
    issues.error(CODES.MISSING_FIELD, 'abilityGeneration', 'ability generation record missing');
    return;
  }
  // Base + species adjustments + recorded ASIs must reach the final score.
  const asiDelta = {};
  for (const choice of sheet.buildChoices || []) {
    if (choice.choiceType !== 'asi') continue;
    for (const sel of choice.selected || []) {
      if (!sel.ability) continue;
      asiDelta[sel.ability] = (asiDelta[sel.ability] || 0) + sel.value;
    }
  }
  for (const [ability, entry] of Object.entries(gen.breakdown || {})) {
    const featureBump = (sheet.features || [])
      .flatMap((f) => f.modifiers || [])
      .filter((m) => m.type === 'ability-increase' && m.ability === ability)
      .reduce((n, m) => n + m.value, 0);
    const cap = featureBump ? 24 : 20;
    const expected = Math.min(cap, entry.final + (asiDelta[ability] || 0) + featureBump);
    if (sheet.abilityScores[ability] !== expected) {
      issues.error(CODES.MATH_MISMATCH, `abilityScores.${ability}`,
        `${ability} is ${sheet.abilityScores[ability]}; base ${entry.base} + adjustments + improvements recomputes to ${expected}`,
        { base: entry.base, adjustments: entry.adjustments, asi: asiDelta[ability] || 0 });
    }
  }
}

function validateHitPoints(sheet, classEntry, mods, issues) {
  const hp = sheet.hitPoints;
  if (!hp) {
    issues.error(CODES.MISSING_FIELD, 'hitPoints', 'hit points missing');
    return;
  }
  if (hp.policy === 'rolled') {
    // Rolled HP cannot be recomputed exactly; check the plausible envelope.
    const min = classEntry.hitDie + (sheet.level - 1) * 1 + mods.con * sheet.level;
    const max = classEntry.hitDie * sheet.level + mods.con * sheet.level + sheet.level;
    if (hp.max < Math.max(1, min) || hp.max > max) {
      issues.error(CODES.BAD_VALUE, 'hitPoints.max',
        `rolled hit points ${hp.max} fall outside the possible range ${Math.max(1, min)}-${max}`);
    }
    return;
  }

  const perLevel = averageHitDie(classEntry.hitDie);
  let expected = classEntry.hitDie + (sheet.level - 1) * perLevel + mods.con * sheet.level;
  for (const feature of sheet.features || []) {
    for (const mod of (feature.modifiers || []).filter((m) => m.type === 'hp-per-level')) {
      expected += mod.value * sheet.level;
    }
  }
  issues.expect('hitPoints.max', hp.max, Math.max(1, expected), 'hit point maximum');
}

function validateArmorClass(sheet, registry, mods, issues) {
  const ac = sheet.armorClass;
  if (!ac) {
    issues.error(CODES.MISSING_FIELD, 'armorClass', 'armour class missing');
    return;
  }
  const armor = ac.armor ? registry.get(ac.armor.id) : null;
  const shield = ac.shield ? registry.get(ac.shield.id) : null;

  // Recover the unarmoured formula from the sheet's own features.
  let unarmoredFormula = null;
  for (const feature of sheet.features || []) {
    for (const mod of (feature.modifiers || []).filter((m) => m.type === 'unarmored-defense')) {
      let value = mod.base;
      const parts = [{ label: 'unarmoured defence', value: mod.base, base: true }];
      for (const a of mod.abilities) {
        value += mods[a];
        parts.push({ label: a, value: mods[a] });
      }
      if (!unarmoredFormula || value > unarmoredFormula.value) unarmoredFormula = { value, parts };
    }
  }

  const recomputed = armorClass({
    armor: armor ? { ...armor } : null,
    shield: shield ? { name: shield.name, acBonus: shield.acBonus } : null,
    dexMod: mods.dex,
    unarmoredFormula: armor ? null : unarmoredFormula,
  });
  issues.expect('armorClass.total', ac.total, recomputed.total, 'armour class');

  if (armor && !meetsStrengthRequirement(armor, sheet.abilityScores.str)) {
    issues.error(CODES.ILLEGAL_CHOICE, 'armorClass.armor',
      `${armor.name} requires Strength ${armor.strengthRequirement}`);
  }
}

function validateSkillEntitlement(sheet, classEntry, background, species, issues) {
  const fromClass = (sheet.proficiencies || [])
    .filter((p) => p.type === 'skill' && p.source?.type === 'class');
  if (fromClass.length > classEntry.skillChoices.count) {
    issues.error(CODES.COUNT_MISMATCH, 'proficiencies',
      `${fromClass.length} class skill proficiencies but ${classEntry.name} grants ${classEntry.skillChoices.count}`);
  }
  if (classEntry.skillChoices.from !== 'any') {
    for (const p of fromClass) {
      if (!classEntry.skillChoices.from.includes(p.id)) {
        issues.error(CODES.ILLEGAL_CHOICE, 'proficiencies',
          `${p.id} is not on the ${classEntry.name} skill list`);
      }
    }
  }
  const fromBackground = (sheet.proficiencies || [])
    .filter((p) => p.type === 'skill' && p.source?.type === 'background');
  for (const p of fromBackground) {
    if (!background.skills.includes(p.id)) {
      issues.error(CODES.ILLEGAL_CHOICE, 'proficiencies',
        `${p.id} is not granted by ${background.name}`);
    }
  }
  const speciesSkills = (species.traits || [])
    .flatMap((t) => (t.modifiers || []).filter((m) => m.type === 'skill-proficiency'))
    .flatMap((m) => m.ids);
  for (const p of (sheet.proficiencies || []).filter((x) => x.type === 'skill' && x.source?.type === 'species')) {
    if (!speciesSkills.includes(p.id)) {
      issues.error(CODES.ILLEGAL_CHOICE, 'proficiencies',
        `${p.id} is not granted by ${species.name}`);
    }
  }
}

function validateEquipment(sheet, registry, classEntry, issues) {
  const armorProfs = new Set((sheet.proficiencies || [])
    .filter((p) => p.type === 'armor').map((p) => p.id));
  const weaponProfs = new Set((sheet.proficiencies || [])
    .filter((p) => p.type === 'weapon').map((p) => p.id));

  for (const item of sheet.equipment || []) {
    const entity = registry.get(item.id);
    if (!entity) {
      issues.error(CODES.UNRESOLVED_REF, 'equipment', `unknown item ${item.id}`);
      continue;
    }
    if (!item.equipped) continue;
    if (entity.kind === 'armor') {
      const category = entity.armorType === 'shield' ? 'shields' : entity.armorType;
      if (!armorProfs.has(category)) {
        issues.error(CODES.ILLEGAL_CHOICE, 'equipment',
          `${entity.name} is equipped without ${category} armour proficiency`);
      }
      if (classEntry.armorRestriction && /chain|plate|scale|splint|ring/i.test(entity.name)) {
        issues.error(CODES.ILLEGAL_CHOICE, 'equipment',
          `${classEntry.name}: ${entity.name} conflicts with ${classEntry.armorRestriction}`);
      }
    }
    if (entity.kind === 'weapon' && !weaponProfs.has(entity.id) && !weaponProfs.has(entity.proficiency)) {
      issues.warn(CODES.ILLEGAL_CHOICE, 'equipment',
        `${entity.name} is equipped without proficiency (attacks with it lose the proficiency bonus)`);
    }
  }

  // Hands: a shield plus a two-handed weapon cannot both be equipped.
  const equipped = (sheet.equipment || []).filter((i) => i.equipped)
    .map((i) => registry.get(i.id)).filter(Boolean);
  const hasShield = equipped.some((e) => e.armorType === 'shield');
  const twoHanded = equipped.filter((e) => e.kind === 'weapon' && e.properties?.includes('two-handed'));
  if (hasShield && twoHanded.length) {
    issues.error(CODES.ILLEGAL_CHOICE, 'equipment',
      `${twoHanded[0].name} needs two hands and cannot be used with a shield`);
  }
  if (twoHanded.length > 1) {
    issues.error(CODES.ILLEGAL_CHOICE, 'equipment',
      `two two-handed weapons are equipped at once: ${twoHanded.map((w) => w.name).join(', ')}`);
  }

  // Ammunition must be present for any equipped weapon that needs it.
  for (const weapon of equipped.filter((e) => e.kind === 'weapon' && e.ammo)) {
    if (!(sheet.equipment || []).some((i) => i.id === weapon.ammo)) {
      issues.error(CODES.MISSING_FIELD, 'equipment',
        `${weapon.name} is equipped with no ammunition`);
    }
  }
}

function validateAttacks(sheet, registry, mods, pb, issues) {
  for (const attack of sheet.attacks || []) {
    if (attack.attackType === 'special') continue;
    const weapon = registry.get(attack.source?.id);
    if (!weapon || weapon.kind !== 'weapon') continue; // unarmed strikes have no weapon entity

    const ability = weaponAbility(weapon, mods);
    const expectedBonus = attackBonus(mods[ability], attack.proficient, pb);
    issues.expect(`attacks.${weapon.slug}.attackBonus`, attack.attackBonus, expectedBonus,
      `${weapon.name} attack bonus`);
    issues.expect(`attacks.${weapon.slug}.ability`, attack.abilityUsed, ability,
      `${weapon.name} attack ability`);

    const damage = attack.damage?.[0];
    if (!damage) {
      issues.error(CODES.MISSING_FIELD, `attacks.${weapon.slug}`, `${weapon.name} has no damage`);
      continue;
    }
    issues.expect(`attacks.${weapon.slug}.damageBonus`, damage.bonus, mods[ability],
      `${weapon.name} damage bonus`);
    const legalDice = [weapon.damage, weapon.versatileDamage].filter(Boolean);
    if (!legalDice.includes(damage.dice)) {
      issues.error(CODES.BAD_VALUE, `attacks.${weapon.slug}.damage`,
        `${weapon.name} damage dice ${damage.dice} is not ${legalDice.join(' or ')}`);
    }
    if (damage.type !== weapon.damageType) {
      issues.error(CODES.BAD_VALUE, `attacks.${weapon.slug}.damage`,
        `${weapon.name} damage type ${damage.type} should be ${weapon.damageType}`);
    }
  }
}

function validateSpellcasting(sheet, registry, classEntry, mods, pb, issues) {
  const sc = sheet.spellcasting;
  const progression = classEntry.spellcasting;

  if (!sc) {
    if (progression && (!progression.startLevel || sheet.level >= progression.startLevel)) {
      issues.error(CODES.MISSING_FIELD, 'spellcasting',
        `a level ${sheet.level} ${classEntry.name} has spellcasting`);
    }
    return;
  }
  if (!progression) {
    issues.error(CODES.ILLEGAL_CHOICE, 'spellcasting',
      `${classEntry.name} does not cast spells`);
    return;
  }

  issues.expect('spellcasting.ability', sc.ability, progression.ability, 'casting ability');
  const abilityMod = mods[progression.ability];
  issues.expect('spellcasting.spellSaveDC', sc.spellSaveDC, spellSaveDC(abilityMod, pb), 'spell save DC');
  issues.expect('spellcasting.spellAttackBonus', sc.spellAttackBonus, spellAttackBonus(abilityMod, pb), 'spell attack bonus');

  const expectedSlots = spellSlots(progression.progression, sheet.level);
  const actualSlots = sc.slots || [];
  issues.expect('spellcasting.slots.length', actualSlots.length, expectedSlots.length, 'spell slot levels');
  for (const slot of expectedSlots) {
    const found = actualSlots.find((s) => s.level === slot.level);
    if (!found) {
      issues.error(CODES.COUNT_MISMATCH, 'spellcasting.slots', `no level ${slot.level} slots recorded`);
    } else {
      issues.expect(`spellcasting.slots.${slot.level}`, found.total, slot.total, `level ${slot.level} slots`);
    }
  }

  const maxLevel = expectedSlots.length ? Math.max(...expectedSlots.map((s) => s.level)) : 0;
  const expectedCantrips = progression.cantripsKnown
    ? progression.cantripsKnown[Math.min(sheet.level, 20)] : 0;
  const bonusCantripCount = (sheet.features || [])
    .flatMap((f) => f.modifiers || [])
    .filter((m) => m.type === 'bonus-cantrip').length;
  issues.expect('spellcasting.cantrips', (sc.cantrips || []).length,
    expectedCantrips + bonusCantripCount, 'cantrips known');

  const listSlug = progression.listSlug;
  // `anyList` waives the class-list check for spells a feature granted;
  // `anySlot` waives the slot-level cap for spells cast without a slot at all
  // (mystic arcanum, innate species casting), which is the whole point of them.
  const checkSpells = (list, path, { anyList = false, anySlot = false } = {}) => {
    for (const ref of list || []) {
      const spell = registry.get(ref.id);
      if (!spell) {
        issues.error(CODES.UNRESOLVED_REF, path, `unknown spell ${ref.id}`);
        continue;
      }
      if (!anySlot && spell.level > maxLevel && spell.level > 0) {
        issues.error(CODES.ILLEGAL_CHOICE, path,
          `${spell.name} is level ${spell.level}; the highest castable level is ${maxLevel}`);
      }
      if (!anyList && !spell.classes.includes(listSlug) && !isGrantedSpell(sheet, spell.id)) {
        issues.error(CODES.ILLEGAL_CHOICE, path,
          `${spell.name} is not on the ${classEntry.name} spell list`);
      }
    }
  };

  for (const ref of sc.cantrips || []) {
    const spell = registry.get(ref.id);
    if (!spell) { issues.error(CODES.UNRESOLVED_REF, 'spellcasting.cantrips', `unknown spell ${ref.id}`); continue; }
    if (spell.level !== 0) {
      issues.error(CODES.ILLEGAL_CHOICE, 'spellcasting.cantrips', `${spell.name} is not a cantrip`);
    }
  }

  if (sc.knownSpells) {
    const expectedKnown = progression.spellsKnown?.[Math.min(sheet.level, 20)] ?? 0;
    issues.expect('spellcasting.knownSpells.length', sc.knownSpells.length, expectedKnown, 'spells known');
    checkSpells(sc.knownSpells, 'spellcasting.knownSpells');
  }
  if (sc.preparedSpells) {
    let expectedPrepared = 0;
    if (progression.preparedFormula === 'ability+level') expectedPrepared = Math.max(1, abilityMod + sheet.level);
    else if (progression.preparedFormula === 'ability+half-level') expectedPrepared = Math.max(1, abilityMod + Math.floor(sheet.level / 2));
    issues.expect('spellcasting.preparedSpells.length', sc.preparedSpells.length, expectedPrepared, 'spells prepared');
    checkSpells(sc.preparedSpells, 'spellcasting.preparedSpells');
  }
  if (sc.spellbook) {
    checkSpells(sc.spellbook, 'spellcasting.spellbook');
  }
  if (sc.alwaysPrepared) checkSpells(sc.alwaysPrepared, 'spellcasting.alwaysPrepared', { anyList: true });
  if (sc.innateSpells) checkSpells(sc.innateSpells, 'spellcasting.innateSpells', { anyList: true, anySlot: true });
  if (sc.mysticArcanum) checkSpells(sc.mysticArcanum, 'spellcasting.mysticArcanum', { anyList: true, anySlot: true });
}

/** Some spells reach a character through a feature rather than the class list. */
function isGrantedSpell(sheet, spellId) {
  return (sheet.features || [])
    .flatMap((f) => f.modifiers || [])
    .filter((m) => m.type === 'expanded-list' || m.type === 'domain-spells')
    .some((m) => (m.spells || []).includes(spellId));
}
