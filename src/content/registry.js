// Content registry.
//
// Loads packs, stamps provenance, indexes by stable id, and validates the whole
// corpus. Generation only ever sees the registry -- it never imports a pack
// file directly -- which is what makes "enabled content packs" a real switch
// rather than a label.

import { makeId, parseId } from '../core/ids.js';
import { CODES, Issues } from '../core/validation.js';
import { SCHEMAS, referencesOf } from './schema.js';

/**
 * Declares a pack. Entries are authored as `{slug, name, ...}`; this adds the
 * id, the kind and the ContentSource every entity is required to carry.
 */
export function definePack(manifest, groups) {
  const entries = [];
  for (const [kind, list] of Object.entries(groups)) {
    for (const raw of list) {
      const slug = raw.slug;
      entries.push({
        ...raw,
        kind,
        id: makeId(manifest.id, kind, slug),
        source: {
          packId: manifest.id,
          sourceId: raw.sourceId || slug,
          version: manifest.version,
          license: manifest.license,
        },
      });
    }
  }
  return { manifest, entries };
}

export class Registry {
  constructor() {
    this.byId = new Map();
    this.byKind = new Map();
    this.packs = [];
  }

  add(pack) {
    this.packs.push(pack.manifest);
    for (const entry of pack.entries) {
      this.byId.set(entry.id, entry);
      if (!this.byKind.has(entry.kind)) this.byKind.set(entry.kind, []);
      this.byKind.get(entry.kind).push(entry);
    }
    return this;
  }

  has(id) { return this.byId.has(id); }
  get(id) { return this.byId.get(id) || null; }

  /** Throws rather than returning null -- for lookups a builder cannot survive. */
  need(id) {
    const entry = this.byId.get(id);
    if (!entry) throw new Error(`unresolved content reference: ${id}`);
    return entry;
  }

  all(kind) { return this.byKind.get(kind) || []; }

  find(kind, predicate) { return this.all(kind).filter(predicate); }

  /** Resolves a list of ids, skipping any that are missing. */
  resolveAll(ids) { return (ids || []).map((id) => this.get(id)).filter(Boolean); }

  // Named accessors the build plan calls for.
  getSpecies(id) { return this.get(id); }
  getClass(id) { return this.get(id); }
  getBackground(id) { return this.get(id); }
  getSpell(id) { return this.get(id); }
  getEquipment(id) { return this.get(id); }
  getMonster(id) { return this.get(id); }

  findSpells(filter = {}) {
    return this.all('spell').filter((s) => {
      if (filter.classId && !s.classes.includes(shortSlug(filter.classId))) return false;
      if (filter.level !== undefined && s.level !== filter.level) return false;
      if (filter.maxLevel !== undefined && s.level > filter.maxLevel) return false;
      if (filter.minLevel !== undefined && s.level < filter.minLevel) return false;
      if (filter.tag && !s.tags.includes(filter.tag)) return false;
      if (filter.school && s.school !== filter.school) return false;
      return true;
    });
  }

  findMonsters(filter = {}) {
    return this.all('monster').filter((m) => {
      if (filter.creatureType && m.creatureType !== filter.creatureType) return false;
      if (filter.family && !(m.families || []).includes(filter.family)) return false;
      if (filter.environment && !(m.environments || []).includes(filter.environment)) return false;
      if (filter.role && m.tacticalRole !== filter.role) return false;
      if (filter.spellcaster !== undefined && Boolean(m.spellcasting) !== filter.spellcaster) return false;
      if (filter.flying !== undefined) {
        const flies = (m.speed || []).some((s) => s.type === 'fly');
        if (flies !== filter.flying) return false;
      }
      if (filter.ranged !== undefined) {
        const ranged = (m.actions || []).some((a) => a.attack && a.attack.range);
        if (ranged !== filter.ranged) return false;
      }
      return true;
    });
  }

  /** Attribution lines for every pack that contributed to a sheet. */
  attribution(ids) {
    const packIds = new Set();
    for (const id of ids) {
      const parsed = parseId(id);
      if (parsed) packIds.add(parsed.packId);
    }
    return this.packs
      .filter((p) => packIds.has(p.id))
      .map((p) => ({ packId: p.id, name: p.name, version: p.version, license: p.license, notice: p.attribution }));
  }

  /**
   * Full corpus validation: schema conformance, duplicate ids, provenance, and
   * every declared cross-reference. Runs without generating anything.
   */
  validate() {
    const issues = new Issues();
    const seen = new Set();
    for (const entry of this.byId.values()) {
      const path = entry.id;
      if (seen.has(entry.id)) issues.error(CODES.DUPLICATE, path, `duplicate id ${entry.id}`);
      seen.add(entry.id);

      if (!entry.source || !entry.source.packId || !entry.source.license || !entry.source.version) {
        issues.error(CODES.PROVENANCE, path, `${entry.id} has incomplete provenance`);
      }
      const schema = SCHEMAS[entry.kind];
      if (!schema) {
        issues.warn(CODES.BAD_VALUE, path, `no schema registered for kind "${entry.kind}"`);
        continue;
      }
      for (const [field, check] of Object.entries(schema)) {
        if (!check(entry[field])) {
          issues.error(CODES.BAD_VALUE, `${path}.${field}`,
            `${entry.id}: field "${field}" fails schema`);
        }
      }
      for (const ref of referencesOf(entry)) {
        if (!this.has(ref.id)) {
          issues.error(CODES.UNRESOLVED_REF, `${path}.${ref.path}`,
            `${entry.id} references missing ${ref.kind} ${ref.id}`);
        }
      }
    }
    return issues.result();
  }
}

/** `srd51:class.wizard` -> `wizard`. Spell class lists are stored unqualified. */
export const shortSlug = (id) => (parseId(id)?.slug ?? String(id));

export function createRegistry(packs) {
  const registry = new Registry();
  for (const pack of packs) registry.add(pack);
  return registry;
}
