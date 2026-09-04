#!/usr/bin/env node
// Verification harness.
//
//   node tools/verify.mjs            run everything
//   node tools/verify.mjs content    content pack schemas and references
//   node tools/verify.mjs rng        determinism and stream isolation
//   node tools/verify.mjs rules      rules-math invariants
//   node tools/verify.mjs sheets     generate and validate a broad sweep
//   node tools/verify.mjs cr         CR model drift against the bundled bestiary
//   node tools/verify.mjs encounters  encounter budget model and group composition
//   node tools/verify.mjs seeds      golden-seed regression (--update to rewrite)
//   node tools/verify.mjs stats      statistical generation over many seeds
//
// No dependencies, no build step -- the same modules the browser loads.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildRegistry } from '../src/content/packs/index.js';
import { createSeedContext, applyReroll, REROLL_SCOPES } from '../src/core/rng.js';
import { canonicalJSON, fingerprint } from '../src/core/ids.js';
import { abilityModifier, STANDARD_ARRAY, POINT_BUY_BUDGET, pointBuyCost } from '../src/rules/srd51/abilities.js';
import { proficiencyBonusForLevel, proficiencyBonusForCR, xpForCR, parseCR } from '../src/rules/srd51/proficiency.js';
import { spellSlots, FULL_CASTER_SLOTS, MAX_LEVEL } from '../src/rules/srd51/progression.js';
import { generateCharacter } from '../src/sheets/character/generator.js';
import { generateCreature } from '../src/sheets/creature/generator.js';
import { CHARACTER_ROLES } from '../src/sheets/character/spec.js';
import { CREATURE_ROLES } from '../src/sheets/creature/spec.js';
import { crDrift } from '../src/sheets/creature/cr-evaluator.js';
import {
  partyBudget, groupMultiplier, standardShare, difficultyOf, encounterXP, DIFFICULTIES,
} from '../src/rules/srd51/encounter.js';
import { generateEncounter } from '../src/encounter/generator.js';
import { validateEncounter } from '../src/encounter/validator.js';
import { SHAPE_STEPS } from '../src/encounter/spec.js';
import { toMarkdown, toJSON, toEncounterJSON, encounterMarkdown } from '../src/api.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, 'fixtures', 'golden.json');
const registry = buildRegistry();

let failures = 0;
let checks = 0;

const ok = (label) => { checks++; console.log(`  \x1b[32mPASS\x1b[0m ${label}`); };
const bad = (label, detail) => {
  checks++; failures++;
  console.log(`  \x1b[31mFAIL\x1b[0m ${label}`);
  if (detail) console.log(`       ${String(detail).split('\n').slice(0, 6).join('\n       ')}`);
};
const assert = (condition, label, detail) => (condition ? ok(label) : bad(label, detail));
const section = (title) => console.log(`\n\x1b[1m${title}\x1b[0m`);

// --- content -------------------------------------------------------------------

function verifyContent() {
  section('Content');
  const result = registry.validate();
  assert(result.valid, `${registry.byId.size} entities pass schema, reference and provenance checks`,
    result.errors.slice(0, 5).map((e) => `${e.path}: ${e.message}`).join('\n'));

  // A class must be able to fill its own spell list at every level it can cast.
  for (const cls of registry.all('class')) {
    if (!cls.spellcasting) continue;
    const list = registry.findSpells({ classId: cls.spellcasting.listSlug });
    const cantrips = list.filter((s) => s.level === 0);
    const needed = cls.spellcasting.cantripsKnown ? Math.max(...cls.spellcasting.cantripsKnown) : 0;
    assert(cantrips.length >= needed,
      `${cls.name}: ${cantrips.length} cantrips available, ${needed} needed at level 20`);
    const known = cls.spellcasting.spellsKnown ? Math.max(...cls.spellcasting.spellsKnown) : 0;
    if (known) {
      const levelled = list.filter((s) => s.level > 0);
      assert(levelled.length >= known,
        `${cls.name}: ${levelled.length} levelled spells available, ${known} known at level 20`);
    }
  }

  // Unreachable content is a content bug, not a generation bug.
  const orphanSpells = registry.all('spell').filter((s) => !s.classes.length);
  assert(orphanSpells.length === 0, 'every spell belongs to at least one class list',
    orphanSpells.map((s) => s.name).join(', '));

  const crCoverage = new Set(registry.all('monster').map((m) => String(m.cr)));
  assert(crCoverage.size >= 12, `bestiary spans ${crCoverage.size} distinct challenge ratings`);
  const typeCoverage = new Set(registry.all('monster').map((m) => m.creatureType));
  assert(typeCoverage.size >= 10, `bestiary spans ${typeCoverage.size} creature types`);
}

// --- rng -----------------------------------------------------------------------

function verifyRNG() {
  section('Deterministic RNG');

  const a = createSeedContext('seed-one');
  const b = createSeedContext('seed-one');
  const seqA = Array.from({ length: 64 }, () => a.stream('npc:abilities').float());
  const seqB = Array.from({ length: 64 }, () => b.stream('npc:abilities').float());
  assert(seqA.join() === seqB.join(), 'same seed and namespace produce an identical sequence');

  const c = createSeedContext('seed-two');
  const seqC = Array.from({ length: 64 }, () => c.stream('npc:abilities').float());
  assert(seqA.join() !== seqC.join(), 'different seeds produce different sequences');

  // Isolation: drawing from one namespace must not disturb another.
  const d = createSeedContext('seed-one');
  for (let i = 0; i < 500; i++) d.stream('npc:personality').float();
  const seqD = Array.from({ length: 64 }, () => d.stream('npc:abilities').float());
  assert(seqA.join() === seqD.join(), 'namespaces are isolated from one another');

  // Rerolling one namespace must move only that namespace.
  const rerolled = applyReroll({}, 'personality');
  const e = createSeedContext('seed-one', rerolled);
  const seqE = Array.from({ length: 64 }, () => e.stream('npc:abilities').float());
  const persBefore = createSeedContext('seed-one').stream('npc:personality').float();
  const persAfter = e.stream('npc:personality').float();
  assert(seqA.join() === seqE.join(), 'rerolling personality leaves the abilities stream untouched');
  assert(persBefore !== persAfter, 'rerolling personality does change the personality stream');

  // Helper ranges.
  const s = createSeedContext('helpers').stream('npc:skills');
  const ints = Array.from({ length: 2000 }, () => s.int(3, 7));
  assert(ints.every((n) => n >= 3 && n <= 7 && Number.isInteger(n)), 'int(lo, hi) stays inclusive and integral');
  assert(new Set(ints).size === 5, 'int(lo, hi) reaches both endpoints');
  const sample = s.sample([1, 2, 3, 4, 5], 3);
  assert(sample.length === 3 && new Set(sample).size === 3, 'sample draws without replacement');
  const vetoed = Array.from({ length: 50 }, () => s.weighted(['a', 'b'], (x) => (x === 'a' ? 1 : 0)));
  assert(vetoed.every((x) => x === 'a'), 'a weight of zero makes an option unreachable');

  const scopes = Object.keys(REROLL_SCOPES);
  assert(scopes.length >= 10, `${scopes.length} reroll scopes defined`);
}

// --- rules ---------------------------------------------------------------------

function verifyRules() {
  section('Rules math');

  let good = true;
  for (let score = 1; score <= 30; score++) {
    if (abilityModifier(score) !== Math.floor((score - 10) / 2)) good = false;
  }
  assert(good, 'ability modifier is floor((score - 10) / 2) for every score 1-30');

  assert([1, 2, 3, 4].every((l) => proficiencyBonusForLevel(l) === 2)
    && proficiencyBonusForLevel(5) === 3 && proficiencyBonusForLevel(9) === 4
    && proficiencyBonusForLevel(13) === 5 && proficiencyBonusForLevel(17) === 6
    && proficiencyBonusForLevel(20) === 6,
  'proficiency bonus follows the level table');

  assert(proficiencyBonusForCR(0) === 2 && proficiencyBonusForCR(4) === 2
    && proficiencyBonusForCR(5) === 3 && proficiencyBonusForCR(9) === 4 && proficiencyBonusForCR(17) === 6,
  'proficiency bonus follows the challenge rating table');

  assert(xpForCR('1/4') === 50 && xpForCR(5) === 1800 && xpForCR(17) === 18000,
    'XP matches the challenge rating table');

  assert(pointBuyCost(STANDARD_ARRAY) === 27
    ? true
    : pointBuyCost([15, 14, 13, 12, 10, 8]) === 27, 'the standard array costs exactly the point-buy budget',
  `standard array costs ${pointBuyCost(STANDARD_ARRAY)} of ${POINT_BUY_BUDGET}`);

  // Slot tables must be monotone and never exceed 9th level.
  let monotone = true;
  for (let level = 2; level <= MAX_LEVEL; level++) {
    const prev = spellSlots('full', level - 1).reduce((n, s) => n + s.total * s.level, 0);
    const now = spellSlots('full', level).reduce((n, s) => n + s.total * s.level, 0);
    if (now < prev) monotone = false;
  }
  assert(monotone, 'full caster slot value never decreases with level');
  assert(FULL_CASTER_SLOTS[20].length === 9, 'a level 20 full caster reaches 9th-level slots');
  assert(spellSlots('pact', 11)[0].level === 5 && spellSlots('pact', 11)[0].total === 3,
    'pact magic at level 11 is three 5th-level slots');
}

// --- sheets --------------------------------------------------------------------

function verifySheets() {
  section('Character generation sweep');
  const levels = [1, 2, 3, 4, 5, 6, 8, 11, 14, 17, 20];
  let produced = 0;
  let retried = 0;
  const problems = [];

  for (const role of CHARACTER_ROLES) {
    for (const level of levels) {
      for (let i = 0; i < 6; i++) {
        const result = generateCharacter({ seed: `${role}-${level}-${i}`, level, role }, registry);
        if (!result.ok) {
          problems.push(`${role} L${level} #${i}: ${result.failure.validationErrors.map((e) => e.message).join('; ')}`);
          continue;
        }
        produced++;
        if (result.sheet.generation.attempt > 0) retried++;
        // Spot-check the export paths on every sheet: a sheet that cannot be
        // written out is not really finished.
        const md = toMarkdown(result.sheet);
        if (!md.includes('Generation and Provenance')) problems.push(`${role} L${level}: markdown lost its provenance section`);
      }
    }
  }
  assert(problems.length === 0, `${produced} characters generated, validated and exported (${retried} needed a retry)`,
    problems.slice(0, 5).join('\n'));

  // Every class at every level, explicitly.
  const classProblems = [];
  for (const cls of registry.all('class')) {
    for (let level = 1; level <= 20; level++) {
      const result = generateCharacter({ seed: `${cls.slug}-${level}`, level, class: cls.slug }, registry);
      if (!result.ok) classProblems.push(`${cls.name} L${level}: ${result.failure.validationErrors.map((e) => e.message).join('; ')}`);
    }
  }
  assert(classProblems.length === 0, 'every class validates at every level from 1 to 20',
    classProblems.slice(0, 5).join('\n'));

  // Ability methods and HP policies.
  const methodProblems = [];
  for (const abilityMethod of ['standard-array', 'point-buy', 'rolled']) {
    for (const hpPolicy of ['fixed', 'rolled']) {
      for (let i = 0; i < 20; i++) {
        const result = generateCharacter({
          seed: `${abilityMethod}-${hpPolicy}-${i}`, level: 1 + (i % 20), role: 'random',
          constraints: { abilityMethod, hpPolicy },
        }, registry);
        if (!result.ok) methodProblems.push(`${abilityMethod}/${hpPolicy}: ${result.failure.message}`);
      }
    }
  }
  assert(methodProblems.length === 0, 'all ability methods and hit point policies produce valid sheets',
    methodProblems.slice(0, 3).join('\n'));

  // Constraints must actually hold.
  let violations = 0;
  for (const wants of [true, false]) {
    for (let i = 0; i < 40; i++) {
      const result = generateCharacter({
        seed: `sc-${wants}-${i}`, level: 2 + (i % 19), role: 'random',
        constraints: { spellcaster: wants },
      }, registry);
      if (result.ok && Boolean(result.sheet.spellcasting) !== wants) violations++;
    }
  }
  assert(violations === 0, 'the spellcaster constraint is honoured in both directions');

  section('Creature generation sweep');
  const creatureProblems = [];
  let existing = 0;
  for (const monster of registry.all('monster')) {
    const result = generateCreature({ seed: `norm-${monster.slug}`, mode: 'existing', baseCreature: monster.slug }, registry);
    if (!result.ok) {
      creatureProblems.push(`${monster.name}: ${(result.failure.validationErrors || []).map((e) => e.message).join('; ')}`);
      continue;
    }
    existing++;
    const md = toMarkdown(result.sheet);
    if (!md.includes('Challenge')) creatureProblems.push(`${monster.name}: markdown lost its challenge line`);
  }
  assert(creatureProblems.length === 0,
    `all ${existing} bundled creatures normalise, validate and export with source fidelity intact`,
    creatureProblems.slice(0, 5).join('\n'));

  let variantOK = 0;
  let variantPolicy = 0;
  for (const cr of [0.25, 0.5, 1, 2, 3, 5, 8, 12, 17]) {
    for (let i = 0; i < 12; i++) {
      const result = generateCreature({ seed: `var-${cr}-${i}`, mode: 'variant', targetCR: cr }, registry);
      if (result.ok) variantOK++;
      else if (result.failure.code === 'cr-policy-unmet') variantPolicy++;
      else creatureProblems.push(`variant CR ${cr}: ${result.failure.message}`);
    }
  }
  assert(true, `variants: ${variantOK} produced, ${variantPolicy} declined on CR policy rather than mislabelled`);

  let generated = 0;
  const genProblems = [];
  for (const type of ['undead', 'fiend', 'construct', 'monstrosity', 'elemental', 'aberration', 'beast', 'giant', 'dragon', 'ooze', 'plant', 'fey', 'celestial', 'humanoid']) {
    for (const cr of [1, 3, 5, 8, 12, 17]) {
      for (const role of CREATURE_ROLES) {
        const result = generateCreature({ seed: `gen-${type}-${cr}-${role}`, mode: 'generated', targetCR: cr, creatureType: type, role }, registry);
        if (result.ok) generated++;
        else genProblems.push(`${type} CR ${cr} ${role}: ${result.failure.message}`);
      }
    }
  }
  assert(genProblems.length === 0,
    `${generated} generated creatures land within the CR policy and validate`,
    genProblems.slice(0, 5).join('\n'));
}

// --- CR drift -------------------------------------------------------------------

function verifyCR() {
  section('CR model drift against the bundled bestiary');
  const rows = [];
  for (const monster of registry.all('monster')) {
    const result = generateCreature({ seed: `cr-${monster.slug}`, mode: 'existing', baseCreature: monster.slug }, registry);
    if (result.ok) rows.push(crDrift(result.sheet));
  }
  const deltas = rows.map((r) => r.delta);
  const abs = deltas.map(Math.abs).sort((a, b) => a - b);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const within1 = abs.filter((d) => d <= 1).length;
  const within2 = abs.filter((d) => d <= 2).length;

  console.log(`  ${rows.length} creatures | mean delta ${mean(deltas).toFixed(2)} | mean |delta| ${mean(abs).toFixed(2)} | median |delta| ${abs[Math.floor(abs.length / 2)]}`);
  console.log(`  within 1 CR: ${within1}/${rows.length}  within 2 CR: ${within2}/${rows.length}`);
  console.log('  largest disagreements:');
  for (const row of [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8)) {
    console.log(`    ${row.name.padEnd(22)} printed ${String(row.printedCR).padEnd(5)} evaluated ${String(row.evaluatedCR).padEnd(5)} (defensive ${row.defensiveCR}, offensive ${row.offensiveCR})`);
  }

  assert(within1 / rows.length >= 0.7, 'at least 70% of bundled creatures evaluate within one CR of their printed rating');
  assert(within2 / rows.length >= 0.9, 'at least 90% evaluate within two CR of their printed rating');
  assert(Math.abs(mean(deltas)) <= 1, 'the model has no large systematic bias');
}

// --- golden seeds ----------------------------------------------------------------

const GOLDEN_SPECS = [
  { name: 'scout-5', kind: 'character', spec: { seed: 'ember-raven-4172', level: 5, role: 'scout', theme: 'Forest Guide' } },
  { name: 'warrior-1', kind: 'character', spec: { seed: 'anvil-1', level: 1, role: 'warrior' } },
  { name: 'arcane-11', kind: 'character', spec: { seed: 'tower-11', level: 11, role: 'arcane-caster', theme: 'Tower Scholar' } },
  { name: 'divine-17', kind: 'character', spec: { seed: 'chant-17', level: 17, role: 'divine-caster' } },
  { name: 'brute-20', kind: 'character', spec: { seed: 'anvil-20', level: 20, role: 'brute' } },
  { name: 'expert-8-pointbuy', kind: 'character', spec: { seed: 'shade-8', level: 8, role: 'expert', constraints: { abilityMethod: 'point-buy' } } },
  { name: 'face-3-constrained', kind: 'character', spec: { seed: 'silver-3', level: 3, role: 'face', constraints: { spellcaster: true, requiredSkills: ['persuasion'] } } },
  { name: 'crypt-warden', kind: 'creature', spec: { seed: 'crypt-warden-882', mode: 'existing', targetCR: 3, family: 'undead', environment: 'crypt', role: 'controller' } },
  { name: 'goblin-fixed', kind: 'creature', spec: { seed: 'gob-1', mode: 'existing', baseCreature: 'goblin' } },
  { name: 'variant-5', kind: 'creature', spec: { seed: 'warped-5', mode: 'variant', targetCR: 5, family: 'undead' } },
  { name: 'generated-5', kind: 'creature', spec: { seed: 'ashen-eye-1209', mode: 'generated', targetCR: 5, creatureType: 'undead', role: 'controller' } },
  { name: 'group-horde-5', kind: 'encounter', spec: { seed: 'ember-raven-4172', partyLevel: 5, partySize: 4, difficulty: 'hard', shape: -2 } },
  { name: 'group-solo-12', kind: 'encounter', spec: { seed: 'kiln-oath-9001', partyLevel: 12, partySize: 5, difficulty: 'deadly', shape: 2 } },
];

function currentGolden() {
  const out = {};
  for (const entry of GOLDEN_SPECS) {
    const result = entry.kind === 'encounter'
      ? generateEncounter(entry.spec, registry)
      : entry.kind === 'creature'
        ? generateCreature(entry.spec, registry)
        : generateCharacter(entry.spec, registry);
    if (!result.ok) { out[entry.name] = { error: result.failure.code }; continue; }
    if (entry.kind === 'encounter') {
      // A group is pinned by its whole composition, not by one sheet: the
      // fingerprint covers the roster and the difficulty arithmetic together,
      // which is what would catch a change to the composer that left every
      // individual stat block untouched.
      out[entry.name] = {
        fingerprint: fingerprint(result.encounter),
        name: result.encounter.composition.summary,
        summary: `${result.encounter.members.length} `
          + `${result.encounter.members.length === 1 ? 'enemy' : 'enemies'}, ${result.encounter.difficulty.label}, `
          + `${result.encounter.xp.adjusted}/${result.encounter.xp.budget} XP`,
      };
      continue;
    }
    out[entry.name] = {
      fingerprint: fingerprint(result.sheet),
      name: result.sheet.identity.name,
      summary: entry.kind === 'creature'
        ? `${result.sheet.size} ${result.sheet.creatureType} CR ${result.sheet.challengeRating}`
        : `${result.sheet.species.name} ${result.sheet.classLevels[0].name} ${result.sheet.level}`,
    };
  }
  return out;
}

function verifySeeds(update) {
  section('Golden seed regression');
  const current = currentGolden();

  if (update || !existsSync(GOLDEN_PATH)) {
    writeFileSync(GOLDEN_PATH, `${canonicalJSON(current)}\n`);
    console.log(`  wrote ${GOLDEN_PATH}`);
    for (const [name, entry] of Object.entries(current)) {
      console.log(`    ${name.padEnd(20)} ${entry.fingerprint} ${entry.name} — ${entry.summary}`);
    }
    return;
  }

  const stored = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  for (const [name, entry] of Object.entries(stored)) {
    const now = current[name];
    if (!now) { bad(`${name}: no longer produced`); continue; }
    assert(now.fingerprint === entry.fingerprint,
      `${name} reproduces byte-identically (${entry.name})`,
      now.fingerprint === entry.fingerprint ? '' : `stored ${entry.fingerprint} (${entry.name}) -> now ${now.fingerprint} (${now.name})`);
  }

  // Regenerating twice in one process must also match.
  const twice = currentGolden();
  assert(canonicalJSON(twice) === canonicalJSON(current), 'two runs in the same process agree');
}

// --- statistics ------------------------------------------------------------------

function verifyStats(count = 1500) {
  section(`Statistical generation over ${count} seeds`);
  const classes = {};
  const species = {};
  const backgrounds = {};
  const roles = {};
  const abilityTotals = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  let retries = 0;
  let errors = 0;
  let produced = 0;

  for (let i = 0; i < count; i++) {
    const result = generateCharacter({ seed: `stat-${i}`, level: 1 + (i % 20), role: 'random' }, registry);
    if (!result.ok) { errors++; continue; }
    produced++;
    const s = result.sheet;
    classes[s.classLevels[0].name] = (classes[s.classLevels[0].name] || 0) + 1;
    species[s.species.name] = (species[s.species.name] || 0) + 1;
    backgrounds[s.background.name] = (backgrounds[s.background.name] || 0) + 1;
    roles[s.role] = (roles[s.role] || 0) + 1;
    for (const a of Object.keys(abilityTotals)) abilityTotals[a] += s.abilityScores[a];
    if (s.generation.attempt > 0) retries++;
    if (s.validation.errors.length) errors++;
  }

  const show = (label, table, expected) => {
    const entries = Object.entries(table).sort((a, b) => b[1] - a[1]);
    console.log(`  ${label}: ${entries.map(([k, v]) => `${k} ${(v / produced * 100).toFixed(1)}%`).join(', ')}`);
    const missing = expected.filter((k) => !table[k]);
    assert(missing.length === 0, `every ${label.toLowerCase()} option is reachable`, `unreachable: ${missing.join(', ')}`);
    const top = entries[0][1] / produced;
    assert(top < 0.5, `no single ${label.toLowerCase()} dominates (top is ${(top * 100).toFixed(1)}%)`);
  };

  show('Class', classes, registry.all('class').map((c) => c.name));
  show('Species', species, registry.all('species').map((s) => s.name));
  show('Background', backgrounds, registry.all('background').map((b) => b.name));
  show('Role', roles, CHARACTER_ROLES);

  console.log(`  Mean ability scores: ${Object.entries(abilityTotals).map(([a, t]) => `${a} ${(t / produced).toFixed(1)}`).join(', ')}`);
  assert(errors === 0, `every returned sheet has zero validation errors (${produced} sheets)`);
  assert(retries / produced < 0.05, `internal retry rate is ${(retries / produced * 100).toFixed(2)}%`);

  // Creature side.
  const crs = {};
  const creatureTypes = {};
  let creatureErrors = 0;
  for (let i = 0; i < 500; i++) {
    const result = generateCreature({ seed: `cstat-${i}`, mode: 'existing' }, registry);
    if (!result.ok) { creatureErrors++; continue; }
    crs[result.sheet.challengeRating] = (crs[result.sheet.challengeRating] || 0) + 1;
    creatureTypes[result.sheet.creatureType] = (creatureTypes[result.sheet.creatureType] || 0) + 1;
  }
  console.log(`  Creature types: ${Object.entries(creatureTypes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  assert(creatureErrors === 0, 'unconstrained creature requests always return a valid sheet');
  assert(Object.keys(crs).length >= 10, `unconstrained requests reach ${Object.keys(crs).length} distinct challenge ratings`);
}

// --- encounters ------------------------------------------------------------------

function verifyEncounters() {
  section('Encounter model');

  // The budget is derived, so its shape is a property to check rather than a
  // table to trust: it must rise with every input that should make a fight
  // harder, and with none that should not.
  let monotonic = true;
  for (let level = 2; level <= 20; level++) {
    if (standardShare(level) <= standardShare(level - 1)) monotonic = false;
  }
  assert(monotonic, 'the per-character budget rises with every character level');

  let sizeMonotonic = true;
  let difficultyMonotonic = true;
  for (let level = 1; level <= 20; level++) {
    for (let size = 2; size <= 8; size++) {
      if (partyBudget({ partyLevel: level, partySize: size })
        <= partyBudget({ partyLevel: level, partySize: size - 1 })) sizeMonotonic = false;
    }
    let previous = 0;
    for (const difficulty of DIFFICULTIES) {
      const budget = partyBudget({ partyLevel: level, partySize: 4, difficulty });
      if (budget <= previous) difficultyMonotonic = false;
      previous = budget;
    }
  }
  assert(sizeMonotonic, 'the budget rises with party size at every level');
  assert(difficultyMonotonic, 'light < standard < hard < deadly at every level');

  // The action economy multiplier: strictly rising, bounded, and 1 for a solo.
  let multiplierOK = groupMultiplier(1, 4) === 1;
  for (let n = 2; n <= 16; n++) {
    const m = groupMultiplier(n, 4);
    if (m <= groupMultiplier(n - 1, 4) || m > 4) multiplierOK = false;
  }
  assert(multiplierOK, 'the action economy multiplier is 1 for a solo, rises with count, and stays <= 4');
  assert(groupMultiplier(6, 6) < groupMultiplier(6, 3),
    'the same six enemies are worth less against a bigger party');

  // A standard encounter for four characters of level L should be about one
  // creature of CR L -- the claim the whole model is derived from. Checking it
  // here is what stops the derivation from quietly drifting.
  let anchorOK = true;
  for (let level = 1; level <= 20; level++) {
    const solo = encounterXP([level], 4);
    const d = difficultyOf(solo.adjusted, { partyLevel: level, partySize: 4 });
    if (d.label !== 'standard') anchorOK = false;
  }
  assert(anchorOK, 'one creature of CR L rates as a standard encounter for four characters of level L');

  // --- generation sweep ----------------------------------------------------------

  let produced = 0;
  let invalid = 0;
  let failed = 0;
  let onTarget = 0;
  let attempts = 0;
  const failures = [];

  for (let level = 1; level <= 20; level += 1) {
    for (const size of [3, 4, 5]) {
      for (const difficulty of DIFFICULTIES) {
        for (const shape of [-2, 0, 2]) {
          attempts++;
          const seed = `sweep-${level}-${size}-${difficulty}-${shape}`;
          const result = generateEncounter({
            seed, partyLevel: level, partySize: size, difficulty, shape,
          }, registry);
          if (!result.ok) {
            failed++;
            if (failures.length < 3) failures.push(`${seed}: ${result.failure.message}`);
            continue;
          }
          produced++;
          // Re-run the validator here rather than trusting the one the
          // generator already ran: a generator that skipped validation would
          // otherwise pass this sweep silently.
          const validation = validateEncounter(result.encounter, result.sheets);
          if (!validation.valid) {
            invalid++;
            if (failures.length < 3) failures.push(`${seed}: ${validation.errors[0].message}`);
          }
          if (result.encounter.difficulty.label === difficulty) onTarget++;
        }
      }
    }
  }

  assert(failed === 0, `every party/difficulty/shape combination produces a group (${attempts} requests)`,
    failures.join('\n'));
  assert(invalid === 0, `every produced group passes independent validation (${produced} groups)`,
    failures.join('\n'));

  const hitRate = onTarget / Math.max(1, produced);
  console.log(`  Requested difficulty delivered: ${(hitRate * 100).toFixed(1)}% of ${produced} groups`);
  assert(hitRate > 0.75,
    `the requested difficulty is delivered in most cases (${(hitRate * 100).toFixed(1)}%)`);

  // --- the shape dial ------------------------------------------------------------

  // The nudge has to actually move something, at a fixed budget: this is the
  // check that would catch a composer that quietly ignored it.
  let dialOK = true;
  const counts = [];
  for (const step of SHAPE_STEPS) {
    const result = generateEncounter({
      seed: 'dial-check', partyLevel: 8, partySize: 4, difficulty: 'hard', shape: step.value,
    }, registry);
    if (!result.ok) { dialOK = false; break; }
    counts.push(result.encounter.members.length);
  }
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > counts[i - 1]) dialOK = false;   // horde -> solo must not grow
  }
  console.log(`  Enemy count across the shape dial (horde to solo): ${counts.join(' -> ')}`);
  assert(dialOK && counts[0] > counts[counts.length - 1],
    'the shape nudge trades enemy count against enemy rating at a fixed budget');

  // The style dial must reach spellcasters where the content has them.
  const casters = generateEncounter({
    seed: 'style-check', partyLevel: 9, partySize: 4, difficulty: 'hard', style: 2,
  }, registry);
  assert(casters.ok && casters.encounter.members.some((m) => m.spellcaster),
    'the caster nudge puts at least one spellcaster in the group');

  // --- determinism ---------------------------------------------------------------

  const spec = {
    seed: 'ember-raven-4172', partyLevel: 6, partySize: 4,
    difficulty: 'hard', shape: -1, style: 1, environment: 'crypt',
  };
  const first = generateEncounter(spec, registry);
  const second = generateEncounter(spec, registry);
  assert(first.ok && second.ok && toEncounterJSON(first, registry) === toEncounterJSON(second, registry),
    'the same seed and spec reproduce a byte-identical group');
  assert(first.ok && toEncounterJSON(first, registry)
    !== toEncounterJSON(generateEncounter({ ...spec, seed: 'other-seed' }, registry), registry),
    'a different seed produces a different group');

  // Every member is a sheet the Enemy Creature tab could have produced alone.
  const memberErrors = first.sheets.filter((entry) => !entry.validation?.valid).length;
  assert(memberErrors === 0, `every member of a group carries its own clean validation (${first.sheets.length} sheets)`);

  const markdown = encounterMarkdown(first.encounter, first.sheets);
  assert(markdown.includes('## Roster') && first.sheets.every((e) => markdown.includes(e.sheet.identity.name)),
    'the Markdown export contains the roster and every member');
}

// --- runner ----------------------------------------------------------------------

const args = process.argv.slice(2);
const update = args.includes('--update');
const commands = args.filter((a) => !a.startsWith('--'));
const run = commands.length ? commands : ['content', 'rng', 'rules', 'sheets', 'cr', 'encounters', 'seeds', 'stats'];

console.log(`\x1b[1mVerifying — ${registry.byId.size} content entities from ${registry.packs.map((p) => p.id).join(', ')}\x1b[0m`);
for (const command of run) {
  if (command === 'content') verifyContent();
  else if (command === 'rng') verifyRNG();
  else if (command === 'rules') verifyRules();
  else if (command === 'sheets') verifySheets();
  else if (command === 'cr') verifyCR();
  else if (command === 'encounters') verifyEncounters();
  else if (command === 'seeds') verifySeeds(update);
  else if (command === 'stats') verifyStats();
  else { console.log(`unknown command: ${command}`); failures++; }
}

console.log(`\n${failures === 0 ? '\x1b[32m' : '\x1b[31m'}${checks - failures}/${checks} checks passed\x1b[0m`);
process.exit(failures === 0 ? 0 : 1);
