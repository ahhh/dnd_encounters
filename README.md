# Sheetforge

Seeded generator for D&D NPC character sheets and enemy stat blocks. Its only
job is to produce complete, internally consistent, rules-valid game records —
every field a DM needs to run the thing at the table, with nothing invented to
fill a gap.

A static site: no build step, no dependencies, no server. Push it to GitHub
Pages and it works.

Two outputs, deliberately built on different rules models:

- **NPC characters** are built with player-character creation and progression
  rules — a real class, a real level, real choices at every level-up.
- **Enemy creatures** are built with the creature/stat-block model. Monsters are
  never forced through character rules.

Encounter building, quests, maps, initiative and combat simulation are out of
scope. This tool answers "what is this entity, exactly?" — something else
decides which entities exist.

## Running it

Native ES modules need an HTTP origin, so opening `index.html` from disk will
not work:

```sh
python3 -m http.server 8792
# open http://localhost:8792
```

On GitHub Pages just push — Pages serves over HTTPS, which is all the modules
need.

## The one architectural rule

> Generate legal choices first, derive statistics from those choices, then
> independently validate the finished sheet.

Never a random AC, a random hit point total, a random attack bonus, or a level
and CR written on top of numbers that were picked to look plausible.

```
ruleset -> legal build choices -> features/equipment/spells
        -> derived statistics -> independent validator -> complete sheet
```

Randomness chooses among legal possibilities. Randomness never determines
legality.

Concretely: the equipment builder computes the resulting AC for every suit of
armour the character is actually proficient with — including any unarmoured
defence feature — and takes the best. A monk ends up unarmoured because the
number is higher, not because a rule somewhere says "monks wear no armour".
The AC on the sheet is then whatever that choice produced.

## Determinism

For a fixed `seed + spec + reroll state + generator version + ruleset version +
content pack versions`, the canonical JSON is byte-identical. `tools/verify.mjs
seeds` holds eleven golden fixtures to that standard.

Every random choice comes from a **named stream**, derived from
`hash(seed | namespace | rerollCounter)` — never from one shared sequence:

```
npc:identity  npc:species  npc:class      npc:background  npc:abilities
npc:skills    npc:equipment  npc:spells   npc:personality

enemy:base    enemy:features  enemy:actions  enemy:equipment
enemy:spells  enemy:personality
```

That is what makes selective rerolls honest. Rerolling personality bumps one
counter and moves one stream; the character's AC, hit points, equipment and
spells are bit-for-bit unchanged. Adding a new personality roll to the code
later cannot shift a single mechanical value either, which is the property that
matters most as the project grows.

| Reroll scope | Streams it touches |
| --- | --- |
| `identity` | name, pronouns, appearance |
| `personality` | disposition, bonds, tactics |
| `skills` / `equipment` / `spells` | that stage only |
| `abilities` | abilities, and everything downstream of them |
| `build` | species, class, background and everything after |
| `everything` | all of them |

## Independent validation

A sheet is not finished until a validator that shares no code with the builder
recomputes it from the recorded choices and agrees. `src/sheets/character/validator.js`
imports no builder — only the rules primitives — and re-derives:

ability modifiers · proficiency bonus · hit points from the class hit die,
Constitution and features · hit dice · AC from the equipped armour · initiative ·
movement · every saving throw · every skill · every attack bonus, damage die and
damage type · the exact class feature list for the level and subclass · feat
prerequisites · that every proficiency has a source that actually grants it ·
equipment legality (proficiency, Strength requirements, hands, ammunition,
metal-armour restrictions) · spellcasting ability, save DC, attack bonus, slot
table, cantrip and spell counts, and that every spell is on a list the character
can legally draw from.

A result with validation errors is never returned as a sheet. The generator
retries from a *derived* seed — still fully reproducible — and then returns a
structured failure:

```json
{ "code": "cr-policy-unmet", "stage": "variant", "seed": "warped-5",
  "message": "no variant evaluated within one step of CR 5", "validationErrors": [] }
```

For creatures normalised from a published stat block the strongest check
available is **fidelity**: AC, hit points, formula, size, type, CR, every
ability score, and every action's attack bonus and damage dice must still match
the source exactly. Normalisation must never quietly "fix" a printed value.

## Explainability

Major derived numbers carry the parts they were assembled from, so the sheet can
answer questions rather than just assert:

```
Armor Class 20    Plate Armor 18 · Shield +2
Hit Points 66     Cleric hit die (level 1) 8 · levels 2-9 at 5 each +40 · Constitution +2 x 9 levels +18
Shortsword +7     Dexterity +4 · proficiency bonus +3
Spell save DC 17  base 8 · Wisdom +5 · proficiency bonus +4
```

The Inspector tab goes further: the build plan, the scored candidate pools for
class, species and background (with the share each had of the weighted draw),
the ability assignment before and after species adjustments, every level-up
choice, and the list of streams actually drawn from.

## Enemy modes

| Mode | What it does | Trustworthiness |
| --- | --- | --- |
| **Existing** | Finds the best real creature for the request and normalises it | Highest — mechanics are never altered |
| **Variant** | Applies documented transforms to a real creature, then re-rates it | Depends on the CR model |
| **Generated** | Builds original mechanics against the CR bands, then re-rates them | Depends on the CR model |

Existing was built first and is the default, exactly because the other two are
only as good as CR evaluation.

Asking for "undead, CR 3, crypt" and getting a CR 4 Ghost produces a note:

> requested CR 3; the closest match in the enabled content is Ghost at CR 4.
> Source mechanics were not altered to force the requested rating.

Variants and generated creatures are always labelled as generated game content
and never presented as official D&D creatures. If no variant lands within one
step of the requested CR after eight attempts, the generator declines rather
than mislabelling a stat block.

## The CR model, and how far to trust it

The SRD does not publish monster-building guidelines, so `src/rules/srd51/challenge.js`
is an explicit **project-defined** evaluation model:

- **Defensive CR** from effective hit points (scaled for resistances, immunities,
  condition immunities and a caster's own defensive spells), shifted by how far
  AC sits from the band's expectation.
- **Offensive CR** from expected damage per round over three rounds — multiattack
  multiplied, recharge actions weighted at their availability, non-damaging
  control actions credited at 40% of the best attack, spellcasting estimated
  from the highest spell level — shifted by attack bonus or save DC.
- **Evaluated CR** is the average, snapped to the CR ladder.

`node tools/verify.mjs cr` runs it over every creature in the pack and reports
the drift against the printed ratings. That regression is the only real evidence
the model is worth anything on a creature that was never printed:

```
68 creatures | mean delta -0.39 | mean |delta| 0.75 | median |delta| 0.5
within 1 CR: 56/68   within 2 CR: 67/68
```

The known weak spots are visible in that report and are honest limitations, not
bugs to paper over: NPC spellcasters (a Mage rates low because "has fireball"
and "has wall of force" look identical to the model) and creatures whose rating
comes from a trait the model does not score. Every evaluation carries its
assumptions with it, and existing creatures always keep their printed CR — the
evaluation is shown in the Inspector as information, never as authority.

## Content and licensing

Two packs, kept deliberately separate so it is always clear which is which:

| Pack | Contents | Licence |
| --- | --- | --- |
| `srd51` | 9 species, 12 classes with full 1–20 progression, 218 spells, 37 weapons, 13 armours, 68 creatures, skills, languages, the SRD's one feat, the Acolyte background | CC-BY-4.0 |
| `openflavor` | 10 backgrounds, name tables, personality tables, NPC archetypes | CC0-1.0 |

Every entity carries `{packId, sourceId, version, license}`, every sheet records
which packs contributed to it, and the exported Markdown and JSON both carry the
attribution notice the licence requires.

> This work includes material from the System Reference Document 5.1 ("SRD 5.1")
> by Wizards of the Coast LLC, available at
> https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
> licensed under the Creative Commons Attribution 4.0 International License.

The bestiary and spell list are a curated subset of the SRD, not the whole of
it — chosen to span every challenge rating from 0 to 17, every creature type
the generator filters on, and enough of each class list to fill a level-20
caster. Nothing non-SRD is included: no proprietary monsters, subclasses, feats,
spells, magic items or adventure NPCs. The rules model is SRD 5.1 (2014
mechanics: species ability score increases, standard array or point buy).

## Layout

```
index.html  style.css
src/
  core/       rng.js (namespaced streams)  ids.js (stable ids, canonical JSON)
              validation.js (issue collection)  version.js
  rules/srd51/  abilities  proficiency  progression  combat  challenge
  content/    schema.js  registry.js  packs/
  sheets/
    character/  spec  build-planner  ability-builder  class-builder
                skill-builder  equipment-builder  spell-builder  derived
                generator  validator
    creature/   spec  normalizer  cr-evaluator  variant-builder
                generated-builder  generator  validator
    narrative/  personality.js
  export/     json.js  markdown.js
  api.js      generateCharacter · generateCreature · generateSheets · reroll
  ui/         app  controls  sheetview  inspector
tools/
  verify.mjs  fixtures/golden.json
```

The rules layer knows nothing about generation; the generators know nothing
about the UI; the validators import no builder. Content is data, and the
registry is the only thing that reads a pack file.

## API

```js
import { generateCharacter, generateCreature, generateSheets, toMarkdown } from './src/api.js';

const captain = generateCharacter({
  seed: 'ember-raven-4172', level: 5, role: 'scout', theme: 'Forest Guide',
});

const enemy = generateCreature({
  seed: 'crypt-warden-882', mode: 'existing',
  targetCR: 3, family: 'undead', environment: 'crypt',
});

const party = generateSheets([
  { kind: 'character', label: 'captain', spec: { level: 5, role: 'warrior' } },
  { kind: 'character', label: 'guard', count: 4, spec: { level: 2, role: 'guardian', named: false } },
  { kind: 'creature', label: 'enemy', count: 3, spec: { mode: 'existing', targetCR: 2 } },
], { seed: 'encounter-77' });
```

Each batch entity gets a deterministic child seed, so re-requesting one alone
reproduces it exactly. Anonymous group members are numbered from the group's
label — `Guard 1`, `Guard 2`, `Guard 3`.

Results are `{ok: true, sheet, validation, inspector}` or `{ok: false, failure}`.

## Verification

```sh
node tools/verify.mjs            # everything
node tools/verify.mjs content    # pack schemas, references, provenance, reachability
node tools/verify.mjs rng        # determinism and stream isolation
node tools/verify.mjs rules      # rules-math invariants
node tools/verify.mjs sheets     # generate and validate a broad sweep
node tools/verify.mjs cr         # CR model drift against the bestiary
node tools/verify.mjs seeds      # golden-seed regression (--update to rewrite)
node tools/verify.mjs stats      # statistical generation over 1500 seeds
```

The full run covers 477 content entities, every class at every level from 1 to
20, all three ability methods and both hit point policies, all 68 bundled
creatures normalised and checked for fidelity, 756 generated creatures across
every type, role and rating, and 1500 statistical seeds — checking that every
class, species, background and role is reachable, that none dominates, that
every returned sheet has zero validation errors, and that the internal retry
rate stays near zero.

## Saving and loading

JSON is canonical and lossless: schema version, spec, generation manifest, the
complete sheet, the validation summary and the attribution. Loading a file shows
the sheet **as stored** — it is a record of what was generated, not a request to
generate it again. Regeneration from a stored spec is a separate, explicit
operation, because a newer generator version may legitimately produce something
different.
