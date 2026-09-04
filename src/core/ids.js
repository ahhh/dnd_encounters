// Stable content identity.
//
// Nothing internal ever refers to content by display name. "Chain Mail" is a
// label that may be re-worded, translated or duplicated across packs;
// `srd51:armor.chain-mail` is the thing itself. Every reference carries the
// provenance the licence requires, so a sheet can always say where each piece
// of it came from.

/** `packId:kind.slug` -- the canonical form of every internal reference. */
export function makeId(packId, kind, slug) {
  return `${packId}:${kind}.${slug}`;
}

export function parseId(id) {
  const m = /^([a-z0-9_-]+):([a-z0-9_-]+)\.(.+)$/.exec(String(id));
  if (!m) return null;
  return { packId: m[1], kind: m[2], slug: m[3] };
}

/**
 * A ContentRef is the shape stored inside a sheet: enough to render the sheet
 * without the registry, and enough to re-resolve it with one.
 */
export function contentRef(entity) {
  if (!entity) return null;
  return { id: entity.id, name: entity.name, source: entity.source };
}

/**
 * Sheets get a deterministic id so that regenerating the same spec produces
 * the same document identity, not merely the same contents.
 */
export function sheetId(kind, seed, discriminator = '') {
  let h = 2166136261 >>> 0;
  const key = `${kind}|${seed}|${discriminator}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${kind}-${h.toString(36).padStart(7, '0')}`;
}

/**
 * Canonical JSON. Object keys are emitted in sorted order at every depth so
 * that "same seed produces identical JSON" is a claim about bytes, not about
 * whatever order a given engine happened to build the objects in.
 */
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue;
    out[key] = canonicalize(value[key]);
  }
  return out;
}

export const canonicalJSON = (value, indent = 2) =>
  JSON.stringify(canonicalize(value), null, indent);

/** Stable fingerprint of a canonical document, for regression fixtures. */
export function fingerprint(value) {
  const text = canonicalJSON(value, 0);
  let h1 = 2166136261 >>> 0;
  let h2 = 0x9e3779b9 >>> 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
}
