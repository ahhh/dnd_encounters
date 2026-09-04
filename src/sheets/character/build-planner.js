// Build planner.
//
// The rule this file exists to enforce: *do not select each choice
// independently*. A character built by rolling species, then rolling class,
// then rolling abilities produces a Strength-16 wizard holding a longbow. So
// the role is resolved first into a plan -- which abilities matter, which
// skills, what the character fights with -- and every later stage scores its
// legal options against that plan.
//
// Scores never decide legality. A score of zero means "never pick this unless
// nothing else is legal"; the pools themselves are filtered by the rules.

import { ABILITIES } from '../../rules/srd51/abilities.js';

/**
 * Role definitions. `abilities` is a priority order, `classTags` biases class
 * selection, and `combatStyle` is what the equipment builder reads.
 */
export const ROLE_PLANS = {
  warrior: {
    abilities: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
    skills: ['athletics', 'perception', 'intimidation', 'survival'],
    classTags: { martial: 3, melee: 2, warrior: 3, guardian: 1 },
    combatStyle: 'melee-heavy', equipmentProfile: 'heavy-martial',
  },
  brute: {
    abilities: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
    skills: ['athletics', 'intimidation', 'survival', 'perception'],
    classTags: { brute: 4, martial: 3, melee: 2, unarmored: 1 },
    combatStyle: 'melee-heavy', equipmentProfile: 'two-handed',
  },
  guardian: {
    abilities: ['str', 'con', 'wis', 'cha', 'dex', 'int'],
    skills: ['athletics', 'perception', 'insight', 'religion'],
    classTags: { guardian: 4, martial: 3, melee: 2, healer: 1 },
    combatStyle: 'melee-defensive', equipmentProfile: 'sword-and-board',
  },
  scout: {
    abilities: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
    skills: ['stealth', 'survival', 'perception', 'nature', 'investigation'],
    classTags: { scout: 4, ranged: 2, skirmisher: 2, martial: 1, nature: 1 },
    combatStyle: 'ranged-skirmish', equipmentProfile: 'light-ranged',
  },
  archer: {
    abilities: ['dex', 'con', 'wis', 'str', 'int', 'cha'],
    skills: ['perception', 'stealth', 'survival', 'acrobatics'],
    classTags: { archer: 4, ranged: 3, martial: 2, scout: 1 },
    combatStyle: 'ranged', equipmentProfile: 'light-ranged',
  },
  expert: {
    abilities: ['dex', 'int', 'wis', 'cha', 'con', 'str'],
    skills: ['stealth', 'investigation', 'sleight-of-hand', 'perception', 'acrobatics'],
    classTags: { expert: 4, skirmisher: 2, skills: 2, ambusher: 2 },
    combatStyle: 'finesse-skirmish', equipmentProfile: 'light-finesse',
  },
  face: {
    abilities: ['cha', 'dex', 'wis', 'con', 'int', 'str'],
    skills: ['persuasion', 'deception', 'insight', 'performance', 'intimidation'],
    classTags: { face: 4, caster: 2, skills: 2, support: 1 },
    combatStyle: 'finesse-skirmish', equipmentProfile: 'light-finesse',
  },
  healer: {
    abilities: ['wis', 'con', 'cha', 'dex', 'int', 'str'],
    skills: ['medicine', 'insight', 'religion', 'perception', 'nature'],
    classTags: { healer: 4, caster: 3, support: 2, divine_caster: 2 },
    combatStyle: 'support', equipmentProfile: 'caster-armored', spellProfile: 'healing',
  },
  support: {
    abilities: ['cha', 'wis', 'con', 'dex', 'int', 'str'],
    skills: ['persuasion', 'insight', 'performance', 'history', 'medicine'],
    classTags: { support: 4, caster: 3, face: 2, healer: 1 },
    combatStyle: 'support', equipmentProfile: 'caster-light', spellProfile: 'support',
  },
  controller: {
    abilities: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
    skills: ['arcana', 'investigation', 'history', 'nature', 'perception'],
    classTags: { controller: 4, caster: 3, arcane_caster: 2, artillery: 1 },
    combatStyle: 'ranged', equipmentProfile: 'caster-light', spellProfile: 'control',
  },
  'arcane-caster': {
    abilities: ['int', 'dex', 'con', 'wis', 'cha', 'str'],
    skills: ['arcana', 'investigation', 'history', 'insight'],
    classTags: { arcane_caster: 5, caster: 3, artillery: 2, controller: 1 },
    combatStyle: 'ranged', equipmentProfile: 'caster-light', spellProfile: 'damage',
  },
  'divine-caster': {
    abilities: ['wis', 'con', 'cha', 'str', 'dex', 'int'],
    skills: ['religion', 'insight', 'medicine', 'persuasion'],
    classTags: { divine_caster: 5, caster: 3, healer: 2, support: 1 },
    combatStyle: 'melee-defensive', equipmentProfile: 'caster-armored', spellProfile: 'divine',
  },
};

/** Themes nudge selection without ever making an illegal option legal. */
const THEME_HINTS = [
  { match: /forest|wood|wild|ranger|guide|hunt/i, skills: ['survival', 'nature', 'stealth', 'animal-handling'], classes: ['ranger', 'druid', 'barbarian'], backgrounds: ['wilderness-guide'] },
  { match: /city|urban|street|thief|gang|dock/i, skills: ['stealth', 'sleight-of-hand', 'deception', 'perception'], classes: ['rogue', 'bard'], backgrounds: ['street-runner', 'dockhand'] },
  { match: /temple|priest|faith|church|holy|divine/i, skills: ['religion', 'medicine', 'insight'], classes: ['cleric', 'paladin'], backgrounds: ['acolyte', 'temple-almoner'] },
  { match: /crypt|grave|undead|tomb|bone/i, skills: ['religion', 'investigation', 'perception'], classes: ['cleric', 'wizard', 'warlock'], backgrounds: ['grave-tender'] },
  { match: /scholar|library|arcane|academy|sage|tower/i, skills: ['arcana', 'history', 'investigation'], classes: ['wizard', 'bard'], backgrounds: ['cloister-scholar'] },
  { match: /soldier|army|watch|guard|garrison|militia/i, skills: ['athletics', 'perception', 'intimidation'], classes: ['fighter', 'paladin'], backgrounds: ['watch-veteran', 'caravan-guard'] },
  { match: /court|noble|diplomat|envoy|merchant/i, skills: ['persuasion', 'insight', 'history'], classes: ['bard', 'warlock'], backgrounds: ['court-attendant'] },
  { match: /sea|coast|ship|pirate|harbour|harbor/i, skills: ['athletics', 'perception', 'survival'], classes: ['fighter', 'rogue'], backgrounds: ['dockhand'] },
  { match: /monk|monastery|discipline|ascetic/i, skills: ['acrobatics', 'insight', 'religion'], classes: ['monk'], backgrounds: [] },
];

const themeHint = (theme) => THEME_HINTS.find((h) => theme && h.match.test(theme)) || null;

/**
 * Builds the plan. The role may be "random", in which case one is chosen from
 * a stream -- but it is chosen *once*, before anything mechanical, so the rest
 * of the build still hangs together.
 */
export function planBuild(spec, streams, registry) {
  const roleStream = streams('npc:class');
  const role = spec.role === 'random'
    ? roleStream.choice(Object.keys(ROLE_PLANS))
    : spec.role;
  const base = ROLE_PLANS[role];
  const hint = themeHint(spec.theme);

  // Constraints can override the role's natural leaning. A ranged-preferred
  // guardian is unusual but legal, and the spec wins.
  let combatStyle = base.combatStyle;
  if (spec.constraints.rangedPreferred) combatStyle = 'ranged';
  else if (spec.constraints.meleePreferred && combatStyle.startsWith('ranged')) combatStyle = 'melee-heavy';

  const preferredSkills = dedupe([
    ...(spec.constraints.requiredSkills || []).map(shortSkill),
    ...(hint?.skills || []),
    ...base.skills,
  ]);

  return {
    role,
    level: spec.level,
    preferredAbilities: base.abilities.slice(),
    preferredSkills,
    combatStyle,
    equipmentProfile: base.equipmentProfile,
    spellProfile: base.spellProfile || null,
    classTags: base.classTags,
    themeClasses: hint?.classes || [],
    themeBackgrounds: hint?.backgrounds || [],
    wantsSpellcasting: spec.constraints.spellcaster,
    requiredLanguages: spec.constraints.requiredLanguages || [],
  };
}

// --- candidate scoring --------------------------------------------------------

/**
 * Scores a class against the plan. Returns 0 for classes the spec forbids, so
 * they become unreachable rather than merely unlikely.
 */
export function scoreClass(cls, plan, spec) {
  if (spec.constraints.spellcaster === true && !cls.spellcasting) return 0;
  if (spec.constraints.spellcaster === false && cls.spellcasting) return 0;
  // Half-casters have no spells at level 1; asking for a spellcaster and being
  // handed a level-1 paladin would satisfy the letter and not the intent.
  if (spec.constraints.spellcaster === true && cls.spellcasting?.startLevel > spec.level) return 0;

  let score = 1;
  for (const tag of cls.tags || []) {
    score += (plan.classTags[tag] || plan.classTags[tag.replace(/-/g, '_')] || 0);
  }
  if (plan.themeClasses.includes(cls.slug)) score += 4;
  if (plan.combatStyle.startsWith('ranged') && (cls.tags || []).includes('ranged')) score += 2;
  if (plan.combatStyle.startsWith('melee') && (cls.tags || []).includes('melee')) score += 2;
  return score;
}

/** Species score: mostly "does its ability bump land where the plan wants it". */
export function scoreSpecies(species, plan) {
  let score = 1;
  const top = plan.preferredAbilities.slice(0, 2);
  const second = plan.preferredAbilities.slice(2, 4);
  for (const adj of species.abilityAdjustments || []) {
    if (top.includes(adj.ability)) score += adj.value * 2.5;
    else if (second.includes(adj.ability)) score += adj.value * 0.75;
  }
  if (species.flexibleAdjustments) score += species.flexibleAdjustments.count * 1.5;
  return Math.max(0.25, score);
}

/** Background score: overlap with the plan's wanted skills, plus theme match. */
export function scoreBackground(bg, plan) {
  let score = 1;
  for (const skillId of bg.skills || []) {
    const slug = shortSkill(skillId);
    const idx = plan.preferredSkills.indexOf(slug);
    if (idx >= 0) score += Math.max(1, 4 - idx * 0.5);
  }
  if (plan.themeBackgrounds.includes(bg.slug)) score += 6;
  return score;
}

/** Skill score: earlier in the plan's preference list is better. */
export function scoreSkill(skillId, plan, chosenAbilities) {
  const slug = shortSkill(skillId);
  const idx = plan.preferredSkills.indexOf(slug);
  let score = idx >= 0 ? 10 - idx : 1;
  // A skill governed by a high ability is worth more regardless of the plan.
  const ability = chosenAbilities?.[slug];
  if (ability && plan.preferredAbilities.indexOf(ability) < 2) score += 2;
  return Math.max(0.5, score);
}

export const shortSkill = (id) => String(id).split('.').pop();
const dedupe = (arr) => [...new Set(arr)];

export { ABILITIES };
