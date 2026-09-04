# Seeded D&D NPC & Enemy Character-Sheet Generator --- Agent Build Plan

## 0. Mission

Build a **standalone deterministic D&D NPC/enemy sheet generator** whose
only job is to produce complete, internally consistent, rules-valid game
records.

It must support two distinct outputs:

1.  **NPC Character Sheets** --- NPCs intentionally built with supported
    player-character creation/progression rules.
2.  **Enemy/Creature Sheets** --- monsters and combat NPCs represented
    with the supported creature/stat-block rules.

Do not force monsters through player-character rules. "Fully valid"
means valid for the entity's appropriate rules model.

For fixed
`seed + input spec + reroll state + generator version + ruleset version + content-pack versions`,
canonical output must be identical.

Encounter generation, quests, maps, initiative tracking, combat
simulation, and VTT integration are out of scope.

------------------------------------------------------------------------

# 1. Product Contract

Example NPC input:

``` text
Seed: ember-raven-4172
Ruleset: supported SRD 5.2 / 2024-compatible pack
Type: NPC Character
Level: 5
Role: Scout
Species: Random
Class: Random
Background: Random
Theme: Forest Guide
```

Example enemy input:

``` text
Seed: crypt-warden-882
Type: Enemy Creature
Mode: Existing
Target CR: 3
Family: Undead
Environment: Crypt
Role: Controller
```

Output must contain every applicable mechanical field needed to run the
entity without inventing missing numbers at the table.

------------------------------------------------------------------------

# 2. Licensing and Content Boundary

Use only content the project may legally redistribute/use. Begin with an
explicitly supported open rules/content pack such as **SRD 5.2 under
CC-BY-4.0**, retaining required attribution.

Do not silently include non-SRD/proprietary monsters, subclasses, feats,
spells, magic items, adventure NPCs, or descriptive text.

Every content entity must include provenance:

``` ts
interface ContentSource {
  packId: string;
  sourceId: string;
  version: string;
  license: string;
}
```

Generated/custom enemies must be labeled as generated game content,
never presented as official D&D creatures.

------------------------------------------------------------------------

# 3. Architecture

``` text
src/
  core/
    random/
      seed.*
      rng.*
      derive.*
      weighted.*
    validation/
    ids/

  rules/
    registry.*
    ruleset.*
    srd52/
      abilities.*
      proficiency.*
      character-levels.*
      classes.*
      spellcasting.*
      equipment.*
      combat.*
      creature-rules.*
      challenge-rating.*

  content/
    schema.*
    loader.*
    registry.*
    packs/
      srd52/
        manifest.json
        species.json
        classes.json
        backgrounds.json
        feats.json
        skills.json
        spells.json
        equipment.json
        weapons.json
        armor.json
        monsters.json
        creature-features.json
        npc-archetypes.json
        names.json

  sheets/
    common/
      identity.*
      abilities.*
      defenses.*
      senses.*
      languages.*

    character/
      spec.*
      generator.*
      build-planner.*
      ability-builder.*
      class-builder.*
      skill-builder.*
      equipment-builder.*
      spell-builder.*
      derived-stats.*
      validator.*

    creature/
      spec.*
      generator.*
      existing-normalizer.*
      variant-builder.*
      generated-builder.*
      action-builder.*
      spell-builder.*
      cr-evaluator.*
      validator.*

    narrative/
      personality.*
      appearance.*

    document/
      character-sheet.*
      creature-sheet.*
      manifest.*

  export/
    json.*
    markdown.*

tests/
  unit/
  integration/
  regression/
  fixtures/
    character-seeds/
    creature-seeds/

tools/
  verify-content.*
  verify-sheets.*
  verify-seeds.*
  statistical-generation.*
```

Adapt extensions and conventions to the existing repository.

------------------------------------------------------------------------

# 4. P0 --- Deterministic RNG

No production generator may use uncontrolled randomness such as
`Math.random()`.

Use namespaced streams:

``` text
npc:identity
npc:species
npc:class
npc:background
npc:abilities
npc:skills
npc:equipment
npc:spells
npc:personality

enemy:base
enemy:features
enemy:actions
enemy:equipment
enemy:spells
enemy:personality
```

Required helpers:

-   normalized seed
-   child stream derivation
-   integer/float range
-   chance
-   choice
-   weighted choice
-   shuffle
-   sample without replacement

Adding a personality roll must never alter AC, HP, equipment, or spells.

### Acceptance

-   Same seed/namespace gives identical sequence.
-   Namespaces are isolated.
-   Unit tests prove isolation.
-   All sheet-generation randomness uses this API.

------------------------------------------------------------------------

# 5. P0 --- Content Registry

Normalize supported:

``` text
species
classes
class features
backgrounds
feats
skills
spells
weapons
armor
equipment
items
monsters
creature features
languages
```

Internal references use stable IDs, not display names.

Required operations include:

``` text
getSpecies
getClass
getBackground
getSpell
findSpells
getEquipment
getMonster
findMonsters
```

### Acceptance

-   malformed content fails schema validation
-   duplicate IDs fail
-   broken references fail
-   all entities contain provenance
-   content verification runs independently of generation

------------------------------------------------------------------------

# 6. P0 --- NPC Character Generation Spec

``` ts
interface CharacterGenerationSpec {
  seed: string;
  ruleset: string;
  contentPacks: string[];

  level: number;

  species?: string | "random";
  class?: string | "random";
  background?: string | "random";

  role?: CharacterRole;
  theme?: string;

  constraints?: {
    abilityMethod?: string;
    spellcaster?: boolean;
    meleePreferred?: boolean;
    rangedPreferred?: boolean;
    requiredSkills?: string[];
    requiredLanguages?: string[];
  };
}
```

Suggested semantic roles:

``` text
warrior
brute
guardian
scout
archer
expert
face
healer
support
controller
arcane-caster
divine-caster
```

Roles guide legal choices; they never override legality.

------------------------------------------------------------------------

# 7. P0 --- Canonical CharacterSheet

``` ts
interface CharacterSheet {
  id: string;
  seed: string;

  identity: CharacterIdentity;

  level: number;
  species: ContentRef;
  classLevels: ClassLevelRef[];
  background: ContentRef;

  abilityScores: AbilityScores;
  abilityModifiers: AbilityModifiers;
  proficiencyBonus: number;

  savingThrows: SavingThrowRecord[];
  skills: SkillRecord[];

  armorClass: ArmorClassRecord;
  initiative: number;
  movement: MovementRecord[];
  hitPoints: HitPointRecord;
  hitDice: HitDiceRecord[];

  senses: SenseRecord[];
  languages: ContentRef[];
  proficiencies: ProficiencyRecord[];

  attacks: AttackRecord[];
  equipment: InventoryRecord[];
  currency: CurrencyRecord;

  features: FeatureRecord[];
  feats: FeatureRecord[];

  spellcasting?: SpellcastingRecord;

  personality: PersonalityRecord;

  generation: GenerationManifest;
}
```

Add any additional mechanically required fields imposed by the
implemented ruleset.

------------------------------------------------------------------------

# 8. P0 --- Character Build Planner

Do not randomly select each choice independently.

Translate semantic intent into a build plan:

``` ts
interface CharacterBuildPlan {
  role: CharacterRole;
  level: number;
  preferredAbilities: AbilityId[];
  preferredSkills: string[];
  combatStyle: string;
  equipmentProfile: string;
  spellProfile?: string;
}
```

Pipeline:

``` text
Generation Spec
  ↓
Legal species/class/background pool
  ↓
Build Plan
  ↓
Abilities
  ↓
Class choices/features
  ↓
Skills/proficiencies
  ↓
Equipment
  ↓
Spells
  ↓
Derived statistics
  ↓
Independent validation
```

------------------------------------------------------------------------

# 9. P0 --- Ability Scores

Implement only supported generation methods, such as:

``` text
standard array
point buy
explicit supported deterministic rolling method
```

Record base values, adjustments, final values, and modifiers.

Validator must independently assert:

``` text
modifier = floor((score - 10) / 2)
```

Do not generate arbitrary plausible-looking scores.

------------------------------------------------------------------------

# 10. P0 --- Class Progression

For every implemented class/level, structurally model all applicable:

-   proficiency progression
-   hit dice
-   class features
-   selectable features
-   branch/subclass choices when enabled
-   ASI/feat choices
-   resource pools
-   spellcasting progression
-   attack progression
-   other mechanically relevant level changes

Do not rely on prose as the source of mechanical truth.

Every feature should retain source/provenance and structured
modifiers/resources where relevant.

------------------------------------------------------------------------

# 11. P0 --- Skills, Saves, Languages, and Proficiencies

Track the source of each proficiency.

``` ts
interface ProficiencyRecord {
  type: "skill" | "weapon" | "armor" | "tool" | "language";
  id: string;
  source: {
    type: string;
    id: string;
  };
}
```

Derived skill/saving-throw modifiers must be calculated from actual
ability scores, proficiency, expertise, and applicable features.

Duplicate-choice handling must follow the supported rules rather than
silently wasting choices.

------------------------------------------------------------------------

# 12. P0 --- HP, Hit Dice, AC, Initiative, Movement

Derive these values from actual legal choices.

HP must come from:

``` text
class progression
+ Constitution
+ applicable features
+ explicit supported HP policy
```

Prefer deterministic average/default HP unless a supported rolled-HP
mode is explicitly requested.

AC must come from actual:

``` text
armor
shield
Dexterity where applicable
features
other structured modifiers
```

Do not assign arbitrary AC.

Store calculation provenance so values can be explained and
independently recomputed.

------------------------------------------------------------------------

# 13. P0 --- Equipment

Generate a legal, internally consistent loadout:

-   weapons
-   armor
-   shields
-   tools
-   adventuring equipment
-   focus/components when required
-   currency
-   inventory

Validate:

-   proficiency
-   armor restrictions
-   Strength requirements where relevant
-   hand usage
-   ammunition
-   equipped-state conflicts
-   spellcasting needs
-   supported starting/equipment policy

Attack records must derive from actual equipped weapons/features.

------------------------------------------------------------------------

# 14. P0 --- Attacks

``` ts
interface AttackRecord {
  name: string;
  source: ContentRef;
  attackType: "melee" | "ranged" | "spell" | "special";

  attackBonus?: number;
  saveDC?: number;

  reach?: number;
  normalRange?: number;
  longRange?: number;

  damage: DamageExpression[];
  properties: string[];
}
```

Weapon attack math must be derived from rules:

``` text
relevant ability modifier
+ proficiency when applicable
+ structured modifiers
```

Damage must derive from the weapon/feature and applicable
ability/modifiers.

Validator independently recomputes it.

------------------------------------------------------------------------

# 15. P0 --- Spellcasting

Spell generation is a constraint-solving problem.

``` ts
interface SpellcastingRecord {
  ability: AbilityId;
  spellAttackBonus: number;
  spellSaveDC: number;

  slots?: SpellSlotRecord[];

  cantrips: ContentRef[];
  preparedSpells?: ContentRef[];
  knownSpells?: ContentRef[];
  spellbook?: ContentRef[];

  focus?: ContentRef;
  resources?: ResourcePool[];
}
```

Pipeline:

``` text
class/feature progression
  ↓
legal spell list
  ↓
legal spell levels
  ↓
known/prepared limits
  ↓
role/theme scoring
  ↓
seeded selection
  ↓
validation
```

Useful spell tags:

``` text
damage
healing
control
defense
mobility
utility
social
exploration
```

Validate class list, levels, counts, slots/resources, casting ability,
attack bonus, and save DC.

------------------------------------------------------------------------

# 16. P1 --- Feats and Choice Points

Every level-up choice should be explicit and auditable.

``` ts
interface BuildChoice {
  level: number;
  choiceType: string;
  selected: ContentRef[];
}
```

Feat/ASI selection must satisfy prerequisites and legal entitlement.

Score legal choices against the build plan rather than selecting
blindly.

------------------------------------------------------------------------

# 17. P1 --- Identity and Personality

Identity generation is mechanically isolated.

Possible identity fields:

``` text
name
pronouns
size
age descriptor
appearance
occupation
disposition
```

Personality:

``` ts
interface PersonalityRecord {
  disposition: string;
  motivation: string;
  ideal?: string;
  bond?: string;
  flaw?: string;
  mannerism?: string;
  voiceCue?: string;
  wants?: string;
  fears?: string;
  combatBehavior?: string;
  surrenderCondition?: string;
}
```

Use generic/open/project-authored tables, not proprietary setting
material.

------------------------------------------------------------------------

# 18. P0 --- Enemy Generation Spec

``` ts
interface CreatureGenerationSpec {
  seed: string;
  ruleset: string;
  contentPacks: string[];

  targetCR?: number | string;

  baseCreature?: string | "random";
  creatureType?: string;
  family?: string;
  environment?: string;

  role?: CreatureRole;
  theme?: string;

  mode: "existing" | "variant" | "generated";

  constraints?: {
    spellcaster?: boolean;
    flying?: boolean;
    ranged?: boolean;
  };
}
```

Modes:

### Existing

Choose/return a complete normalized sheet for a real creature from
enabled content.

### Variant

Start with an enabled creature, apply only documented
legal/project-defined transformations, then reevaluate and validate.

### Generated

Construct original enemy mechanics from documented creature-generation
rules and validate/evaluate them.

Implement **Existing** first. Do not implement Generated until CR
evaluation is trustworthy.

------------------------------------------------------------------------

# 19. P0 --- Canonical CreatureSheet

``` ts
interface CreatureSheet {
  id: string;
  seed: string;

  identity: CreatureIdentity;

  sourceMode: "existing" | "variant" | "generated";
  baseCreature?: ContentRef;

  size: string;
  creatureType: string;

  challengeRating: number | string;
  xp: number;
  proficiencyBonus: number;

  abilityScores: AbilityScores;
  abilityModifiers: AbilityModifiers;

  armorClass: ArmorClassRecord;
  hitPoints: HitPointRecord;
  movement: MovementRecord[];

  savingThrows: SavingThrowRecord[];
  skills: SkillRecord[];

  vulnerabilities: string[];
  resistances: string[];
  immunities: string[];
  conditionImmunities: string[];

  senses: SenseRecord[];
  languages: ContentRef[];

  traits: CreatureFeatureRecord[];

  actions: CreatureActionRecord[];
  bonusActions: CreatureActionRecord[];
  reactions: CreatureActionRecord[];

  spellcasting?: CreatureSpellcastingRecord;

  equipment?: InventoryRecord[];

  tacticalRole: CreatureRole;
  personality?: PersonalityRecord;

  generation: GenerationManifest;
}
```

Add other action/resource categories if required by the supported source
model.

------------------------------------------------------------------------

# 20. P0 --- Existing Creature Normalization

Implement this enemy path first:

``` text
enabled real creature
  ↓
source lookup
  ↓
normalized structured mechanics
  ↓
derived/reference verification
  ↓
CreatureSheet
  ↓
validation
```

A request such as:

``` text
undead
target CR around 3
environment crypt
```

may seed-select among enabled creatures satisfying those constraints.

Do not mutate source mechanics just to force an exact CR.

------------------------------------------------------------------------

# 21. P1 --- Tactical Roles

Attach generator metadata:

``` text
brute
soldier
skirmisher
artillery
controller
support
ambusher
leader
solo
```

For existing creatures, roles are metadata only and do not alter
mechanics.

Other systems can later use these tags when composing encounters.

------------------------------------------------------------------------

# 22. P0 --- Creature Actions

Actions must be mechanically structured.

``` ts
interface CreatureActionRecord {
  id: string;
  name: string;
  actionType: string;

  attack?: {
    bonus: number;
    reach?: number;
    range?: RangeRecord;
  };

  save?: {
    ability: AbilityId;
    dc: number;
  };

  damage?: DamageExpression[];

  recharge?: RechargeRecord;
  uses?: ResourcePool;

  effects: StructuredEffect[];

  source?: ContentRef;
}
```

Downstream systems must never have to parse prose to discover attack
bonus, damage, DC, range, or recharge.

------------------------------------------------------------------------

# 23. P1 --- Enemy Spellcasting

Represent creature spellcasting according to its actual source/rules
model.

Track as applicable:

-   casting ability
-   spell attack
-   save DC
-   spells
-   per-day uses
-   slots
-   innate casting
-   action integration

Do not assume PC preparation rules for all monsters.

Generated spellcasters must be reevaluated for CR after spell selection.

------------------------------------------------------------------------

# 24. P0 --- CR Evaluation for Variants/Generated Enemies

Never write a requested CR onto an invented stat block and call it
valid.

Implement an explicit, documented CR evaluation procedure compatible
with the supported rules/project model.

Evaluate relevant defensive and offensive properties, including as
applicable:

``` text
HP
AC
resistances/immunities
defensive traits

expected damage
attack bonus
save DC
multiattack/action pattern
offensive traits
```

Return diagnostics:

``` ts
interface CREvaluation {
  targetCR?: CR;
  evaluatedCR: CR;
  defensiveCR: CR;
  offensiveCR: CR;
  assumptions: string[];
  warnings: string[];
}
```

Generated/variant creatures that fail the target policy must be
deterministically adjusted through documented transformations,
regenerated, or rejected.

Never falsify CR.

------------------------------------------------------------------------

# 25. P0 --- Independent Validation Engine

A sheet is not complete until an independent validator passes it.

## Character validation

Recompute/check:

``` text
level
proficiency bonus
ability modifiers
HP
hit dice
AC
initiative
movement
saving throws
skills
attack bonuses
damage
class features by level
feature prerequisites
feat prerequisites
proficiency legality
equipment legality
spellcasting ability
spell save DC
spell attack bonus
spell levels
spell counts
spell slots/resources
language choices
all references
```

## Creature validation

Check:

``` text
required fields
ability modifiers
AC structure
HP structure
attack math
save DCs
damage expressions
actions
feature references
spell references
movement
senses
languages
CR/XP metadata
source integrity
```

Variants/generated creatures also run CR evaluation.

``` ts
interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
```

A result with validation errors must never be returned as a successful
sheet.

------------------------------------------------------------------------

# 26. P1 --- Explainability

Retain calculation provenance for major derived numbers.

The system should be able to answer:

``` text
Why is AC 18?
Why is this attack +7?
Why is this spell DC 15?
Why does this character have 44 HP?
```

Store structured calculation records rather than only final numbers.

This is important for debugging, testing, and user trust.

------------------------------------------------------------------------

# 27. P1 --- Selective Rerolls

Support deterministic scopes:

``` text
everything
identity
build
abilities
skills
equipment
spells
personality

enemy-base
enemy-features
enemy-actions
enemy-spells
```

Persist namespace counters:

``` ts
interface RerollState {
  [namespace: string]: number;
}
```

Rerolling personality must not change mechanics.

Rerolling spells may trigger dependent recalculation/validation but must
not randomly alter identity.

------------------------------------------------------------------------

# 28. P0 --- Generation Manifest

``` ts
interface GenerationManifest {
  generatorVersion: string;

  ruleset: {
    id: string;
    version: string;
  };

  contentPacks: Array<{
    id: string;
    version: string;
  }>;

  seed: string;
  rerolls: RerollState;
}
```

Reproduction contract:

``` text
spec
+ seed
+ rerolls
+ generator version
+ rules version
+ content versions
= same canonical sheet
```

------------------------------------------------------------------------

# 29. P0/P1 --- Persistence and Exports

## JSON

JSON is canonical and lossless.

Include:

``` text
schema version
generation spec
generation manifest
complete sheet
validation summary
content provenance/attribution
```

Importing saved JSON should reconstruct the stored sheet without
rerunning generation.

Provide a separate explicit "regenerate from spec/manifest" operation.

## Markdown

Provide DM-readable character and creature sheets without copying
proprietary visual trade dress.

Character Markdown sections should include:

``` text
Identity
Core Statistics
Abilities
Saving Throws
Skills
Attacks
Features
Spellcasting
Equipment
Personality
Generation/Provenance
```

Creature Markdown sections should include:

``` text
Identity / Source
CR / XP
AC / HP / Movement
Abilities
Saves / Skills
Defenses
Senses / Languages
Traits
Actions
Bonus Actions
Reactions
Spellcasting
Tactics
Generation/Provenance
```

------------------------------------------------------------------------

# 30. P1 --- Integration API

Other tools should request sheets through stable APIs.

``` ts
generateCharacter(
  spec: CharacterGenerationSpec
): GenerationResult<CharacterSheet>
```

``` ts
generateCreature(
  spec: CreatureGenerationSpec
): GenerationResult<CreatureSheet>
```

``` ts
generateSheets(
  requests: SheetGenerationRequest[]
): GenerationResult<GeneratedSheet[]>
```

An encounter system owns **which entities exist**.

This generator owns **the complete valid sheet for each entity**.

Do not introduce a dependency on an encounter generator.

------------------------------------------------------------------------

# 31. P1 --- Batch Generation

Batch generation should support requests such as:

``` text
1 named enemy leader
4 anonymous guards
1 named captive NPC
```

Use deterministic child seeds per entity.

Track names/build signatures to avoid accidental duplicates.

Anonymous creatures may be labeled:

``` text
Guard 1
Guard 2
Guard 3
```

Named NPCs should receive deterministic unique identities.

------------------------------------------------------------------------

# 32. P1 --- Debug Inspector

Development mode should expose decisions.

Character inspector:

``` text
root seed
namespace seeds
role/build plan
species candidate scores
class candidate scores
background candidate scores
ability assignment
skill choices
equipment choices
spell choices
derived calculations
validation results
```

Creature inspector:

``` text
target CR
base candidates
selected base
role
variant/generated transforms
offensive evaluation
defensive evaluation
final CR evaluation
validation
```

Use machine-readable rejection codes.

------------------------------------------------------------------------

# 33. P0 --- Regression and Invariant Tests

Maintain golden seed fixtures.

Character fixtures should cover:

-   low/mid/high levels
-   martial characters
-   spellcasters
-   melee/ranged
-   several roles
-   random and constrained builds

Creature fixtures should cover:

-   existing creatures
-   several CRs
-   melee/ranged
-   spellcasters
-   variants once supported
-   generated creatures once supported

Golden rule:

``` text
same spec/version/seed/rerolls
=
identical canonical JSON
```

Also use independent invariant tests:

``` text
ability modifier recomputes
proficiency recomputes
skill modifier recomputes
saving throw recomputes
AC recomputes
HP recomputes
weapon attack recomputes
spell DC recomputes
spell attack recomputes
spell selection is legal
feature prerequisites hold
equipment choices are legal
all references resolve
```

For generated enemies:

``` text
declared/evaluated CR satisfies policy
actions contain valid structured math
spell references resolve
required fields exist
feature combinations are supported
```

------------------------------------------------------------------------

# 34. P2 --- Statistical Generation Tests

Run thousands of deterministic seeds and measure:

For characters:

``` text
class frequency
species frequency
background frequency
role frequency
ability distributions
spell frequency
feat frequency
equipment frequency
internal retry rate
```

For creatures:

``` text
base-creature frequency
CR distribution
role distribution
feature frequency
damage distribution
AC distribution
HP distribution
CR adjustment/retry rate
```

Flag unreachable content, dominant selections, pathological
distributions, and excessive retries.

Successfully returned sheets must have:

``` text
validation errors = 0
```

------------------------------------------------------------------------

# 35. Failure Strategy

Never return a knowingly invalid sheet.

``` text
generate
  ↓
derive
  ↓
validate
  ↓
valid?
 ┌─┴─┐
yes  no
 │    │
return deterministic retry/repair
      │
      ▼
   validate
      │
      ▼
structured failure if unresolved
```

Repairs must modify underlying choices according to documented logic.

Do not simply overwrite calculated values until validation passes.

``` ts
interface SheetGenerationFailure {
  code: string;
  stage: string;
  seed: string;
  message: string;
  validationErrors: ValidationIssue[];
}
```

------------------------------------------------------------------------

# 36. Agent Work Packages

### WP-001 --- RNG Foundation

Namespaced deterministic RNG and tests.

### WP-002 --- Content Schemas

Normalized content definitions and provenance.

### WP-003 --- Content Registry

Loading, references, filtering, validation.

### WP-004 --- Rules Math

Abilities, proficiency, skills, saves, attacks, core derivation helpers.

### WP-005 --- CharacterSheet Schema

Canonical character document.

### WP-006 --- Build Planner

Role → mechanical preference plan.

### WP-007 --- Ability Builder

Supported generation and assignment.

### WP-008 --- Class Progression

Legal features and level progression.

### WP-009 --- Skills/Proficiencies

Legal choices and derived values.

### WP-010 --- Equipment

Legal loadout generation.

### WP-011 --- Character Derived Stats

HP, AC, initiative, movement, attacks, defenses.

### WP-012 --- Spellcasting

Legal spell generation and derived values.

### WP-013 --- Character Validator

Independent full-sheet verification.

### WP-014 --- CreatureSheet Schema

Canonical creature document.

### WP-015 --- Existing Creature Normalizer

Complete sheets from enabled real creatures.

### WP-016 --- Creature Validator

Independent creature verification.

### WP-017 --- CR Evaluator

Required before custom/generated enemies.

### WP-018 --- Variant Creature Builder

Documented transforms + reevaluation.

### WP-019 --- Generated Creature Builder

Original enemies + CR validation.

### WP-020 --- Identity/Personality

Mechanically isolated deterministic flavor.

### WP-021 --- Selective Rerolls

Namespace counters and dependency recalculation.

### WP-022 --- JSON/Markdown

Persistence and DM-readable exports.

### WP-023 --- Batch/Integration API

Generate multiple independent complete sheets.

### WP-024 --- Verification Harness

Golden fixtures, invariants, statistical testing.

------------------------------------------------------------------------

# 37. Agent Execution Protocol

Before editing:

1.  Read this plan.
2.  Inspect repository conventions.
3.  Read relevant tests.
4.  Select the smallest work package.
5.  Record assumptions.
6.  Avoid unrelated refactors.

During implementation:

1.  Preserve determinism.
2.  Keep mechanics structured.
3.  Use stable content IDs.
4.  Preserve provenance.
5.  Add tests with functionality.
6.  Never make prose the source of mechanical truth.
7.  Never introduce unlicensed D&D content.
8.  Never weaken validation just to make generation pass.

Before completion, run the repository equivalents of:

``` text
format
lint
typecheck
unit tests
integration tests
content validation
sheet validation
seed regression tests
```

Report:

``` text
Files changed
Behavior implemented
Tests added
Commands run
Assumptions
Known limitations
Follow-up dependencies
```

------------------------------------------------------------------------

# 38. Definition of Fully Valid NPC Character Sheet

A generated NPC character sheet is complete only when:

-   every required choice is resolved
-   all choices are legal
-   all prerequisites are satisfied
-   ability scores are legal
-   modifiers are correct
-   proficiency is correct
-   class progression matches level
-   HP and hit dice are correct
-   AC is derived correctly
-   initiative/movement are correct
-   saving throws are correct
-   skills are correct
-   attacks and damage are correct
-   equipment is legal
-   spells are legal
-   spell counts/resources are correct
-   spell attack/DC values are correct
-   every content reference resolves
-   mechanically required fields are populated
-   provenance is retained
-   independent validation returns zero errors

A plausible-looking sheet is not sufficient.

------------------------------------------------------------------------

# 39. Definition of Fully Valid Enemy Sheet

For an existing creature:

-   source mechanics are completely represented
-   source mechanics are not accidentally altered
-   actions/features/spells resolve
-   derived/reference data verifies
-   CR/XP metadata is correct
-   provenance is retained
-   validation returns zero errors

For variants/generated creatures:

-   all required fields are populated
-   action math is valid
-   features/spells resolve
-   incompatible combinations are rejected
-   declared CR follows the implemented evaluator/policy
-   CR diagnostics are retained
-   source vs generated provenance is explicit
-   validation returns zero errors

Generated enemies must never be mislabeled as official D&D creatures.

------------------------------------------------------------------------

# 40. Implementation Milestones

## Milestone A --- Rules Kernel

Deliver:

``` text
RNG
content schemas
registry
rules math
validation primitives
```

## Milestone B --- Martial Character MVP

Produce complete valid supported non-spellcasting NPC characters:

``` text
identity
abilities
class progression
skills
HP
AC
attacks
equipment
validation
```

## Milestone C --- Spellcaster MVP

Add:

``` text
spell progression
spell selection
slots/resources
spell DC
spell attacks
spell validation
```

## Milestone D --- Full NPC Generator

Add all initially supported open-content:

``` text
species
classes
backgrounds
roles
personality
rerolls
JSON
Markdown
```

## Milestone E --- Existing Enemy Generator

Normalize enabled real creatures into complete validated `CreatureSheet`
objects.

## Milestone F --- CR Evaluator

Build and extensively test creature evaluation.

## Milestone G --- Variant/Generated Enemies

Only after Milestone F:

``` text
variants
role-driven generated enemies
CR adjustment
CR validation
```

## Milestone H --- Batch/Integration API

Allow external systems to request arbitrary numbers of complete sheets.

------------------------------------------------------------------------

# 41. Character MVP Acceptance Test

Input:

``` text
Seed: ember-raven-4172
Type: NPC Character
Level: 5
Role: Scout
Species: Random
Class: Supported Random
Background: Supported Random
```

Assertions:

``` text
validation errors == 0
all required choices resolved
all IDs resolve
HP recomputes
AC recomputes
initiative recomputes
skills recompute
saves recompute
attacks recompute
features match progression
equipment is legal
spell state is legal when applicable
same seed/spec/version reproduces identical JSON
```

------------------------------------------------------------------------

# 42. Existing Enemy MVP Acceptance Test

Input:

``` text
Seed: crypt-warden-882
Type: Enemy
Mode: Existing
Target CR: 3
Family: Undead
Environment: Crypt
```

Process:

``` text
find enabled matching real creatures
↓
seeded selection
↓
normalize complete mechanics
↓
validate
```

Assertions:

``` text
validation errors == 0
source resolves
actions resolve
features resolve
spells resolve
CR/XP metadata is correct
provenance is present
same seed/spec/version reproduces identical JSON
```

------------------------------------------------------------------------

# 43. Generated Enemy Acceptance Test

Do not enable until CR evaluation is implemented.

Input:

``` text
Seed: ashen-eye-1209
Mode: Generated
Target CR: 5
Creature Type: Undead
Role: Controller
```

Assertions:

``` text
validation errors == 0
required creature fields populated
actions are mechanically structured
references resolve
evaluated CR satisfies declared target policy
CR diagnostics are stored
generated/source provenance is explicit
same seed reproduces identical JSON
```

If constraints cannot be satisfied, return a structured failure instead
of inventing a false CR.

------------------------------------------------------------------------

# 44. Integration Boundary

An external encounter generator should request sheets rather than invent
combatant mechanics.

Example:

``` ts
const captain = generateCharacter({
  seed: encounterSeed + ":captain",
  level: 5,
  role: "warrior"
});

const enemy = generateCreature({
  seed: encounterSeed + ":enemy:0",
  mode: "existing",
  baseCreature: "srd52:some-creature-id"
});
```

The encounter system owns:

``` text
which entities exist
how many
their encounter role
their narrative relationship
```

This project owns:

``` text
the complete mechanically valid sheet for every requested entity
```

Keep this boundary strict.

------------------------------------------------------------------------

# 45. Architectural Rule to Protect

> **Generate legal choices first, derive statistics from those choices,
> then independently validate the finished sheet.**

Never:

``` text
random AC
random HP
random attack bonus
random spells
assign a level/CR
call it valid
```

For NPC characters:

``` text
ruleset
  ↓
legal build choices
  ↓
features/equipment/spells
  ↓
derived statistics
  ↓
independent validator
  ↓
complete sheet
```

For enemies:

``` text
real source creature
OR documented generated-creature rules
  ↓
structured mechanics
  ↓
derived/evaluated statistics
  ↓
CR evaluation where applicable
  ↓
independent validator
```

**Randomness chooses among legal possibilities. Randomness never
determines legality.**

------------------------------------------------------------------------

# 46. Immediate First Agent Task

Give the first coding agent this exact scope:

> Inspect the repository and implement the deterministic rules kernel
> required for fully valid NPC and enemy sheets. Start with namespaced
> seeded RNG, canonical content references/provenance, ability-score
> modifier calculation, proficiency-bonus calculation, and reusable
> validation primitives. Add unit tests proving deterministic RNG
> isolation and independent recomputation of derived values. Do not
> implement encounter generation, quests, maps, narrative AI, or custom
> monster generation. Do not introduce non-SRD proprietary D&D content.
> Report files changed, tests added, commands run, assumptions, known
> limitations, and follow-up dependencies.

After that merges, parallelize:

``` text
content registry
CharacterSheet schema
character progression/rules
existing creature normalization
verification harness
```

Do **not** begin generated/custom enemies until existing creature sheets
and CR evaluation are both well tested.
