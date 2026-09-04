// Validation primitives.
//
// The validators in this project are *independent recomputation*, not
// assertions bolted onto the generator: they take a finished sheet plus the
// registry and work the numbers out again from the recorded choices. That only
// catches anything if they never share code with the builder that produced the
// value, so everything here is deliberately generic -- collect, compare,
// resolve -- and knows nothing about characters or creatures.

/** Machine-readable codes. The UI and the test harness both key off these. */
export const CODES = {
  MISSING_FIELD: 'missing-field',
  BAD_VALUE: 'bad-value',
  MATH_MISMATCH: 'math-mismatch',
  UNRESOLVED_REF: 'unresolved-ref',
  ILLEGAL_CHOICE: 'illegal-choice',
  PREREQ_FAILED: 'prereq-failed',
  DUPLICATE: 'duplicate',
  COUNT_MISMATCH: 'count-mismatch',
  CR_POLICY: 'cr-policy',
  PROVENANCE: 'provenance-missing',
};

export class Issues {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  error(code, path, message, detail) {
    this.errors.push({ code, path, message, ...(detail ? { detail } : {}) });
    return false;
  }

  warn(code, path, message, detail) {
    this.warnings.push({ code, path, message, ...(detail ? { detail } : {}) });
    return true;
  }

  /** Assert a recomputed value matches the stored one. The workhorse. */
  expect(path, actual, expected, label) {
    if (actual === expected) return true;
    return this.error(CODES.MATH_MISMATCH, path,
      `${label || path} is ${actual}, recomputed as ${expected}`,
      { actual, expected });
  }

  require(path, value, label) {
    if (value === undefined || value === null || value === '') {
      return this.error(CODES.MISSING_FIELD, path, `${label || path} is required`);
    }
    return true;
  }

  requireArray(path, value, label, minLength = 0) {
    if (!Array.isArray(value)) {
      return this.error(CODES.MISSING_FIELD, path, `${label || path} must be an array`);
    }
    if (value.length < minLength) {
      return this.error(CODES.COUNT_MISMATCH, path,
        `${label || path} needs at least ${minLength} entr${minLength === 1 ? 'y' : 'ies'}`);
    }
    return true;
  }

  /** Every reference in a sheet must still resolve against the registry. */
  requireRef(path, ref, registry, label) {
    if (!ref || !ref.id) {
      return this.error(CODES.MISSING_FIELD, path, `${label || path} reference is missing`);
    }
    if (!registry.has(ref.id)) {
      return this.error(CODES.UNRESOLVED_REF, path,
        `${label || path} references unknown id ${ref.id}`, { id: ref.id });
    }
    if (!ref.source || !ref.source.packId || !ref.source.license) {
      return this.error(CODES.PROVENANCE, path,
        `${label || path} (${ref.id}) carries no provenance`, { id: ref.id });
    }
    return true;
  }

  get valid() { return this.errors.length === 0; }

  result() {
    return { valid: this.errors.length === 0, errors: this.errors, warnings: this.warnings };
  }
}

/** A structured failure -- returned instead of a sheet, never alongside one. */
export function failure(code, stage, seed, message, validationErrors = []) {
  return { ok: false, failure: { code, stage, seed, message, validationErrors } };
}

export const success = (sheet, extra = {}) => ({ ok: true, sheet, ...extra });
