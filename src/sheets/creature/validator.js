// Independent creature validation.
//
// Same discipline as the character validator: recompute from the recorded
// values, never trust a stored number. For an existing creature the strongest
// check available is *fidelity* -- every field must still match the source stat
// block, because the one thing normalisation must never do is quietly change
// a published creature. For variants and generated creatures, fidelity is not
// available, so the CR evaluation is run and its diagnostics are required.

import { CODES, Issues } from '../../core/validation.js';
import { ABILITIES, abilityModifier } from '../../rules/srd51/abilities.js';
import { formatCR, parseCR, proficiencyBonusForCR, xpForCR } from '../../rules/srd51/proficiency.js';
import { damageAverage } from '../../rules/srd51/combat.js';
import { crWithinPolicy } from '../../rules/srd51/challenge.js';

export function validateCreature(sheet, registry) {
  const issues = new Issues();

  issues.require('id', sheet.id, 'sheet id');
  issues.require('seed', sheet.seed, 'seed');
  issues.require('identity.name', sheet.identity?.name, 'name');
  issues.require('size', sheet.size, 'size');
  issues.require('creatureType', sheet.creatureType, 'creature type');

  // --- ability modifiers ---------------------------------------------------------
  for (const a of ABILITIES) {
    const score = sheet.abilityScores?.[a];
    if (!Number.isInteger(score) || score < 1 || score > 30) {
      issues.error(CODES.BAD_VALUE, `abilityScores.${a}`, `${a} score ${score} is out of range`);
      continue;
    }
    issues.expect(`abilityModifiers.${a}`, sheet.abilityModifiers[a], abilityModifier(score), `${a} modifier`);
  }

  // --- CR, XP and proficiency bonus -------------------------------------------------
  const cr = sheet.challengeRating;
  if (cr === undefined || cr === null) {
    issues.error(CODES.MISSING_FIELD, 'challengeRating', 'challenge rating missing');
  } else {
    issues.expect('xp', sheet.xp, xpForCR(cr), 'XP');
    issues.expect('proficiencyBonus', sheet.proficiencyBonus, proficiencyBonusForCR(cr), 'proficiency bonus');
    if (formatCR(parseCR(cr)) !== String(cr)) {
      issues.warn(CODES.BAD_VALUE, 'challengeRating', `challenge rating "${cr}" is not in canonical form`);
    }
  }

  // --- AC, HP, movement ----------------------------------------------------------------
  if (!(sheet.armorClass?.total > 0)) {
    issues.error(CODES.BAD_VALUE, 'armorClass.total', 'armour class must be positive');
  }
  const hp = sheet.hitPoints;
  if (!hp || !(hp.average > 0)) {
    issues.error(CODES.BAD_VALUE, 'hitPoints.average', 'average hit points must be positive');
  } else if (hp.formula) {
    // The printed average must be consistent with the printed formula.
    const expected = hitPointsFromFormula(hp.formula);
    if (expected !== null && Math.abs(expected - hp.average) > 1) {
      issues.error(CODES.MATH_MISMATCH, 'hitPoints',
        `average ${hp.average} does not match formula ${hp.formula} (${expected})`,
        { actual: hp.average, expected });
    }
  }
  issues.requireArray('movement', sheet.movement, 'movement', 1);

  // --- actions -----------------------------------------------------------------------------
  const allActions = [
    ...(sheet.actions || []), ...(sheet.bonusActions || []),
    ...(sheet.reactions || []), ...(sheet.legendaryActions || []),
  ];
  if (!(sheet.actions || []).length) {
    issues.error(CODES.MISSING_FIELD, 'actions', 'a creature needs at least one action');
  }
  for (const action of allActions) {
    const path = `actions.${action.id || action.name}`;
    issues.require(`${path}.name`, action.name, 'action name');
    if (action.attack && !Number.isInteger(action.attack.bonus)) {
      issues.error(CODES.BAD_VALUE, path, `${action.name} has a non-integer attack bonus`);
    }
    if (action.attack && !action.attack.reach && !action.attack.range) {
      issues.error(CODES.MISSING_FIELD, path, `${action.name} is an attack with neither reach nor range`);
    }
    if (action.save && !(action.save.dc > 0 && ABILITIES.includes(action.save.ability))) {
      issues.error(CODES.BAD_VALUE, path, `${action.name} has a malformed saving throw`);
    }
    for (const dmg of action.damage || []) {
      if (!dmg.type) {
        issues.error(CODES.MISSING_FIELD, `${path}.damage`, `${action.name} damage has no type`);
      }
      const expected = damageAverage(dmg);
      if (dmg.average !== undefined && Math.abs(dmg.average - expected) > 0.5) {
        issues.error(CODES.MATH_MISMATCH, `${path}.damage`,
          `${action.name} damage average ${dmg.average} recomputes to ${expected}`,
          { actual: dmg.average, expected });
      }
      if (dmg.dice && !/^\d+d\d+$/.test(dmg.dice)) {
        issues.error(CODES.BAD_VALUE, `${path}.damage`, `malformed damage dice "${dmg.dice}"`);
      }
    }
    // An action that neither deals damage, forces a save, nor describes itself
    // is not usable at the table.
    if (!(action.damage || []).length && !action.save && !action.description && !action.multiattackCount) {
      issues.error(CODES.MISSING_FIELD, path, `${action.name} has no damage, save, or description`);
    }
  }

  // --- references -------------------------------------------------------------------------------
  for (const skill of sheet.skills || []) {
    if (skill.id && !registry.has(skill.id)) {
      issues.error(CODES.UNRESOLVED_REF, 'skills', `unknown skill ${skill.id}`);
    }
  }
  for (const language of sheet.languages || []) {
    if (language.literal) continue;
    issues.requireRef('languages', language, registry, 'language');
  }
  if (sheet.spellcasting) {
    const sc = sheet.spellcasting;
    if (!(sc.dc > 0)) issues.error(CODES.BAD_VALUE, 'spellcasting.dc', 'spell save DC must be positive');
    if (!ABILITIES.includes(sc.ability)) {
      issues.error(CODES.BAD_VALUE, 'spellcasting.ability', `unknown casting ability "${sc.ability}"`);
    }
    for (const group of sc.groups || []) {
      for (const spell of group.spells || []) {
        if (spell.unresolved || (spell.id && !registry.has(spell.id))) {
          issues.error(CODES.UNRESOLVED_REF, 'spellcasting.groups', `unknown spell ${spell.id || spell.name}`);
        }
      }
    }
  }

  // --- provenance and mode-specific rules ---------------------------------------------------------
  if (sheet.sourceMode === 'existing') {
    issues.requireRef('baseCreature', sheet.baseCreature, registry, 'base creature');
    const source = registry.get(sheet.baseCreature?.id);
    if (source) validateFidelity(sheet, source, issues);
    if (sheet.crEvaluation) {
      issues.warn(CODES.CR_POLICY, 'crEvaluation',
        'an existing creature carries its printed CR; the evaluation is informational only');
    }
  } else {
    if (!sheet.contentNotice) {
      issues.error(CODES.PROVENANCE, 'contentNotice',
        'generated and variant creatures must be labelled as generated game content');
    }
    if (!sheet.crEvaluation) {
      issues.error(CODES.MISSING_FIELD, 'crEvaluation',
        `${sheet.sourceMode} creatures must carry CR evaluation diagnostics`);
    } else if (sheet.crEvaluation.targetCR != null
      && !crWithinPolicy(sheet.crEvaluation.targetCR, sheet.challengeRating)) {
      issues.error(CODES.CR_POLICY, 'challengeRating',
        `declared CR ${sheet.challengeRating} is more than one step from the requested CR ${sheet.crEvaluation.targetCR}`);
    }
    if (sheet.sourceMode === 'variant') {
      issues.requireArray('transforms', sheet.transforms, 'applied transforms', 1);
      issues.requireRef('baseCreature', sheet.baseCreature, registry, 'base creature');
    }
  }

  return issues.result();
}

/**
 * Fidelity check for normalised creatures: the sheet must still say exactly
 * what the source stat block says. This is the check that would catch a
 * normaliser quietly "fixing" a printed value.
 */
function validateFidelity(sheet, source, issues) {
  issues.expect('armorClass.total', sheet.armorClass.total, source.armorClass.value, 'armour class');
  issues.expect('hitPoints.average', sheet.hitPoints.average, source.hitPoints.average, 'average hit points');
  issues.expect('hitPoints.formula', sheet.hitPoints.formula, source.hitPoints.formula, 'hit point formula');
  issues.expect('challengeRating', String(sheet.challengeRating), String(source.cr), 'challenge rating');
  issues.expect('size', sheet.size, source.size, 'size');
  issues.expect('creatureType', sheet.creatureType, source.creatureType, 'creature type');
  for (const a of ABILITIES) {
    issues.expect(`abilityScores.${a}`, sheet.abilityScores[a], source.abilityScores[a], `${a} score`);
  }
  issues.expect('actions.length', (sheet.actions || []).length, (source.actions || []).length, 'action count');
  issues.expect('traits.length', (sheet.traits || []).length, (source.traits || []).length, 'trait count');

  for (const action of source.actions || []) {
    const mirrored = (sheet.actions || []).find((a) => a.name === action.name);
    if (!mirrored) {
      issues.error(CODES.COUNT_MISMATCH, 'actions', `source action "${action.name}" is missing from the sheet`);
      continue;
    }
    if (action.attack) {
      issues.expect(`actions.${action.name}.attackBonus`, mirrored.attack?.bonus, action.attack.bonus,
        `${action.name} attack bonus`);
    }
    for (let i = 0; i < (action.damage || []).length; i++) {
      issues.expect(`actions.${action.name}.damage[${i}].dice`,
        mirrored.damage?.[i]?.dice, action.damage[i].dice, `${action.name} damage dice`);
    }
  }
}

/** "9d10 + 45" -> 94.5 -> 94. Returns null for formulas it cannot parse. */
function hitPointsFromFormula(formula) {
  const m = /^(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?/.exec(String(formula).trim());
  if (!m) return null;
  const count = Number(m[1]);
  const sides = Number(m[2]);
  const bonus = m[4] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0;
  return Math.floor(count * (sides + 1) / 2) + bonus;
}

export { hitPointsFromFormula };
