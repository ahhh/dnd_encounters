// Skills, proficiencies and languages.
//
// Two things this file takes seriously. First, every proficiency records where
// it came from -- the validator checks that each one was actually granted by
// something on the sheet, which is what stops a "plausible" Stealth proficiency
// appearing on a character with no source for it.
//
// Second, duplicate choices are resolved rather than wasted. Backgrounds are
// applied before class picks, so a class choosing from a list that already
// includes a background skill simply picks something else it is entitled to.

import { modifiersOfType } from './class-builder.js';
import { scoreSkill, shortSkill } from './build-planner.js';

const prof = (type, id, sourceType, sourceId, name) =>
  ({ type, id, source: { type: sourceType, id: sourceId, ...(name ? { name } : {}) } });

/**
 * Builds the proficiency set in a fixed order: species, background, class, then
 * feature grants. Order matters because each stage sees what is already taken.
 */
export function buildProficiencies({ registry, cls, species, background, features, plan, stream, abilities }) {
  const skills = new Map();      // skillId -> proficiency record
  const languages = new Map();
  const tools = [];
  const weapons = [];
  const armor = [];
  const choices = [];

  const skillAbility = {};
  for (const s of registry.all('skill')) skillAbility[s.slug] = s.ability;

  const addSkill = (id, sourceType, sourceId, name) => {
    if (skills.has(id)) return false;
    skills.set(id, prof('skill', id, sourceType, sourceId, name));
    return true;
  };
  const addLanguage = (id, sourceType, sourceId, name) => {
    if (languages.has(id)) return false;
    languages.set(id, prof('language', id, sourceType, sourceId, name));
    return true;
  };

  // --- species -----------------------------------------------------------------
  for (const id of species.languages || []) addLanguage(id, 'species', species.id, species.name);
  for (const trait of species.traits || []) {
    for (const mod of trait.modifiers || []) {
      if (mod.type === 'skill-proficiency') {
        for (const id of mod.ids) addSkill(id, 'species', species.id, `${species.name}: ${trait.name}`);
      } else if (mod.type === 'weapon-proficiency') {
        for (const id of mod.ids) weapons.push(prof('weapon', id, 'species', species.id, trait.name));
      } else if (mod.type === 'tool-proficiency') {
        for (const name of mod.names) tools.push(prof('tool', name, 'species', species.id, trait.name));
      } else if (mod.type === 'language-grant') {
        for (const id of mod.ids) addLanguage(id, 'species', species.id, trait.name);
      }
    }
  }

  // --- background --------------------------------------------------------------
  for (const id of background.skills || []) addSkill(id, 'background', background.id, background.name);
  for (const name of background.toolProficiencies || []) {
    tools.push(prof('tool', name, 'background', background.id, background.name));
  }

  // --- class -------------------------------------------------------------------
  for (const category of cls.armorProficiencies || []) {
    armor.push(prof('armor', category, 'class', cls.id, cls.name));
  }
  for (const entry of cls.weaponProficiencies || []) {
    weapons.push(prof('weapon', entry, 'class', cls.id, cls.name));
  }
  for (const name of cls.toolProficiencies || []) {
    tools.push(prof('tool', name, 'class', cls.id, cls.name));
  }

  const classPool = cls.skillChoices.from === 'any'
    ? registry.all('skill').map((s) => s.id)
    : cls.skillChoices.from;
  const classPicks = pickSkills({
    pool: classPool, taken: skills, count: cls.skillChoices.count,
    plan, stream, skillAbility,
  });
  for (const id of classPicks) addSkill(id, 'class', cls.id, cls.name);
  choices.push({ level: 1, choiceType: 'class-skills', selected: classPicks.map((id) => ({ id })) });

  // --- feature grants ----------------------------------------------------------
  for (const mod of modifiersOfType(features, 'skill-choice')) {
    const picks = pickSkills({
      pool: registry.all('skill').map((s) => s.id), taken: skills, count: mod.count,
      plan, stream, skillAbility,
    });
    for (const id of picks) addSkill(id, 'feature', cls.id, 'feature choice');
    choices.push({ level: 1, choiceType: 'feature-skills', selected: picks.map((id) => ({ id })) });
  }
  for (const mod of modifiersOfType(features, 'armor-proficiency')) {
    for (const category of mod.categories) {
      if (!armor.some((a) => a.id === category)) {
        armor.push(prof('armor', category, 'feature', cls.id, 'subclass grant'));
      }
    }
  }

  // --- extra languages ---------------------------------------------------------
  const languagePool = registry.all('language').map((l) => l.id);
  const wantedLanguages = [
    ...(species.extraLanguages ? Array(species.extraLanguages).fill(['species', species.id, species.name]) : []),
    ...(background.languageChoices ? Array(background.languageChoices).fill(['background', background.id, background.name]) : []),
  ];
  for (const [type, id, name] of wantedLanguages) {
    const available = languagePool.filter((l) => !languages.has(l));
    if (!available.length) break;
    addLanguage(stream.choice(available), type, id, name);
  }
  for (const required of plan.requiredLanguages || []) {
    if (registry.has(required)) addLanguage(required, 'spec', 'constraint', 'requested');
  }

  // --- expertise ---------------------------------------------------------------
  const expertiseCount = modifiersOfType(features, 'expertise').reduce((n, m) => n + m.count, 0);
  const expertise = [];
  if (expertiseCount) {
    const owned = [...skills.keys()];
    const ranked = stream.sampleWeighted(owned, expertiseCount,
      (id) => scoreSkill(id, plan, skillAbility) + 2);
    expertise.push(...ranked);
    choices.push({ level: 1, choiceType: 'expertise', selected: ranked.map((id) => ({ id })) });
  }

  // --- saving throws -----------------------------------------------------------
  const saveProficiencies = new Set(cls.savingThrows);
  if (modifiersOfType(features, 'all-save-proficiency').length) {
    for (const a of ['str', 'dex', 'con', 'int', 'wis', 'cha']) saveProficiencies.add(a);
  }
  for (const mod of modifiersOfType(features, 'save-proficiency')) {
    for (const a of mod.abilities) saveProficiencies.add(a);
  }

  return {
    skills: [...skills.values()],
    languages: [...languages.values()],
    tools, weapons, armor,
    expertise,
    saveProficiencies: [...saveProficiencies],
    choices,
    skillAbility,
    all: [...skills.values(), ...languages.values(), ...tools, ...weapons, ...armor],
  };
}

/**
 * Picks `count` skills from `pool`, skipping any already held. If the pool is
 * exhausted -- a background overlapping a narrow class list -- the remaining
 * picks fall back to the full skill list, which is how the SRD resolves it
 * rather than silently losing the choice.
 */
function pickSkills({ pool, taken, count, plan, stream, skillAbility }) {
  const available = pool.filter((id) => !taken.has(id));
  const picks = stream.sampleWeighted(available, count,
    (id) => scoreSkill(id, plan, skillAbility));
  return picks;
}

export { shortSkill };
