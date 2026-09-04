// Creature generator.
//
// Routes a spec to one of the three modes and returns a validated
// CreatureSheet. "Existing" simply finds the best real creature for the request
// and normalises it; the other two build on top of that and are re-rated by the
// CR model before anything is returned.

import { createSeedContext } from '../../core/rng.js';
import { GENERATOR_VERSION } from '../../core/version.js';
import { failure } from '../../core/validation.js';
import { formatCR, parseCR } from '../../rules/srd51/proficiency.js';
import { normalizeCreatureSpec } from './spec.js';
import { normalizeCreature, scoreCreature } from './normalizer.js';
import { buildVariant } from './variant-builder.js';
import { buildGeneratedCreature } from './generated-builder.js';
import { evaluateCreature } from './cr-evaluator.js';
import { validateCreature } from './validator.js';
import { buildPersonality } from '../narrative/personality.js';

export function generateCreature(rawSpec, registry, options = {}) {
  const spec = normalizeCreatureSpec(rawSpec);
  const rerolls = options.rerolls || {};
  const ctx = createSeedContext(spec.seed, rerolls);
  const streams = (ns) => ctx.stream(ns);
  const inspector = { seed: ctx.seed, mode: spec.mode, targetCR: spec.targetCR, candidates: {} };
  const notes = [];

  let sheet;
  let evaluation = null;

  if (spec.mode === 'generated') {
    const built = buildGeneratedCreature({
      spec, stream: streams('enemy:base'), registry, seed: ctx.seed,
    });
    if (!built.ok) {
      return failure('cr-policy-unmet', 'generate', ctx.seed, built.reason, []);
    }
    sheet = built.sheet;
    evaluation = built.evaluation;
    inspector.crPasses = built.sheet.crPasses;
  } else {
    // Both remaining modes start from a real creature.
    const pool = selectPool(registry, spec);
    if (!pool.length) {
      return failure('no-matching-creature', 'select', ctx.seed,
        describeUnmatched(spec), []);
    }
    inspector.candidates.base = pool
      .map((m) => ({ id: m.id, name: m.name, cr: m.cr, score: scoreCreature(m, spec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const baseStream = streams('enemy:base');
    const pickBase = () => baseStream.weighted(pool, (m) => scoreCreature(m, spec) ** 1.5);

    const personalityStream = streams('enemy:personality');
    const makePersonality = (role) => (spec.withPersonality
      ? buildPersonality({ registry, stream: personalityStream, role })
      : null);

    if (spec.mode === 'existing') {
      const monster = pickBase();
      inspector.selected = { id: monster.id, name: monster.name, cr: monster.cr };
      if (spec.targetCR !== null && parseCR(monster.cr) !== parseCR(spec.targetCR)) {
        notes.push(
          `requested CR ${formatCR(parseCR(spec.targetCR))}; the closest match in the enabled content is `
          + `${monster.name} at CR ${monster.cr}. Source mechanics were not altered to force the requested rating.`);
      }
      sheet = normalizeCreature({
        monster, registry, seed: ctx.seed, spec, notes,
        personality: makePersonality(monster.tacticalRole),
      });
    } else {
      // Variants are attempted several times. A transform set can only move a
      // creature so far, so if the first base lands outside the CR policy the
      // generator tries another rather than shipping a mislabelled stat block.
      // Every attempt draws from the same streams, so the whole loop is still
      // reproducible from the seed.
      const featureStream = streams('enemy:features');
      const attempts = [];
      let best = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        const monster = pickBase();
        const candidate = normalizeCreature({
          monster, registry, seed: ctx.seed, spec, notes: [],
          personality: makePersonality(monster.tacticalRole),
        });
        const result = buildVariant({ sheet: candidate, spec, stream: featureStream });
        attempts.push({
          attempt, base: monster.name, baseCR: monster.cr,
          evaluatedCR: result.evaluation.evaluatedCR,
          withinPolicy: result.evaluation.withinPolicy !== false,
        });
        if (spec.targetCR === null || result.evaluation.withinPolicy) { best = result; break; }
        best = best || result;
      }
      inspector.variantAttempts = attempts;
      inspector.selected = { id: best.sheet.baseCreature.id, name: best.sheet.baseCreature.name };
      if (spec.targetCR !== null && !best.evaluation.withinPolicy) {
        return failure('cr-policy-unmet', 'variant', ctx.seed,
          `no variant of an enabled creature evaluated within one step of CR ${formatCR(parseCR(spec.targetCR))} `
          + `after ${attempts.length} attempts`, []);
      }
      sheet = best.sheet;
      evaluation = best.evaluation;
      sheet.generation = { notes };
    }
  }

  // Existing creatures keep their printed CR; the evaluation is attached to the
  // inspector only, so it can never be mistaken for the authority.
  if (spec.mode === 'existing') {
    inspector.crEvaluation = evaluateCreature(sheet);
  }

  if (spec.role && spec.mode === 'existing' && sheet.tacticalRole !== spec.role) {
    notes.push(`tactical role recorded as "${sheet.tacticalRole}"; roles are metadata and never alter a source creature's mechanics.`);
  }

  sheet.generation = {
    generatorVersion: GENERATOR_VERSION,
    ruleset: { id: 'srd51', version: '5.1.0' },
    contentPacks: registry.packs.map((p) => ({ id: p.id, version: p.version })),
    seed: ctx.seed,
    requestedSeed: spec.seed,
    rerolls: { ...rerolls },
    spec,
    notes,
    attribution: registry.attribution([
      sheet.baseCreature?.id,
      ...(sheet.skills || []).map((s) => s.id),
      ...(sheet.languages || []).map((l) => l.id),
    ].filter(Boolean)),
  };

  const validation = validateCreature(sheet, registry);
  if (!validation.valid) {
    return failure('creature-validation-failed', 'validate', ctx.seed,
      `generated creature failed independent validation`, validation.errors);
  }
  sheet.validation = validation;

  return { ok: true, sheet, validation, evaluation, inspector };
}

/** The legal pool for the request, relaxed step by step if nothing matches. */
function selectPool(registry, spec) {
  if (spec.baseCreature !== 'random') {
    const direct = registry.all('monster')
      .filter((m) => m.id === spec.baseCreature || m.slug === spec.baseCreature);
    if (direct.length) return direct;
  }
  const filter = {
    ...(spec.creatureType ? { creatureType: spec.creatureType } : {}),
    ...(spec.family ? { family: spec.family } : {}),
    ...(spec.environment ? { environment: spec.environment } : {}),
    ...(spec.constraints.spellcaster !== null ? { spellcaster: spec.constraints.spellcaster } : {}),
    ...(spec.constraints.flying !== null ? { flying: spec.constraints.flying } : {}),
    ...(spec.constraints.ranged !== null ? { ranged: spec.constraints.ranged } : {}),
  };
  let pool = registry.findMonsters(filter);
  // Environment is the softest constraint: a crypt undead that happens to be
  // tagged for dungeons is still the right answer.
  if (!pool.length && spec.environment) {
    pool = registry.findMonsters({ ...filter, environment: undefined });
  }
  if (!pool.length && spec.family) {
    pool = registry.findMonsters({ ...filter, family: undefined, environment: undefined });
  }
  return pool;
}

function describeUnmatched(spec) {
  const parts = [];
  if (spec.creatureType) parts.push(`type ${spec.creatureType}`);
  if (spec.family) parts.push(`family ${spec.family}`);
  if (spec.environment) parts.push(`environment ${spec.environment}`);
  if (spec.constraints.spellcaster !== null) parts.push(`spellcaster ${spec.constraints.spellcaster}`);
  if (spec.constraints.flying !== null) parts.push(`flying ${spec.constraints.flying}`);
  if (spec.constraints.ranged !== null) parts.push(`ranged ${spec.constraints.ranged}`);
  return `no creature in the enabled content matches ${parts.join(', ') || 'the request'}`;
}
