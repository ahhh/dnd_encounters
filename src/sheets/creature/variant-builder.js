// Variant creatures.
//
// A variant starts from a real stat block and applies *documented* transforms
// -- each one a named, bounded change with a stated effect -- and is then
// re-evaluated by the CR model. It is never labelled with the base creature's
// CR: the whole point of changing the numbers is that the rating may move, and
// pretending otherwise is the failure mode this project is built to avoid.
//
// Every variant is explicitly marked as generated content, never as an official
// creature.

import { formatCR, parseCR, proficiencyBonusForCR, xpForCR } from '../../rules/srd51/proficiency.js';
import { evaluateCreature } from './cr-evaluator.js';

/**
 * Adjusts the flat term of a hit point formula. Transforms must leave the
 * formula machine-readable -- the validator recomputes the average from it, so
 * appending prose like "(+15 hardened)" would break the very check that proves
 * the variant is internally consistent.
 */
function adjustFormula(formula, delta) {
  const m = /^(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?$/.exec(String(formula).trim());
  if (!m) return formula;
  const flat = (m[4] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0) + delta;
  const dice = `${m[1]}d${m[2]}`;
  if (flat === 0) return dice;
  return `${dice} ${flat > 0 ? '+' : '-'} ${Math.abs(flat)}`;
}

/**
 * The transform catalogue. Each entry states what it does and how it changes
 * the sheet; `apply` returns a description of the change for the audit trail.
 */
export const TRANSFORMS = [
  {
    id: 'hardened',
    name: 'Hardened',
    description: 'Thickened hide or scavenged plate. +2 AC and a quarter more hit points.',
    tags: ['defensive'],
    apply(sheet) {
      sheet.armorClass.total += 2;
      sheet.armorClass.source = `${sheet.armorClass.source}, reinforced`;
      const gain = Math.round(sheet.hitPoints.average * 0.25);
      sheet.hitPoints.average += gain;
      sheet.hitPoints.max = sheet.hitPoints.average;
      sheet.hitPoints.current = sheet.hitPoints.average;
      sheet.hitPoints.formula = adjustFormula(sheet.hitPoints.formula, gain);
      sheet.traits.push({
        name: 'Hardened',
        description: 'Layered hide, bone, or salvaged armour has been worked over this creature’s body.',
      });
      return `AC +2, hit points +${gain}`;
    },
  },
  {
    id: 'savage',
    name: 'Savage',
    description: 'One extra damage die on every weapon attack, and +1 to hit.',
    tags: ['offensive'],
    apply(sheet) {
      let changed = 0;
      for (const action of sheet.actions) {
        if (!action.attack || !(action.damage || []).length) continue;
        action.attack.bonus += 1;
        const primary = action.damage[0];
        if (!primary.dice) continue;
        const [count, sides] = primary.dice.split('d').map(Number);
        primary.dice = `${count + 1}d${sides}`;
        primary.average += (sides + 1) / 2;
        primary.display = `${primary.dice}${primary.bonus ? ` + ${primary.bonus}` : ''} ${primary.type}`;
        action.totalAverage = action.damage.reduce((s, d) => s + d.average, 0);
        changed++;
      }
      sheet.traits.push({
        name: 'Savage',
        description: 'This creature fights with unusual ferocity, striking harder than others of its kind.',
      });
      return `+1 to hit and one extra damage die on ${changed} attack(s)`;
    },
  },
  {
    id: 'quick',
    name: 'Quick',
    description: '+10 feet of speed and a Nimble Escape reaction.',
    tags: ['mobility'],
    apply(sheet) {
      for (const mode of sheet.movement) if (mode.value > 0) mode.value += 10;
      sheet.traits.push({
        name: 'Nimble',
        description: 'The creature can take the Disengage action as a bonus action on each of its turns.',
      });
      return 'all non-zero speeds +10 ft., Disengage as a bonus action';
    },
  },
  {
    id: 'warded',
    name: 'Warded',
    description: 'Resistance to nonmagical weapon damage.',
    tags: ['defensive'],
    apply(sheet) {
      const line = 'bludgeoning, piercing, and slashing from nonmagical attacks';
      if (!sheet.resistances.includes(line)) sheet.resistances.push(line);
      sheet.traits.push({
        name: 'Warded',
        description: 'A binding, blessing, or curse turns aside ordinary steel.',
      });
      return 'resistance to nonmagical bludgeoning, piercing, and slashing';
    },
  },
  {
    id: 'venomous',
    name: 'Venomous',
    description: 'The primary attack carries 2d6 poison damage on a failed Constitution save.',
    tags: ['offensive'],
    apply(sheet) {
      const target = sheet.actions.find((a) => a.primary && a.attack) || sheet.actions.find((a) => a.attack);
      if (!target) return 'no attack to envenom';
      const dc = 8 + sheet.proficiencyBonus + Math.max(sheet.abilityModifiers.con, sheet.abilityModifiers.dex);
      target.damage.push({ dice: '2d6', bonus: 0, type: 'poison', average: 7, display: '2d6 poison' });
      target.totalAverage = target.damage.reduce((s, d) => s + d.average, 0);
      target.save = { ability: 'con', dc };
      target.description = `${target.description ? `${target.description} ` : ''}The target must make a DC ${dc} Constitution saving throw, taking 2d6 poison damage on a failure and half on a success.`;
      return `2d6 poison on ${target.name}, DC ${dc} Constitution save`;
    },
  },
  {
    id: 'diminished',
    name: 'Diminished',
    description: 'Starved, wounded, or half-formed. A third fewer hit points and -1 to hit.',
    tags: ['weakening'],
    apply(sheet) {
      const loss = Math.round(sheet.hitPoints.average * 0.33);
      sheet.hitPoints.average = Math.max(1, sheet.hitPoints.average - loss);
      sheet.hitPoints.max = sheet.hitPoints.average;
      sheet.hitPoints.current = sheet.hitPoints.average;
      sheet.hitPoints.formula = adjustFormula(sheet.hitPoints.formula, -loss);
      for (const action of sheet.actions) if (action.attack) action.attack.bonus -= 1;
      sheet.traits.push({
        name: 'Diminished',
        description: 'This creature is wounded, starved, or badly made, and fights below the standard of its kind.',
      });
      return `hit points -${loss}, -1 to hit`;
    },
  },
];

const TRANSFORMS_BY_TAG = (tag) => TRANSFORMS.filter((t) => t.tags.includes(tag));

/**
 * Which transforms move a creature toward the requested CR.
 *
 * The gap is measured against the *evaluated* rating of the base, not its
 * printed one. Those differ -- the model rates a ghost lower than the book does
 * -- and planning against the printed number would push the variant in the
 * wrong direction by exactly that difference.
 */
function chooseTransforms(currentCR, targetCR, stream) {
  const strengthening = TRANSFORMS.filter((t) => !t.tags.includes('weakening'));
  if (targetCR === null || targetCR === undefined) {
    return stream.sample(strengthening, stream.int(1, 2));
  }
  const gap = parseCR(targetCR) - currentCR;
  if (gap > 0.5) {
    const count = Math.min(strengthening.length, Math.max(1, Math.ceil(gap)));
    return stream.sample(strengthening, count);
  }
  if (gap < -0.5) {
    return TRANSFORMS_BY_TAG('weakening').slice(0, 1);
  }
  return stream.sample(strengthening, 1);
}

/**
 * Applies transforms to a normalised sheet and re-rates it. The returned sheet
 * carries the transform log and the full CR diagnostics.
 */
export function buildVariant({ sheet, spec, stream }) {
  const applied = [];
  const baseEvaluation = evaluateCreature(sheet);
  const chosen = chooseTransforms(parseCR(baseEvaluation.evaluatedCR), spec.targetCR, stream);

  for (const transform of chosen) {
    const effect = transform.apply(sheet);
    applied.push({ id: transform.id, name: transform.name, effect, description: transform.description });
  }

  const evaluation = evaluateCreature(sheet, spec.targetCR);
  const evaluated = formatCR(parseCR(evaluation.evaluatedCR));

  sheet.sourceMode = 'variant';
  sheet.challengeRating = evaluated;
  sheet.xp = xpForCR(evaluated);
  sheet.proficiencyBonus = proficiencyBonusForCR(evaluated);
  sheet.crEvaluation = evaluation;
  sheet.baseEvaluation = {
    evaluatedCR: baseEvaluation.evaluatedCR,
    defensiveCR: baseEvaluation.defensiveCR,
    offensiveCR: baseEvaluation.offensiveCR,
  };
  sheet.transforms = applied;
  sheet.identity = {
    ...sheet.identity,
    name: `${applied.map((t) => t.name).join(' ')} ${sheet.baseCreature.name}`.trim(),
    generatedContent: true,
  };
  sheet.contentNotice = 'Generated game content. Derived from an SRD creature by documented transforms; not an official D&D creature.';

  return { sheet, evaluation };
}
