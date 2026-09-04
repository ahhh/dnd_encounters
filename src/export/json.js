// JSON persistence.
//
// JSON is the canonical, lossless form. A saved document contains everything
// needed to put the sheet back on screen *without regenerating it* -- that is
// the point of the distinction between `importDocument` (reconstructs the
// stored sheet) and regeneration from the spec, which re-runs the pipeline and
// may legitimately produce something different under a newer generator version.

import { canonicalize, canonicalJSON, fingerprint } from '../core/ids.js';
import { GENERATOR_VERSION, SCHEMA_VERSION } from '../core/version.js';

/** Wraps a generated sheet in the document envelope that gets written to disk. */
export function buildDocument(result, registry) {
  const sheet = result.sheet;
  const document = {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    kind: sheet.kind,
    exportedAt: null, // deliberately null: a timestamp would break byte-equality
    spec: sheet.generation.spec,
    manifest: {
      generatorVersion: sheet.generation.generatorVersion,
      ruleset: sheet.generation.ruleset,
      contentPacks: sheet.generation.contentPacks,
      seed: sheet.generation.seed,
      requestedSeed: sheet.generation.requestedSeed,
      rerolls: sheet.generation.rerolls,
    },
    sheet,
    validation: result.validation
      ? {
        valid: result.validation.valid,
        errorCount: result.validation.errors.length,
        warningCount: result.validation.warnings.length,
        errors: result.validation.errors,
        warnings: result.validation.warnings,
      }
      : null,
    attribution: sheet.generation.attribution || registry?.attribution?.([]) || [],
  };
  document.fingerprint = fingerprint(canonicalize({ ...document, fingerprint: undefined }));
  return document;
}


/**
 * The document envelope for a whole group. Holds the encounter summary and
 * every member's sheet, so a saved group reopens complete -- roster, difficulty
 * arithmetic and stat blocks -- without regenerating anything.
 */
export function buildEncounterDocument(result, registry) {
  const encounter = result.encounter;
  const document = {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    kind: 'encounter',
    exportedAt: null,
    spec: encounter.generation.spec,
    manifest: {
      generatorVersion: encounter.generation.generatorVersion,
      ruleset: encounter.generation.ruleset,
      contentPacks: encounter.generation.contentPacks,
      seed: encounter.generation.seed,
      requestedSeed: encounter.generation.requestedSeed,
    },
    encounter,
    sheets: (result.sheets || []).map((entry) => entry.sheet),
    validation: result.validation
      ? {
        valid: result.validation.valid,
        errorCount: result.validation.errors.length,
        warningCount: result.validation.warnings.length,
        errors: result.validation.errors,
        warnings: result.validation.warnings,
      }
      : null,
    attribution: mergeAttribution(result.sheets || [], registry),
  };
  document.fingerprint = fingerprint(canonicalize({ ...document, fingerprint: undefined }));
  return document;
}

/** One attribution notice per contributing pack across the whole group. */
function mergeAttribution(sheets, registry) {
  const seen = new Map();
  for (const entry of sheets) {
    for (const source of entry.sheet?.generation?.attribution || []) {
      if (!seen.has(source.packId)) seen.set(source.packId, source);
    }
  }
  if (!seen.size && registry?.attribution) return registry.attribution([]);
  return [...seen.values()];
}

export const serializeDocument = (document) => canonicalJSON(document);

/**
 * Reconstructs a stored document. Validates the envelope only -- the sheet is
 * taken as written, because a saved sheet is a record of what was generated,
 * not a request to generate it again.
 */
export function importDocument(text) {
  let parsed;
  try {
    parsed = typeof text === 'string' ? JSON.parse(text) : text;
  } catch (error) {
    return { ok: false, error: `not valid JSON: ${error.message}` };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'document is not an object' };
  if (!parsed.schemaVersion) return { ok: false, error: 'document has no schema version' };

  // A group document holds an encounter and a list of sheets where a single
  // document holds one sheet. Both are read back as written.
  const isGroup = parsed.kind === 'encounter';
  if (!isGroup && !parsed.sheet) return { ok: false, error: 'document has no sheet' };
  if (isGroup && !parsed.encounter) return { ok: false, error: 'group document has no encounter' };

  const payload = isGroup
    ? { encounter: parsed.encounter, sheets: parsed.sheets || [] }
    : { sheet: parsed.sheet };

  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: true, document: parsed, ...payload,
      warning: `document was written for schema ${parsed.schemaVersion}; this build reads ${SCHEMA_VERSION}`,
    };
  }
  const stale = parsed.generatorVersion && parsed.generatorVersion !== GENERATOR_VERSION;
  return {
    ok: true,
    document: parsed,
    ...payload,
    ...(stale ? { warning: `generated by version ${parsed.generatorVersion}; regenerating from its spec on ${GENERATOR_VERSION} may differ` } : {}),
  };
}

export { canonicalJSON, fingerprint };
