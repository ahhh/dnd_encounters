// CR evaluation for a finished creature sheet.
//
// Thin by design: pulling the numbers out of a sheet is one job, and modelling
// what a challenge rating means is another (rules/srd51/challenge.js). Keeping
// them apart is what lets `tools/verify.mjs cr` run the model over every SRD
// creature in the pack and report the drift -- the only real evidence that the
// model is worth trusting on a creature that was never printed anywhere.

import { crWithinPolicy, evaluateCR, formatCR } from '../../rules/srd51/challenge.js';
import { parseCR } from '../../rules/srd51/proficiency.js';

/** Every damaging action a creature can take in a round, in evaluator shape. */
function offensiveActions(sheet) {
  const all = [...(sheet.actions || []), ...(sheet.bonusActions || [])];
  const multiattack = all.find((a) => a.multiattackCount);

  return all
    .filter((a) => (a.damage || []).length)
    .map((a) => ({
      name: a.name,
      damage: a.damage,
      // Multiattack multiplies the creature's best routine attack, not its
      // limited-use breath weapon -- those are counted separately at their
      // availability instead.
      multiattackCount: multiattack && a.primary && !a.recharge && !a.uses
        ? multiattack.multiattackCount : 1,
      primary: !!a.primary,
      recharge: a.recharge ? a.recharge.formula : null,
      uses: a.uses || null,
    }));
}

/** The attack bonus and save DC the evaluator should compare against. */
function offensiveReference(sheet) {
  const all = [...(sheet.actions || []), ...(sheet.bonusActions || [])];
  const attacks = all.filter((a) => a.attack).map((a) => a.attack.bonus);
  const saves = all.filter((a) => a.save).map((a) => a.save.dc);
  return {
    attackBonus: attacks.length ? Math.max(...attacks) : null,
    saveDC: saves.length ? Math.max(...saves) : null,
  };
}

/** Runs the model over a sheet and returns a CREvaluation. */
export function evaluateCreature(sheet, targetCR = null) {
  const { attackBonus, saveDC } = offensiveReference(sheet);
  const evaluation = evaluateCR({
    hp: sheet.hitPoints.average ?? sheet.hitPoints.max,
    ac: sheet.armorClass.total,
    resistances: sheet.resistances || [],
    immunities: sheet.immunities || [],
    conditionImmunities: sheet.conditionImmunities || [],
    actions: offensiveActions(sheet),
    spellcasting: sheet.spellcasting || null,
    attackBonus,
    saveDC,
    traits: sheet.traits || [],
  });

  if (targetCR !== null && targetCR !== undefined) {
    evaluation.targetCR = formatCR(parseCR(targetCR));
    evaluation.withinPolicy = crWithinPolicy(targetCR, evaluation.evaluatedCR);
    if (!evaluation.withinPolicy) {
      evaluation.warnings.push(
        `evaluated CR ${evaluation.evaluatedCR} is more than one step from the requested CR ${evaluation.targetCR}`);
    }
  }
  return evaluation;
}

/**
 * How far a printed CR sits from what the model computes. Used by the
 * verification harness rather than by generation -- a source creature's CR is
 * never overwritten by this.
 */
export function crDrift(sheet) {
  const evaluation = evaluateCreature(sheet);
  return {
    name: sheet.identity.name,
    printedCR: sheet.challengeRating,
    evaluatedCR: evaluation.evaluatedCR,
    delta: parseCR(evaluation.evaluatedCR) - parseCR(sheet.challengeRating),
    defensiveCR: evaluation.defensiveCR,
    offensiveCR: evaluation.offensiveCR,
  };
}

export { crWithinPolicy, evaluateCR };
