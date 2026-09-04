// Spellcasting.
//
// Spell selection is a constraint problem, not a random draw. The legal pool is
// the class list filtered to levels the character can actually cast; within
// that pool spells are scored by how well their tags match the build's spell
// profile, and picked with a weighted sample so that two wizards of the same
// role are similar without being identical.
//
// Counts come from the class progression table, never from a guess, and the
// save DC and attack bonus are computed from the casting ability -- the
// validator recomputes both.

import { spellAttackBonus, spellSaveDC } from '../../rules/srd51/combat.js';
import { modifiersOfType } from './class-builder.js';
import { shortSlug } from '../../content/registry.js';

/** Tag weights per spell profile. Missing tags fall back to 1. */
const PROFILE_WEIGHTS = {
  damage: { damage: 6, control: 3, defense: 2, mobility: 1.5, utility: 1 },
  control: { control: 6, damage: 3, defense: 2, mobility: 1.5, utility: 1 },
  healing: { healing: 7, support: 4, defense: 3, control: 2, damage: 1 },
  support: { support: 6, healing: 4, control: 3, social: 2.5, defense: 2, damage: 1 },
  divine: { healing: 5, damage: 3.5, support: 3, defense: 3, control: 2 },
  null: { damage: 3, control: 3, healing: 2, support: 2, defense: 2, utility: 1.5, mobility: 1.5, social: 1.5 },
};

const weightFor = (spell, profile) => {
  const table = PROFILE_WEIGHTS[profile] || PROFILE_WEIGHTS.null;
  let w = 0.5;
  for (const tag of spell.tags) w += table[tag] || 0.5;
  // Slightly favour the highest levels the character can cast; a level-9
  // character who knows only 1st-level spells is legal but nobody wants it.
  return w * (1 + spell.level * 0.12);
};

/**
 * The legal pool: the class list, plus anything a feature explicitly adds
 * (a warlock patron's expanded list), capped at the highest castable level.
 */
export function legalSpellPool({ registry, progression, features, maxLevel }) {
  const listSlug = progression.listSlug;
  const pool = new Map();
  for (const spell of registry.findSpells({ classId: listSlug, maxLevel, minLevel: 1 })) {
    pool.set(spell.id, spell);
  }
  for (const mod of modifiersOfType(features, 'expanded-list')) {
    for (const id of mod.spells) {
      const spell = registry.get(id);
      if (spell && spell.level <= maxLevel) pool.set(spell.id, spell);
    }
  }
  return [...pool.values()];
}

/** Spells a feature makes always-prepared; they never count against the limit. */
export function alwaysPreparedSpells({ registry, features, maxLevel }) {
  const out = [];
  for (const mod of modifiersOfType(features, 'domain-spells')) {
    for (const id of mod.spells) {
      const spell = registry.get(id);
      if (spell && spell.level <= maxLevel) out.push(spell);
    }
  }
  return out;
}

/**
 * Builds the whole spellcasting record. Returns null for classes that do not
 * cast, and for half-casters below their starting level.
 */
export function buildSpellcasting({
  registry, cls, progression, features, mods, proficiencyBonus, level, plan, stream, species,
}) {
  if (!progression) return null;

  const ability = progression.ability;
  const abilityMod = mods[ability];
  const saveDC = spellSaveDC(abilityMod, proficiencyBonus);
  const attackBonus = spellAttackBonus(abilityMod, proficiencyBonus);
  const maxLevel = progression.slots.length
    ? Math.max(...progression.slots.map((s) => s.level))
    : 0;

  const profile = plan.spellProfile;
  const pool = legalSpellPool({ registry, progression, features, maxLevel });
  const alwaysPrepared = alwaysPreparedSpells({ registry, features, maxLevel });
  const alwaysIds = new Set(alwaysPrepared.map((s) => s.id));

  // --- cantrips ---------------------------------------------------------------
  const cantripPool = registry.findSpells({ classId: progression.listSlug, level: 0 });
  const cantrips = [];
  if (progression.cantripsKnown > 0 && cantripPool.length) {
    // Guarantee one attack cantrip so a caster is never left with no action.
    const damaging = cantripPool.filter((s) => s.tags.includes('damage'));
    if (damaging.length) cantrips.push(stream.weighted(damaging, (s) => weightFor(s, profile)));
    const rest = cantripPool.filter((s) => !cantrips.some((c) => c.id === s.id));
    cantrips.push(...stream.sampleWeighted(rest, progression.cantripsKnown - cantrips.length,
      (s) => weightFor(s, profile)));
  }

  // A species may grant a cantrip from a different class list entirely.
  const bonusCantrips = [];
  for (const trait of species.traits || []) {
    for (const mod of (trait.modifiers || []).filter((m) => m.type === 'bonus-cantrip')) {
      const extra = registry.findSpells({ classId: mod.classSlug, level: 0 })
        .filter((s) => !cantrips.some((c) => c.id === s.id));
      if (!extra.length) continue;
      const picked = stream.weighted(extra, (s) => weightFor(s, profile));
      bonusCantrips.push({ spell: picked, ability: mod.ability, source: `${species.name}: ${trait.name}` });
    }
  }
  for (const mod of modifiersOfType(features, 'bonus-cantrip')) {
    const extra = registry.findSpells({ classId: mod.classSlug, level: 0 })
      .filter((s) => !cantrips.some((c) => c.id === s.id) && !bonusCantrips.some((b) => b.spell.id === s.id));
    if (!extra.length) continue;
    cantrips.push(stream.weighted(extra, (s) => weightFor(s, profile)));
  }

  // --- levelled spells ---------------------------------------------------------
  const count = progression.spellsKnown ?? progression.spellsPrepared ?? 0;
  const selectable = pool.filter((s) => !alwaysIds.has(s.id));
  const selected = spreadAcrossLevels({
    pool: selectable, count, maxLevel, profile, stream,
  });

  const record = {
    ability,
    abilityModifier: abilityMod,
    spellAttackBonus: attackBonus,
    spellSaveDC: saveDC,
    slots: progression.slots.map((s) => ({ ...s, expended: 0 })),
    cantrips: cantrips.map(ref),
    ...(bonusCantrips.length ? {
      bonusCantrips: bonusCantrips.map((b) => ({ ...ref(b.spell), castingAbility: b.ability, grantedBy: b.source })),
    } : {}),
    prepares: progression.prepares,
    ritualCasting: progression.ritual,
    calculation: {
      saveDC: {
        total: saveDC,
        parts: [{ label: 'base', value: 8, base: true }, { label: abilityName(ability), value: abilityMod }, { label: 'proficiency bonus', value: proficiencyBonus }],
      },
      attackBonus: {
        total: attackBonus,
        parts: [{ label: abilityName(ability), value: abilityMod }, { label: 'proficiency bonus', value: proficiencyBonus }],
      },
    },
  };

  if (progression.prepares) {
    record.preparedSpells = selected.map(ref);
    record.preparedLimit = count;
    if (alwaysPrepared.length) {
      record.alwaysPrepared = alwaysPrepared.map(ref);
    }
  } else {
    record.knownSpells = selected.map(ref);
    record.knownLimit = count;
  }

  // A wizard's spellbook holds more than they prepare: 6 at 1st level, 2 per
  // level after, plus everything currently prepared.
  if (progression.spellbook) {
    const bookSize = 6 + (level - 1) * 2;
    const bookExtras = stream.sampleWeighted(
      pool.filter((s) => !selected.some((p) => p.id === s.id)),
      Math.max(0, bookSize - selected.length),
      (s) => weightFor(s, profile),
    );
    record.spellbook = [...selected, ...bookExtras].map(ref);
    record.spellbookSize = bookSize;
  }

  // Innate species spells keep their own casting ability and uses.
  const innate = [];
  for (const trait of species.traits || []) {
    for (const mod of (trait.modifiers || []).filter((m) => m.type === 'innate-spells')) {
      for (const grant of mod.grants) {
        if (level < grant.minLevel) continue;
        const spell = registry.get(grant.spellId);
        if (!spell) continue;
        innate.push({
          ...ref(spell), ability: mod.ability,
          uses: grant.atWill ? 'at will' : `${grant.uses}/long rest`,
          ...(grant.castAtLevel ? { castAtLevel: grant.castAtLevel } : {}),
          grantedBy: `${species.name}: ${trait.name}`,
        });
      }
    }
  }
  if (innate.length) record.innateSpells = innate;

  // Warlock arcana: one spell of each level 6-9, cast once per long rest.
  const arcana = [];
  for (const mod of modifiersOfType(features, 'mystic-arcanum')) {
    const options = registry.findSpells({ classId: progression.listSlug, level: mod.spellLevel })
      .filter((s) => !arcana.some((a) => a.id === s.id));
    if (!options.length) continue;
    const picked = stream.weighted(options, (s) => weightFor(s, profile));
    arcana.push({ ...ref(picked), uses: '1/long rest', level: mod.spellLevel });
  }
  if (arcana.length) record.mysticArcanum = arcana;

  return record;
}

/**
 * Distributes picks across spell levels rather than letting the weighting pull
 * everything to the top. Roughly a third of a caster's list should be the
 * cheap spells they can afford to cast repeatedly.
 */
function spreadAcrossLevels({ pool, count, maxLevel, profile, stream }) {
  if (count <= 0 || !pool.length) return [];
  const byLevel = new Map();
  for (const spell of pool) {
    if (!byLevel.has(spell.level)) byLevel.set(spell.level, []);
    byLevel.get(spell.level).push(spell);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);

  // Target counts: heavier at low levels, thinning toward the top.
  const targets = new Map();
  let remaining = count;
  for (let i = levels.length - 1; i >= 0; i--) {
    const level = levels[i];
    const share = level === 1 ? 0.35 : level <= 2 ? 0.22 : 0.14;
    const want = Math.max(1, Math.round(count * share));
    targets.set(level, want);
  }

  const picked = [];
  for (const level of levels) {
    if (remaining <= 0) break;
    const want = Math.min(targets.get(level), remaining, byLevel.get(level).length);
    const chosen = stream.sampleWeighted(byLevel.get(level), want, (s) => weightFor(s, profile));
    picked.push(...chosen);
    remaining -= chosen.length;
  }
  // Top up from anything left if the level targets underfilled.
  if (remaining > 0) {
    const rest = pool.filter((s) => !picked.some((p) => p.id === s.id));
    picked.push(...stream.sampleWeighted(rest, remaining, (s) => weightFor(s, profile)));
  }
  return picked.slice(0, count).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

const ref = (spell) => ({
  id: spell.id, name: spell.name, source: spell.source,
  level: spell.level, school: spell.school, tags: spell.tags,
  castingTime: spell.castingTime, range: spell.range, duration: spell.duration,
  components: spell.components, concentration: spell.concentration, ritual: spell.ritual,
  description: spell.description,
});

const abilityName = (a) => ({
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
}[a]);

export { shortSlug, weightFor };
