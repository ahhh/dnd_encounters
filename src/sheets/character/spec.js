// Character generation spec.
//
// The spec is the *request*. It says what the caller wants in semantic terms --
// a level-5 scout, a spellcaster, a forest guide -- and never in mechanical
// ones. Turning "scout" into ability priorities and a weapon choice is the
// build planner's job, and it does that by scoring legal options rather than by
// hard-coding a class.

export const CHARACTER_ROLES = [
  'warrior', 'brute', 'guardian', 'scout', 'archer', 'expert',
  'face', 'healer', 'support', 'controller', 'arcane-caster', 'divine-caster',
];

export const ABILITY_METHODS = ['standard-array', 'point-buy', 'rolled'];

export const HP_POLICIES = ['fixed', 'rolled'];

/** Fills defaults and normalises the loose shapes the UI produces. */
export function normalizeCharacterSpec(spec = {}) {
  const level = clamp(Math.round(Number(spec.level) || 1), 1, 20);
  return {
    seed: String(spec.seed ?? 'unseeded'),
    ruleset: spec.ruleset || 'srd51',
    contentPacks: spec.contentPacks || ['srd51', 'openflavor'],
    level,
    species: normalizeChoice(spec.species),
    class: normalizeChoice(spec.class ?? spec.classId),
    background: normalizeChoice(spec.background),
    role: CHARACTER_ROLES.includes(spec.role) ? spec.role : 'random',
    theme: spec.theme ? String(spec.theme) : '',
    named: spec.named !== false,
    constraints: {
      abilityMethod: ABILITY_METHODS.includes(spec.constraints?.abilityMethod)
        ? spec.constraints.abilityMethod : 'standard-array',
      hpPolicy: HP_POLICIES.includes(spec.constraints?.hpPolicy) ? spec.constraints.hpPolicy : 'fixed',
      spellcaster: spec.constraints?.spellcaster ?? null,
      meleePreferred: spec.constraints?.meleePreferred ?? null,
      rangedPreferred: spec.constraints?.rangedPreferred ?? null,
      requiredSkills: spec.constraints?.requiredSkills || [],
      requiredLanguages: spec.constraints?.requiredLanguages || [],
    },
  };
}

const normalizeChoice = (v) => (!v || v === 'random' ? 'random' : String(v));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
