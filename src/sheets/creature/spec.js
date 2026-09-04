// Creature generation spec.
//
// Three modes, deliberately different in kind:
//
//   existing  -- return a real creature from the enabled content, normalised
//   variant   -- apply documented transforms to a real creature, then re-rate it
//   generated -- build original mechanics against the CR model, then re-rate them
//
// "Existing" is the trustworthy path and is the default. The other two are only
// as good as the CR evaluator, which is why they carry their diagnostics with
// them everywhere they go.

export const CREATURE_ROLES = [
  'brute', 'soldier', 'skirmisher', 'artillery', 'controller',
  'support', 'ambusher', 'leader', 'solo',
];

export const CREATURE_MODES = ['existing', 'variant', 'generated'];

export function normalizeCreatureSpec(spec = {}) {
  return {
    seed: String(spec.seed ?? 'unseeded'),
    ruleset: spec.ruleset || 'srd51',
    contentPacks: spec.contentPacks || ['srd51', 'openflavor'],
    mode: CREATURE_MODES.includes(spec.mode) ? spec.mode : 'existing',
    targetCR: spec.targetCR === undefined || spec.targetCR === '' || spec.targetCR === 'any'
      ? null : spec.targetCR,
    baseCreature: !spec.baseCreature || spec.baseCreature === 'random' ? 'random' : String(spec.baseCreature),
    creatureType: spec.creatureType && spec.creatureType !== 'any' ? String(spec.creatureType) : null,
    family: spec.family && spec.family !== 'any' ? String(spec.family) : null,
    environment: spec.environment && spec.environment !== 'any' ? String(spec.environment) : null,
    role: CREATURE_ROLES.includes(spec.role) ? spec.role : null,
    theme: spec.theme ? String(spec.theme) : '',
    named: !!spec.named,
    withPersonality: spec.withPersonality !== false,
    constraints: {
      spellcaster: spec.constraints?.spellcaster ?? null,
      flying: spec.constraints?.flying ?? null,
      ranged: spec.constraints?.ranged ?? null,
    },
  };
}
