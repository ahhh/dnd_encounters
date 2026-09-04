// Character generator.
//
// The pipeline the build plan specifies, in order:
//
//   spec -> legal pools -> build plan -> abilities -> class features ->
//   skills -> equipment -> spells -> derived statistics -> validation
//
// Each stage only ever chooses among options the previous stage left legal, and
// nothing downstream writes a number that is not computed from those choices.
// If the finished sheet fails independent validation, the generator retries
// from a *derived* seed -- still fully deterministic -- and returns a structured
// failure rather than a sheet it knows to be wrong.

import { createSeedContext } from '../../core/rng.js';
import { contentRef, sheetId } from '../../core/ids.js';
import { GENERATOR_VERSION } from '../../core/version.js';
import { failure } from '../../core/validation.js';
import { proficiencyBonusForLevel } from '../../rules/srd51/proficiency.js';
import { normalizeCharacterSpec } from './spec.js';
import { planBuild, scoreBackground, scoreClass, scoreSpecies } from './build-planner.js';
import { applyASIs, buildAbilities } from './ability-builder.js';
import {
  attacksPerAction, buildHitDice, buildHitPoints, featuresForLevel,
  resolveResources, scalingValue, spellProgression,
} from './class-builder.js';
import { buildProficiencies } from './skill-builder.js';
import { buildAttacks, buildEquipment } from './equipment-builder.js';
import { buildSpellcasting } from './spell-builder.js';
import {
  buildDefenses, buildInitiative, buildMovement, buildSavingThrows,
  buildSenses, buildSkills,
} from './derived.js';
import { buildIdentity, buildPersonality } from '../narrative/personality.js';
import { validateCharacter } from './validator.js';

const MAX_ATTEMPTS = 4;

/**
 * Public entry point. Returns `{ok: true, sheet, validation, inspector}` or
 * `{ok: false, failure}`; never a sheet with validation errors.
 */
export function generateCharacter(rawSpec, registry, options = {}) {
  const spec = normalizeCharacterSpec(rawSpec);
  const rerolls = options.rerolls || {};

  let lastValidation = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Retries derive a new seed rather than reaching for fresh randomness, so
    // "attempt 2 of this seed" is itself reproducible.
    const seed = attempt === 0 ? spec.seed : `${spec.seed}#retry${attempt}`;
    const built = buildOnce({
      spec, seed, rerolls, registry, attempt,
      index: options.index, anonymousLabel: options.label,
    });
    if (!built.ok) return built;

    const validation = validateCharacter(built.sheet, registry);
    if (validation.valid) {
      built.sheet.validation = validation;
      return {
        ok: true,
        sheet: built.sheet,
        validation,
        inspector: built.inspector,
      };
    }
    lastValidation = validation;
  }

  return failure(
    'character-validation-failed', 'validate', spec.seed,
    `no valid character produced after ${MAX_ATTEMPTS} deterministic attempts`,
    lastValidation ? lastValidation.errors : [],
  );
}

function buildOnce({ spec, seed, rerolls, registry, attempt, index, anonymousLabel }) {
  const ctx = createSeedContext(seed, rerolls);
  const streams = (ns) => ctx.stream(ns);
  const inspector = { seed: ctx.seed, attempt, candidates: {} };

  // --- 1. legal pools and the build plan ---------------------------------------
  const plan = planBuild(spec, streams, registry);
  inspector.plan = plan;

  const speciesPool = spec.species === 'random'
    ? registry.all('species')
    : registry.all('species').filter((s) => s.id === spec.species || s.slug === spec.species);
  if (!speciesPool.length) {
    return failure('unknown-species', 'select', seed, `no species matches "${spec.species}"`);
  }
  const classPool = spec.class === 'random'
    ? registry.all('class')
    : registry.all('class').filter((c) => c.id === spec.class || c.slug === spec.class);
  if (!classPool.length) {
    return failure('unknown-class', 'select', seed, `no class matches "${spec.class}"`);
  }
  const backgroundPool = spec.background === 'random'
    ? registry.all('background')
    : registry.all('background').filter((b) => b.id === spec.background || b.slug === spec.background);
  if (!backgroundPool.length) {
    return failure('unknown-background', 'select', seed, `no background matches "${spec.background}"`);
  }

  // --- 2. class, species, background --------------------------------------------
  // Class first: it constrains more than anything else, and the species score
  // depends on which abilities the class actually cares about.
  const classScores = classPool.map((c) => ({ id: c.id, name: c.name, score: scoreClass(c, plan, spec) }));
  inspector.candidates.class = classScores;
  const legalClasses = classPool.filter((c) => scoreClass(c, plan, spec) > 0);
  if (!legalClasses.length) {
    return failure('no-legal-class', 'select', seed,
      'no class in the enabled content satisfies the spellcasting constraint at this level');
  }
  // Two stages, and the distinction matters. `legalClasses` is what the rules
  // allow; `viableClasses` is what the *role* allows. A barbarian is a legal
  // choice for an "arcane caster" request and a useless one, so candidates
  // scoring far below the best are dropped before the weighted draw rather than
  // left as a rare embarrassment. Within what survives, variety is the point.
  const viableClasses = shortlist(legalClasses, (c) => scoreClass(c, plan, spec), 0.4);
  const cls = streams('npc:class').weighted(viableClasses, (c) => scoreClass(c, plan, spec) ** 1.6);

  const speciesScores = speciesPool.map((s) => ({ id: s.id, name: s.name, score: scoreSpecies(s, plan) }));
  inspector.candidates.species = speciesScores;
  const species = streams('npc:species').weighted(speciesPool, (s) => scoreSpecies(s, plan));

  const backgroundScores = backgroundPool.map((b) => ({ id: b.id, name: b.name, score: scoreBackground(b, plan) }));
  inspector.candidates.background = backgroundScores;
  const background = streams('npc:background')
    .weighted(shortlist(backgroundPool, (b) => scoreBackground(b, plan), 0.25),
      (b) => scoreBackground(b, plan) ** 2);

  const subclass = spec.level >= cls.subclassLevel ? cls.subclasses[0] : null;

  // --- 3. abilities --------------------------------------------------------------
  const abilityStream = streams('npc:abilities');
  const abilities = buildAbilities({
    method: spec.constraints.abilityMethod, stream: abilityStream, plan, cls, species,
  });
  inspector.abilities = abilities;

  // --- 4. class features (before ASIs, which are themselves features) -------------
  const features = featuresForLevel(cls, spec.level, subclass?.slug);
  const grappler = registry.get('srd51:feat.grappler');
  const asi = applyASIs({
    abilities, asiLevels: cls.asiLevels, level: spec.level, plan,
    stream: abilityStream, grapplerFeat: grappler,
  });
  const scores = asi.scores;
  const mods = asi.modifiers;
  const proficiencyBonus = proficiencyBonusForLevel(spec.level);

  // Level-20 barbarians raise their caps; apply structured ability increases.
  for (const feature of features) {
    for (const mod of (feature.modifiers || []).filter((m) => m.type === 'ability-increase')) {
      scores[mod.ability] = Math.min(mod.max, scores[mod.ability] + mod.value);
      mods[mod.ability] = Math.floor((scores[mod.ability] - 10) / 2);
    }
  }

  // --- 5. proficiencies -----------------------------------------------------------
  const proficiencies = buildProficiencies({
    registry, cls, species, background, features, plan,
    stream: streams('npc:skills'), abilities,
  });

  // --- 6. equipment ---------------------------------------------------------------
  const equipment = buildEquipment({
    registry, plan, cls, background, proficiencies, features, mods, scores,
    stream: streams('npc:equipment'),
  });

  const { attacks } = buildAttacks({
    equipment, mods, proficiencyBonus, proficiencies, features, level: spec.level, cls,
  });

  // --- 7. spells ------------------------------------------------------------------
  const progression = spellProgression(cls, spec.level, mods[cls.spellcasting?.ability] ?? 0);
  const spellcasting = buildSpellcasting({
    registry, cls, progression, features, mods, proficiencyBonus, level: spec.level,
    plan, stream: streams('npc:spells'), species,
  });

  // --- 8. derived statistics --------------------------------------------------------
  const hitPoints = buildHitPoints({
    cls, level: spec.level, conMod: mods.con, features,
    policy: spec.constraints.hpPolicy, stream: abilityStream,
  });
  const skills = buildSkills({ registry, mods, proficiencies, proficiencyBonus, features });
  const savingThrows = buildSavingThrows({ mods, saveProficiencies: proficiencies.saveProficiencies, proficiencyBonus });
  const movement = buildMovement({ species, features, level: spec.level, equipment });
  const senses = buildSenses({ species, features, skills });
  const defenses = buildDefenses({ species, features });
  const init = buildInitiative(mods);

  // --- 9. narrative -----------------------------------------------------------------
  const identity = buildIdentity({
    registry, species, stream: streams('npc:identity'), named: spec.named, index, anonymousLabel,
  });
  const personality = buildPersonality({ registry, stream: streams('npc:personality'), role: plan.role });

  // --- 10. assemble -------------------------------------------------------------------
  const usedIds = [
    species.id, cls.id, background.id,
    ...proficiencies.all.map((p) => p.id),
    ...equipment.inventory.map((i) => i.id),
  ];

  const sheet = {
    id: sheetId('npc', ctx.seed, `${cls.slug}-${spec.level}`),
    kind: 'character',
    seed: ctx.seed,
    identity,
    role: plan.role,
    theme: spec.theme || null,
    level: spec.level,
    species: contentRef(species),
    classLevels: [{ ...contentRef(cls), level: spec.level, subclass: subclass ? { slug: subclass.slug, name: subclass.name } : null }],
    background: contentRef(background),

    abilityScores: scores,
    abilityModifiers: mods,
    abilityGeneration: {
      method: abilities.method, note: abilities.note,
      baseArray: abilities.baseArray, assignment: abilities.assignment,
      adjustments: abilities.adjustments, breakdown: abilities.breakdown,
    },
    proficiencyBonus,

    savingThrows,
    skills,

    armorClass: {
      total: equipment.armorClass.total,
      armor: equipment.armor ? contentRef(equipment.armor) : null,
      shield: equipment.shield ? contentRef(equipment.shield) : null,
      calculation: equipment.armorClass,
    },
    initiative: init.total,
    initiativeCalculation: init,
    movement,
    hitPoints,
    hitDice: buildHitDice(cls, spec.level),

    senses,
    // `source` stays the ContentSource the licence needs; where the language
    // came from on this sheet is a separate field.
    languages: proficiencies.languages.map((l) => ({ ...contentRef(registry.get(l.id)), grantedBy: l.source })),
    proficiencies: [
      ...proficiencies.skills,
      ...proficiencies.weapons,
      ...proficiencies.armor,
      ...proficiencies.tools,
      ...proficiencies.languages,
    ],
    expertise: proficiencies.expertise,

    attacks,
    attacksPerAction: attacksPerAction(features),
    equipment: equipment.inventory,
    currency: equipment.currency,

    features,
    feats: asi.feats.map((f) => ({ ...contentRef(f), description: f.description })),
    resources: resolveResources(features, spec.level, mods),
    buildChoices: [...proficiencies.choices, ...asi.choices],

    defenses,
    ...(spellcasting ? { spellcasting } : {}),

    personality,

    generation: {
      generatorVersion: GENERATOR_VERSION,
      ruleset: { id: 'srd51', version: '5.1.0' },
      contentPacks: registry.packs.map((p) => ({ id: p.id, version: p.version })),
      seed: ctx.seed,
      requestedSeed: spec.seed,
      rerolls: { ...rerolls },
      attempt,
      spec,
      attribution: registry.attribution(usedIds),
    },
  };

  if (equipment.warnings.length) sheet.generation.equipmentWarnings = equipment.warnings;

  inspector.derived = {
    scalingDice: {
      martialArts: scalingValue(features, 'martial-arts-die', spec.level),
      rageDamage: scalingValue(features, 'rage-damage', spec.level),
    },
    streams: ctx.usage(),
  };

  return { ok: true, sheet, inspector };
}

/**
 * Keeps the candidates scoring within `floor` of the best. Always returns at
 * least one entry, so a shortlist can narrow a pool but never empty it.
 */
function shortlist(pool, scoreOf, floor) {
  const scored = pool.map((item) => ({ item, score: scoreOf(item) }));
  const best = Math.max(...scored.map((s) => s.score));
  const kept = scored.filter((s) => s.score >= best * floor).map((s) => s.item);
  return kept.length ? kept : pool;
}
