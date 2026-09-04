// Level-indexed progression tables shared by several classes.
//
// These are the tables a class points at rather than restating. A class says
// "I am a full caster"; the slot row for level 7 is looked up here. Keeping one
// copy means a wizard and a cleric can never disagree about how many 4th-level
// slots a 7th-level character has.

export const MAX_LEVEL = 20;

/** Full casters: bard, cleric, druid, sorcerer, wizard. Index = level. */
export const FULL_CASTER_SLOTS = [
  null,
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2],
  [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Half casters: paladin, ranger. Spellcasting begins at level 2. */
export const HALF_CASTER_SLOTS = [
  null,
  [], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
  [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2],
  [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2],
];

/** Third casters: Eldritch Knight, Arcane Trickster. Begins at level 3. */
export const THIRD_CASTER_SLOTS = [
  null,
  [], [], [2], [3], [3], [3], [4, 2], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3],
  [4, 3, 2], [4, 3, 2], [4, 3, 2], [4, 3, 3], [4, 3, 3], [4, 3, 3],
  [4, 3, 3, 1], [4, 3, 3, 1],
];

/**
 * Warlock pact magic is not a slot table in the same sense: every slot is the
 * same level and they return on a short rest, so it is modelled as
 * {count, level} rather than an array indexed by spell level.
 */
export const PACT_MAGIC = [
  null,
  { count: 1, level: 1 }, { count: 2, level: 1 }, { count: 2, level: 2 },
  { count: 2, level: 2 }, { count: 2, level: 3 }, { count: 2, level: 3 },
  { count: 2, level: 4 }, { count: 2, level: 4 }, { count: 2, level: 5 },
  { count: 2, level: 5 }, { count: 3, level: 5 }, { count: 3, level: 5 },
  { count: 3, level: 5 }, { count: 3, level: 5 }, { count: 3, level: 5 },
  { count: 3, level: 5 }, { count: 4, level: 5 }, { count: 4, level: 5 },
  { count: 4, level: 5 }, { count: 4, level: 5 },
];

export const CASTER_TABLES = {
  full: FULL_CASTER_SLOTS,
  half: HALF_CASTER_SLOTS,
  third: THIRD_CASTER_SLOTS,
};

/** Slots as [{level, total}], omitting levels with none. */
export function spellSlots(progression, level) {
  if (progression === 'pact') {
    const row = PACT_MAGIC[Math.min(level, MAX_LEVEL)];
    return row ? [{ level: row.level, total: row.count, pact: true }] : [];
  }
  const table = CASTER_TABLES[progression];
  if (!table) return [];
  const row = table[Math.min(level, MAX_LEVEL)] || [];
  return row.map((total, i) => ({ level: i + 1, total })).filter((s) => s.total > 0);
}

/** Highest spell level the character can cast at all. */
export function maxSpellLevel(progression, level) {
  const slots = spellSlots(progression, level);
  return slots.length ? Math.max(...slots.map((s) => s.level)) : 0;
}

/** Average hit die roll, rounded up -- the fixed-HP option. */
export const averageHitDie = (die) => Math.floor(die / 2) + 1;

/** Levels at which nearly every class grants an Ability Score Improvement. */
export const STANDARD_ASI_LEVELS = [4, 8, 12, 16, 19];
