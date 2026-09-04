// Public API.
//
// The stable surface other tools call. The boundary the build plan draws is
// enforced here, and it is a boundary rather than an omission: an encounter
// system decides *which* entities exist and how many; this project decides what
// each one's complete, valid sheet is.
//
// The group generator lives on the encounter side of that line, in
// `src/encounter/`. It is a consumer of the sheet generators like any external
// tool would be -- it composes a roster against a difficulty budget and then
// asks `generateCreature` for each member's sheet. Nothing under `sheets/`,
// `rules/` or `content/` imports it, and nothing under those directories knows
// an encounter exists. An external encounter builder can still ignore it
// entirely and call `generateCreature` directly, which is the property the
// boundary was drawn to preserve.

import { buildRegistry, DEFAULT_PACK_IDS } from './content/packs/index.js';
import { createSeedContext, applyReroll, REROLL_SCOPES } from './core/rng.js';
import { GENERATOR_VERSION, SCHEMA_VERSION } from './core/version.js';
import { generateCharacter as generateCharacterSheet } from './sheets/character/generator.js';
import { generateCreature as generateCreatureSheet } from './sheets/creature/generator.js';
import { generateEncounter as generateEncounterGroup } from './encounter/generator.js';
import { buildDocument, buildEncounterDocument, importDocument, serializeDocument } from './export/json.js';
import { characterMarkdown, creatureMarkdown, encounterMarkdown } from './export/markdown.js';

let sharedRegistry = null;

/** The registry every entry point defaults to. Built once, reused. */
export function getRegistry(packIds = null) {
  if (packIds) return buildRegistry(packIds);
  if (!sharedRegistry) sharedRegistry = buildRegistry();
  return sharedRegistry;
}

export const generateCharacter = (spec, options = {}) =>
  generateCharacterSheet(spec, options.registry || getRegistry(spec.contentPacks), options);

export const generateCreature = (spec, options = {}) =>
  generateCreatureSheet(spec, options.registry || getRegistry(spec.contentPacks), options);

/**
 * Encounter generation: the layer that decides *which* enemies exist and how
 * many, for a given party.
 *
 * This is the one entry point that sits above the sheet generators rather than
 * beside them. It composes a group against a difficulty budget and then calls
 * `generateCreature` once per member, so it can never produce a sheet the Enemy
 * Creature tab could not have produced on its own. Nothing below this line
 * knows an encounter exists -- the dependency runs strictly one way.
 */
export const generateEncounter = (spec, options = {}) =>
  generateEncounterGroup(spec, options.registry || getRegistry(spec.contentPacks), options);

/**
 * Batch generation. Each request gets a deterministic child seed derived from
 * the batch seed and its index, so the same batch always produces the same
 * party -- and so re-requesting one entity alone reproduces it exactly.
 *
 * Duplicate names are resolved by suffixing rather than by rerolling, because
 * rerolling an identity would change nothing mechanical and everything about
 * reproducibility.
 */
export function generateSheets(requests, options = {}) {
  const registry = options.registry || getRegistry();
  const batchSeed = options.seed || 'batch';
  const root = createSeedContext(batchSeed, options.rerolls || {});
  const sheets = [];
  const failures = [];
  const usedNames = new Map();

  let index = 0;
  for (const request of requests) {
    const count = Math.max(1, Math.round(request.count || 1));
    for (let i = 0; i < count; i++) {
      const label = request.label || request.kind || 'entity';
      const child = root.child(`${label}:${index}`);
      const spec = { ...request.spec, seed: request.spec?.seed || child.seed };

      const result = request.kind === 'creature'
        ? generateCreatureSheet(spec, registry, { index: i, label })
        : generateCharacterSheet(spec, registry, { index: i, label: titleCase(label) });

      if (!result.ok) {
        failures.push({ label, index, failure: result.failure });
      } else {
        deduplicateName(result.sheet, usedNames, count > 1 ? i : null);
        sheets.push({ label, index, ordinal: i + 1, ...result });
      }
      index++;
    }
  }

  return {
    ok: failures.length === 0,
    seed: root.seed,
    sheets,
    failures,
    manifest: {
      generatorVersion: GENERATOR_VERSION,
      schemaVersion: SCHEMA_VERSION,
      contentPacks: registry.packs.map((p) => ({ id: p.id, version: p.version })),
      requested: requests.length,
      produced: sheets.length,
    },
  };
}

/**
 * Anonymous members of a group get numbered; a genuine name collision between
 * two named NPCs gets an epithet-free suffix rather than a silent duplicate.
 */
function deduplicateName(sheet, usedNames, ordinal) {
  const base = sheet.identity.name;
  const seen = usedNames.get(base) || 0;
  usedNames.set(base, seen + 1);
  if (seen === 0) return;
  sheet.identity.name = sheet.identity.anonymous || ordinal !== null
    ? `${base} ${seen + 1}`
    : `${base} (${seen + 1})`;
  sheet.identity.duplicateResolved = true;
}

/** Re-runs generation with a reroll scope applied to the stored manifest. */
export function reroll(sheet, scope, options = {}) {
  const registry = options.registry || getRegistry();
  const rerolls = applyReroll(sheet.generation.rerolls || {}, scope);
  const spec = { ...sheet.generation.spec, seed: sheet.generation.requestedSeed || sheet.seed };
  return sheet.kind === 'creature'
    ? generateCreatureSheet(spec, registry, { rerolls })
    : generateCharacterSheet(spec, registry, { rerolls });
}

/**
 * Regeneration from a stored document. Explicitly separate from importing one:
 * this re-runs the pipeline, and under a different generator or content version
 * it may legitimately produce a different sheet.
 */
export function regenerateFromDocument(document, options = {}) {
  const registry = options.registry || getRegistry();
  const spec = { ...document.spec, seed: document.manifest.requestedSeed || document.manifest.seed };
  const rerolls = document.manifest.rerolls || {};
  return document.kind === 'creature'
    ? generateCreatureSheet(spec, registry, { rerolls })
    : generateCharacterSheet(spec, registry, { rerolls });
}

export const toMarkdown = (sheet) =>
  (sheet.kind === 'creature' ? creatureMarkdown(sheet) : characterMarkdown(sheet));

export const toDocument = (result, registry) => buildDocument(result, registry || getRegistry());
export const toJSON = (result, registry) => serializeDocument(toDocument(result, registry));

export const toEncounterDocument = (result, registry) =>
  buildEncounterDocument(result, registry || getRegistry());
export const toEncounterJSON = (result, registry) =>
  serializeDocument(toEncounterDocument(result, registry));

export {
  importDocument, serializeDocument, buildDocument, buildEncounterDocument,
  characterMarkdown, creatureMarkdown, encounterMarkdown,
  REROLL_SCOPES, DEFAULT_PACK_IDS, GENERATOR_VERSION, SCHEMA_VERSION,
};

const titleCase = (text) => String(text).replace(/(^|[\s-])(\w)/g, (m, sep, ch) => sep + ch.toUpperCase());
