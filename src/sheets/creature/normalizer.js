// Existing creature normalisation.
//
// This is the enemy path implemented first, and the one that should stay the
// most trustworthy: it takes a real stat block from the enabled content and
// reshapes it into the canonical CreatureSheet *without changing a single
// mechanical value*. Nothing here rounds, rebalances, or nudges toward a
// requested CR. If the caller asked for CR 3 and the best match is CR 2, they
// get a correct CR 2 creature and a note saying so.

import { contentRef, sheetId } from '../../core/ids.js';
import { abilityModifier, ABILITIES } from '../../rules/srd51/abilities.js';
import { formatCR, parseCR, proficiencyBonusForCR, xpForCR } from '../../rules/srd51/proficiency.js';
import { damageAverage } from '../../rules/srd51/combat.js';

/** Resolves a language entry, which may be a content id or literal text. */
function normalizeLanguage(entry, registry) {
  const entity = registry.get(entry);
  if (entity) return contentRef(entity);
  return { id: null, name: entry, source: null, literal: true };
}

/** Fills in the derived fields on an action without altering its values. */
function normalizeAction(action, registry) {
  const damage = (action.damage || []).map((d) => ({
    ...d,
    average: d.average ?? damageAverage(d),
    display: d.dice ? `${d.dice}${d.bonus ? ` + ${d.bonus}` : ''} ${d.type}` : `${d.bonus} ${d.type}`,
  }));
  return {
    ...action,
    damage,
    totalAverage: damage.reduce((sum, d) => sum + d.average, 0),
    effects: action.effects || [],
    ...(action.source ? { source: action.source } : {}),
  };
}

/**
 * Produces a CreatureSheet from a monster entity. `notes` records anything the
 * caller should know about how their request was satisfied.
 */
export function normalizeCreature({ monster, registry, seed, spec, notes = [], identity = null, personality = null }) {
  const cr = formatCR(parseCR(monster.cr));
  const pb = proficiencyBonusForCR(cr);
  const mods = {};
  for (const a of ABILITIES) mods[a] = abilityModifier(monster.abilityScores[a]);

  const skills = (monster.skills || []).map((s) => {
    const entity = registry.get(s.skill);
    return {
      id: s.skill,
      name: entity?.name || s.skill,
      ability: entity?.ability || null,
      modifier: s.bonus,
      source: entity?.source || null,
    };
  });

  const senses = (monster.senses || []).map((s) => ({ ...s }));
  const perception = skills.find((s) => s.id === 'srd51:skill.perception');
  senses.push({
    type: 'passive Perception',
    value: 10 + (perception ? perception.modifier : mods.wis),
    source: 'derived',
  });

  const actions = (monster.actions || []).map((a) => normalizeAction(a, registry));
  const spellcasting = monster.spellcasting ? {
    ...monster.spellcasting,
    groups: monster.spellcasting.groups.map((group) => ({
      ...group,
      spells: group.spells.map((id) => {
        const spell = registry.get(id);
        return spell
          ? { ...contentRef(spell), level: spell.level, school: spell.school, description: spell.description }
          : { id, name: id, source: null, unresolved: true };
      }),
    })),
  } : null;

  return {
    id: sheetId('enemy', seed, monster.slug),
    kind: 'creature',
    seed,
    identity: identity || {
      name: monster.name,
      title: null,
      anonymous: true,
      appearance: null,
    },

    sourceMode: 'existing',
    baseCreature: contentRef(monster),

    size: monster.size,
    creatureType: monster.creatureType,
    alignment: monster.alignment,

    challengeRating: cr,
    xp: xpForCR(cr),
    proficiencyBonus: pb,

    abilityScores: { ...monster.abilityScores },
    abilityModifiers: mods,

    armorClass: { total: monster.armorClass.value, source: monster.armorClass.source },
    hitPoints: {
      average: monster.hitPoints.average,
      formula: monster.hitPoints.formula,
      max: monster.hitPoints.average,
      current: monster.hitPoints.average,
    },
    movement: (monster.speed || []).map((s) => ({ ...s })),

    savingThrows: (monster.savingThrows || []).map((s) => ({ ...s })),
    skills,

    vulnerabilities: monster.vulnerabilities || [],
    resistances: monster.resistances || [],
    immunities: monster.immunities || [],
    conditionImmunities: monster.conditionImmunities || [],

    senses,
    languages: (monster.languages || []).map((l) => normalizeLanguage(l, registry)),

    traits: (monster.traits || []).map((t) => ({ ...t, source: contentRef(monster) })),
    actions,
    bonusActions: (monster.bonusActions || []).map((a) => normalizeAction(a, registry)),
    reactions: (monster.reactions || []).map((a) => normalizeAction(a, registry)),
    legendaryActions: (monster.legendaryActions || []).map((a) => normalizeAction(a, registry)),
    ...(spellcasting ? { spellcasting } : {}),

    tacticalRole: monster.tacticalRole || 'skirmisher',
    families: monster.families || [],
    environments: monster.environments || [],
    ...(personality ? { personality } : {}),

    generation: { notes },
  };
}

/**
 * Scores a creature against the request. Distance from the target CR dominates,
 * because a wrong-CR match is a worse answer than a slightly-off environment.
 */
export function scoreCreature(monster, spec) {
  let score = 1;
  if (spec.targetCR !== null) {
    const distance = Math.abs(parseCR(monster.cr) - parseCR(spec.targetCR));
    if (distance === 0) score += 12;
    else if (distance <= 0.5) score += 6;
    else if (distance <= 1) score += 3;
    else if (distance <= 2) score += 1;
    else return 0.05; // legal, but a poor answer to the question asked
  }
  if (spec.environment && (monster.environments || []).includes(spec.environment)) score += 5;
  if (spec.family && (monster.families || []).includes(spec.family)) score += 5;
  if (spec.role && monster.tacticalRole === spec.role) score += 4;
  if (spec.theme) {
    const theme = spec.theme.toLowerCase();
    if ((monster.environments || []).some((e) => theme.includes(e))) score += 3;
    if ((monster.families || []).some((f) => theme.includes(f))) score += 3;
    if (monster.name.toLowerCase().split(/\s+/).some((w) => theme.includes(w))) score += 4;
  }
  return score;
}

export { formatCR, parseCR };
