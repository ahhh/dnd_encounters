// Encounter generator.
//
// Composes a group, then fills each slot using the ordinary creature generator.
// It has no privileged access to anything below it: every enemy on the roster
// is a normal CreatureSheet produced by `generateCreature` from a derived seed,
// carrying its own independent validation. If a stat block is wrong here, it is
// wrong on the Enemy Creature tab too.
//
// The order is the point:
//
//   budget -> composition -> per-slot creature requests -> realised difficulty
//
// Difficulty is measured at the end, from the ratings that actually came back,
// never from the ones that were asked for. Those differ often: "existing" mode
// returns a real creature at its printed CR, and if the enabled content has no
// CR 6 fiend the honest answer is a CR 5 one plus a note saying so -- not a CR 5
// creature relabelled to keep the arithmetic tidy.

import { createSeedContext } from '../core/rng.js';
import { sheetId } from '../core/ids.js';
import { GENERATOR_VERSION } from '../core/version.js';
import { failure } from '../core/validation.js';
import { formatCR, parseCR, xpForCR } from '../rules/srd51/proficiency.js';
import {
  partyBudget, encounterXP, difficultyOf, relevantLadder, isRelevant, isSpike,
} from '../rules/srd51/encounter.js';
import { generateCreature } from '../sheets/creature/generator.js';
import { normalizeEncounterSpec, shapeStep, styleStep } from './spec.js';
import { composeEncounter, expandSlots, describe } from './composer.js';
import { castTier } from './casting.js';
import { validateEncounter } from './validator.js';

export function generateEncounter(rawSpec, registry, options = {}) {
  const spec = normalizeEncounterSpec(rawSpec);
  const ctx = createSeedContext(spec.seed, options.rerolls || {});
  const notes = [];
  const warnings = [];

  const budget = partyBudget(spec);

  // The ratings the enabled content can actually supply for this request. The
  // composer is never allowed to propose a slot nothing could fill.
  const pool = filterPool(registry, spec);
  if (!pool.length) {
    return failure('no-matching-creature', 'select', ctx.seed,
      describeUnmatched(spec), []);
  }
  const ladder = availableLadder(pool, spec);
  if (!ladder.length) {
    return failure('no-viable-composition', 'compose', ctx.seed,
      `every creature matching this request is below the relevance floor for a level ${spec.partyLevel} party; `
      + 'widen the filters or lower the party level.', []);
  }

  const composition = composeEncounter({
    spec, budget, ladder, stream: ctx.stream('group:composition'),
  });
  if (!composition) {
    return failure('no-viable-composition', 'compose', ctx.seed,
      `no composition of the enabled content lands near a ${spec.difficulty} budget of ${budget} XP `
      + `for ${spec.partySize} characters at level ${spec.partyLevel}.`, []);
  }

  const style = styleStep(spec.style);
  const slots = expandSlots(composition, style);

  // --- fill the slots -----------------------------------------------------------
  //
  // Cast first, generate second. Which creatures are in the group is decided
  // here, at the rating the budget actually paid for; the creature generator is
  // then asked for that specific creature's sheet rather than for "something
  // around CR 2", which is what keeps the group's arithmetic from drifting.

  const members = [];
  const failures = [];
  const castStream = ctx.stream('group:casting');
  let cohesionFamily = null;

  for (const group of groupSlots(slots)) {
    const want = {
      cr: group.cr,
      style: group.style,
      tier: group.tier,
      family: spec.family || (spec.cohesion ? cohesionFamily : null),
      environment: spec.environment,
      theme: spec.theme,
    };
    const cast = castTier({ pool, slots: group.slots, want, stream: castStream });
    if (!cast) {
      for (const slot of group.slots) {
        failures.push({ slot: slot.ordinal, cr: slot.cr, reason: `nothing in the enabled content sits at CR ${slot.cr}` });
      }
      continue;
    }
    if (cast.relaxed.length) {
      notes.push(`CR ${group.cr} ${group.tier === 'leader' ? 'leader' : 'line'}: `
        + `relaxed ${andList(cast.relaxed)} to find a match at that rating. `
        + 'Nothing in the enabled content at that rating satisfied the request as asked.');
    }

    group.slots.forEach((slot, i) => {
      const monster = cast.assignments[i];
      const result = buildMember({ slot, monster, spec, registry, ctx });
      if (!result.ok) {
        failures.push({ slot: slot.ordinal, cr: slot.cr, reason: result.failure.message });
        return;
      }
      if (spec.cohesion && cohesionFamily === null) {
        cohesionFamily = (result.sheet.families || [])[0] || null;
      }
      members.push({
        ordinal: slot.ordinal,
        requestedCR: slot.cr,
        requestedStyle: slot.style,
        tier: slot.tier,
        result,
        sheet: result.sheet,
      });
    });
  }

  if (!members.length) {
    return failure('encounter-unfillable', 'generate', ctx.seed,
      `no slot in the composition ${describe(composition)} could be filled from the enabled content`,
      []);
  }
  if (failures.length) {
    warnings.push(`${failures.length} of ${slots.length} slots could not be filled: ${failures[0].reason}`);
  }

  members.sort((a, b) => a.ordinal - b.ordinal);

  numberDuplicates(members);

  // --- price what actually came back --------------------------------------------

  const realisedCRs = members.map((m) => m.sheet.challengeRating);
  const realised = encounterXP(realisedCRs, spec.partySize);
  const difficulty = difficultyOf(realised.adjusted, spec);

  for (const member of members) {
    const got = parseCR(member.sheet.challengeRating);
    if (got !== parseCR(member.requestedCR)) {
      notes.push(`slot ${member.ordinal}: asked for CR ${member.requestedCR}, the closest real creature is `
        + `${member.sheet.identity.name} at CR ${member.sheet.challengeRating}. Mechanics were not altered to force the rating.`);
    }
    if (isSpike(got, spec.partyLevel)) {
      warnings.push(`${member.sheet.identity.name} is CR ${member.sheet.challengeRating} against level ${spec.partyLevel} characters: `
        + 'a single creature this far above the party decides the fight in two or three rounds either way.');
    }
    if (!isRelevant(got, spec.partyLevel)) {
      warnings.push(`${member.sheet.identity.name} (CR ${member.sheet.challengeRating}) is below the relevance floor for level `
        + `${spec.partyLevel}: it will contribute far less than its XP suggests.`);
    }
  }

  const drift = budget > 0 ? (realised.adjusted - budget) / budget : 0;
  if (Math.abs(drift) > 0.25) {
    warnings.push(`the group as built adjusts to ${realised.adjusted} XP against a ${spec.difficulty} budget of ${budget} `
      + `(${drift > 0 ? '+' : ''}${Math.round(drift * 100)}%); it plays as ${difficulty.label}.`);
  }
  // A label mismatch says something the percentage does not: the enabled
  // content could not reach the difficulty that was asked for, usually because
  // the bestiary runs out of ratings before the party does.
  if (difficulty.label !== spec.difficulty) {
    warnings.push(`asked for a ${spec.difficulty} encounter; the closest this content can build plays as `
      + `${difficulty.label} (${difficulty.ratio}x a standard encounter for ${spec.partySize} characters at level ${spec.partyLevel}).`);
  }

  // --- assemble -------------------------------------------------------------------

  const encounter = {
    id: sheetId('group', ctx.seed, `${spec.partyLevel}x${spec.partySize}`),
    kind: 'encounter',
    seed: ctx.seed,

    party: { level: spec.partyLevel, size: spec.partySize },
    requested: {
      difficulty: spec.difficulty,
      budget,
      shape: shapeStep(spec.shape).label,
      style: style.label,
    },

    composition: {
      summary: describe(composition),
      tiers: composition.tiers,
      requestedXP: composition.adjustedXP,
    },

    xp: {
      raw: realised.raw,
      multiplier: realised.multiplier,
      adjusted: realised.adjusted,
      budget,
      perCharacter: Math.round(realised.raw / Math.max(1, spec.partySize)),
      drift: Math.round(drift * 100),
    },
    difficulty,

    members: members.map((m) => ({
      ordinal: m.ordinal,
      name: m.sheet.identity.name,
      tier: m.tier,
      requestedCR: m.requestedCR,
      challengeRating: m.sheet.challengeRating,
      xp: m.sheet.xp ?? xpForCR(m.sheet.challengeRating),
      size: m.sheet.size,
      creatureType: m.sheet.creatureType,
      armorClass: m.sheet.armorClass.total,
      hitPoints: m.sheet.hitPoints.max,
      style: m.requestedStyle,
      spellcaster: !!m.sheet.spellcasting,
      sheetId: m.sheet.id,
      seed: m.sheet.seed,
    })),

    notes,
    warnings,
    unfilled: failures,
  };

  encounter.generation = {
    generatorVersion: GENERATOR_VERSION,
    ruleset: { id: 'srd51', version: '5.1.0' },
    contentPacks: registry.packs.map((p) => ({ id: p.id, version: p.version })),
    seed: ctx.seed,
    requestedSeed: spec.seed,
    spec,
    model: 'project-defined encounter budget model; see src/rules/srd51/encounter.js',
  };

  const roster = members.map((m) => ({
    label: 'enemy', ordinal: m.ordinal, index: m.ordinal - 1, ...m.result,
  }));

  const validation = validateEncounter(encounter, roster);
  if (!validation.valid) {
    return failure('encounter-validation-failed', 'validate', ctx.seed,
      'the assembled group failed independent validation', validation.errors);
  }
  encounter.validation = validation;

  return {
    ok: true,
    encounter,
    validation,
    sheets: roster,
    inspector: {
      seed: ctx.seed,
      budget,
      poolSize: pool.length,
      ladder: ladder.map((cr) => formatCR(cr)),
      preferredCount: slots.length,
      considered: composition.considered,
      shortlist: composition.shortlist,
      slots: slots.map((s) => ({ ordinal: s.ordinal, cr: s.cr, tier: s.tier, style: s.style })),
    },
  };
}

// --- slot filling -------------------------------------------------------------------

/** Slots that want the same thing, so a tier can be cast as a unit. */
function groupSlots(slots) {
  const groups = new Map();
  for (const slot of slots) {
    const key = `${slot.tier}|${slot.cr}|${slot.style}`;
    if (!groups.has(key)) {
      groups.set(key, { cr: slot.cr, tier: slot.tier, style: slot.style, slots: [] });
    }
    groups.get(key).slots.push(slot);
  }
  return [...groups.values()];
}

/**
 * Builds one member's sheet from the cast creature. Each slot gets its own
 * child seed, so re-requesting a single enemy alone reproduces it exactly and
 * two goblins in the same group are not the same goblin twice.
 *
 * `baseCreature` is pinned for the two modes that start from a real stat block.
 * "Generated" mode builds original mechanics against the CR model instead, so
 * it takes the rating and the flavour and nothing else.
 */
function buildMember({ slot, monster, spec, registry, ctx }) {
  const child = ctx.child(`enemy:${slot.index}`);
  const creatureSpec = {
    seed: child.seed,
    mode: spec.mode,
    targetCR: parseCR(slot.cr),
    creatureType: spec.creatureType,
    environment: spec.environment,
    theme: spec.theme,
    withPersonality: spec.withPersonality,
    role: slot.tier === 'leader' ? 'leader' : null,
    ...(spec.mode === 'generated' ? {} : { baseCreature: monster.slug }),
  };
  return generateCreature(creatureSpec, registry, {});
}

// --- pool and ladder -------------------------------------------------------------

/** Creatures the enabled content can offer for this request, before ratings. */
function filterPool(registry, spec) {
  const filter = {
    ...(spec.creatureType ? { creatureType: spec.creatureType } : {}),
    ...(spec.family ? { family: spec.family } : {}),
    ...(spec.environment ? { environment: spec.environment } : {}),
  };
  let pool = registry.findMonsters(filter);
  if (!pool.length && spec.environment) pool = registry.findMonsters({ ...filter, environment: undefined });
  if (!pool.length && spec.family) pool = registry.findMonsters({ ...filter, family: undefined, environment: undefined });
  if (!pool.length) pool = registry.all('monster');
  return pool;
}

/**
 * The ratings actually present in the pool, intersected with the ratings worth
 * fielding at this party level.
 *
 * "generated" mode is not held to the pool's ratings: it builds original
 * mechanics against the CR model rather than searching for a stat block, so it
 * can fill a rung the bestiary happens to skip.
 */
function availableLadder(pool, spec) {
  const relevant = relevantLadder(spec.partyLevel);
  if (spec.mode === 'generated') {
    const ceiling = Math.max(...pool.map((m) => parseCR(m.cr)), 1);
    return relevant.filter((cr) => cr <= Math.max(ceiling, spec.partyLevel + 6));
  }
  const present = new Set(pool.map((m) => parseCR(m.cr)));
  return relevant.filter((cr) => present.has(cr));
}

function describeUnmatched(spec) {
  const parts = [];
  if (spec.creatureType) parts.push(`type ${spec.creatureType}`);
  if (spec.family) parts.push(`family ${spec.family}`);
  if (spec.environment) parts.push(`environment ${spec.environment}`);
  return `no creature in the enabled content matches ${parts.join(', ') || 'the request'}`;
}

// --- naming ------------------------------------------------------------------------

/**
 * Numbers every member of a repeated group, not just the second onward: a DM
 * tracking four goblins wants "Goblin 1" through "Goblin 4", and a lone goblin
 * beside three skeletons wants to stay "Goblin".
 */
function numberDuplicates(members) {
  const counts = new Map();
  for (const m of members) {
    const name = m.sheet.identity.name;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const used = new Map();
  for (const m of members) {
    const name = m.sheet.identity.name;
    if (counts.get(name) < 2) continue;
    const n = (used.get(name) || 0) + 1;
    used.set(name, n);
    m.sheet.identity.name = `${name} ${n}`;
    m.sheet.identity.groupOrdinal = n;
  }
}

/** "a", "a and b", "a, b and c" -- for notes a human reads. */
function andList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export { describe };
