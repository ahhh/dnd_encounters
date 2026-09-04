// Content schemas.
//
// Pack files are authored as plain objects without boilerplate; the loader
// stamps identity and provenance onto every entry, and this module says what
// each kind must contain afterwards. Schema validation runs independently of
// generation (`tools/verify.mjs content`) so a malformed pack is caught before
// any sheet is built on top of it.

export const KINDS = [
  'species', 'class', 'background', 'skill', 'language', 'feat',
  'spell', 'weapon', 'armor', 'gear', 'monster', 'creature-feature',
  'npc-archetype', 'name-table', 'personality-table',
];

const str = (v) => typeof v === 'string' && v.length > 0;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const arr = (v) => Array.isArray(v);
const opt = (check) => (v) => v === undefined || check(v);

/**
 * Per-kind field checks. Anything not listed is free-form: schemas here exist
 * to catch authoring mistakes that would produce a broken sheet, not to
 * re-specify the rules.
 */
export const SCHEMAS = {
  species: {
    name: str, size: str, speed: num,
    abilityAdjustments: arr, traits: arr, languages: arr,
  },
  class: {
    name: str, hitDie: num, savingThrows: arr,
    armorProficiencies: arr, weaponProficiencies: arr,
    // `from` is a list of skill ids, or the literal 'any' for classes that
    // choose from the full skill list (the bard).
    skillChoices: (v) => v && num(v.count) && (arr(v.from) || v.from === 'any'),
    features: arr,
  },
  background: { name: str, skills: arr, equipment: arr },
  skill: { name: str, ability: str },
  language: { name: str },
  feat: { name: str, description: str },
  spell: {
    name: str, level: num, school: str, castingTime: str, range: str,
    duration: str, classes: arr, tags: arr,
  },
  weapon: {
    name: str, category: str, damage: str, damageType: str,
    properties: arr, proficiency: str, cost: num, weight: num,
  },
  armor: { name: str, armorType: str, baseAC: num, cost: num, weight: num },
  gear: { name: str, cost: num, weight: num },
  monster: {
    name: str, size: str, creatureType: str, cr: (v) => str(v) || num(v),
    armorClass: (v) => v && num(v.value), hitPoints: (v) => v && num(v.average) && str(v.formula),
    abilityScores: (v) => v && num(v.str), speed: arr, actions: arr,
  },
  'creature-feature': { name: str, description: str },
  'npc-archetype': { name: str, role: str },
  'name-table': { name: str, entries: arr },
  'personality-table': { name: str, entries: arr },
};

/** Cross-references a pack entry declares, as [path, expectedKind, ids]. */
export function referencesOf(entry) {
  const refs = [];
  const push = (path, kind, ids) => {
    for (const id of ids || []) if (typeof id === 'string') refs.push({ path, kind, id });
  };
  switch (entry.kind) {
    case 'species':
      push('languages', 'language', entry.languages);
      break;
    case 'class':
      if (Array.isArray(entry.skillChoices?.from)) {
        push('skillChoices.from', 'skill', entry.skillChoices.from);
      }
      push('spellList', 'spell', entry.spellList);
      break;
    case 'background':
      push('skills', 'skill', entry.skills);
      push('languages', 'language', entry.languages);
      break;
    case 'monster':
      push('spellcasting.spells', 'spell',
        (entry.spellcasting?.groups || []).flatMap((g) => g.spells || []));
      break;
    default: break;
  }
  return refs;
}

export { opt, str, num, arr };
