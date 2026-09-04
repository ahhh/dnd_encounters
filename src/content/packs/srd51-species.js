// SRD 5.1 species.
//
// Ability adjustments and traits are structured, never prose: the sheet builder
// reads `abilityAdjustments` to compute scores and `traits[].modifiers` to
// compute HP, AC, senses and proficiencies, and the validator re-reads exactly
// the same fields to check the results. Descriptions are for the reader only.

const DARKVISION = (range) => ({ type: 'sense', sense: 'darkvision', range });

export const SPECIES = [
  {
    slug: 'dwarf-hill', name: 'Hill Dwarf', size: 'Medium', speed: 25,
    abilityAdjustments: [{ ability: 'con', value: 2 }, { ability: 'wis', value: 1 }],
    languages: ['srd51:language.common', 'srd51:language.dwarvish'],
    traits: [
      { name: 'Darkvision', description: 'See in dim light within 60 feet as if bright light, and in darkness as if dim light.', modifiers: [DARKVISION(60)] },
      { name: 'Dwarven Resilience', description: 'Advantage on saving throws against poison, and resistance against poison damage.', modifiers: [{ type: 'resistance', damage: 'poison' }] },
      { name: 'Dwarven Combat Training', description: 'Proficiency with the battleaxe, handaxe, light hammer, and warhammer.', modifiers: [{ type: 'weapon-proficiency', ids: ['srd51:weapon.battleaxe', 'srd51:weapon.handaxe', 'srd51:weapon.light-hammer', 'srd51:weapon.warhammer'] }] },
      { name: 'Stonecunning', description: 'Treated as proficient with History and double proficiency bonus for checks about stonework.', modifiers: [] },
      { name: 'Dwarven Toughness', description: 'Hit point maximum increases by 1, and by 1 every level thereafter.', modifiers: [{ type: 'hp-per-level', value: 1 }] },
    ],
  },
  {
    slug: 'elf-high', name: 'High Elf', size: 'Medium', speed: 30,
    abilityAdjustments: [{ ability: 'dex', value: 2 }, { ability: 'int', value: 1 }],
    languages: ['srd51:language.common', 'srd51:language.elvish'],
    extraLanguages: 1,
    traits: [
      { name: 'Darkvision', description: 'See in dim light within 60 feet as if bright light, and in darkness as if dim light.', modifiers: [DARKVISION(60)] },
      { name: 'Keen Senses', description: 'Proficiency in the Perception skill.', modifiers: [{ type: 'skill-proficiency', ids: ['srd51:skill.perception'] }] },
      { name: 'Fey Ancestry', description: 'Advantage on saving throws against being charmed, and magic cannot put you to sleep.', modifiers: [{ type: 'condition-advantage', condition: 'charmed' }] },
      { name: 'Trance', description: 'Meditate deeply for 4 hours instead of sleeping for 8.', modifiers: [] },
      { name: 'Elf Weapon Training', description: 'Proficiency with the longsword, shortsword, shortbow, and longbow.', modifiers: [{ type: 'weapon-proficiency', ids: ['srd51:weapon.longsword', 'srd51:weapon.shortsword', 'srd51:weapon.shortbow', 'srd51:weapon.longbow'] }] },
      { name: 'Cantrip', description: 'You know one cantrip of your choice from the wizard spell list. Intelligence is your spellcasting ability for it.', modifiers: [{ type: 'bonus-cantrip', classSlug: 'wizard', ability: 'int', count: 1 }] },
    ],
  },
  {
    slug: 'halfling-lightfoot', name: 'Lightfoot Halfling', size: 'Small', speed: 25,
    abilityAdjustments: [{ ability: 'dex', value: 2 }, { ability: 'cha', value: 1 }],
    languages: ['srd51:language.common', 'srd51:language.halfling'],
    traits: [
      { name: 'Lucky', description: 'When you roll a 1 on an attack roll, ability check, or saving throw, you can reroll and must use the new roll.', modifiers: [] },
      { name: 'Brave', description: 'Advantage on saving throws against being frightened.', modifiers: [{ type: 'condition-advantage', condition: 'frightened' }] },
      { name: 'Halfling Nimbleness', description: 'Move through the space of any creature of a size larger than yours.', modifiers: [] },
      { name: 'Naturally Stealthy', description: 'Attempt to hide even when obscured only by a creature at least one size larger.', modifiers: [] },
    ],
  },
  {
    slug: 'human', name: 'Human', size: 'Medium', speed: 30,
    abilityAdjustments: [
      { ability: 'str', value: 1 }, { ability: 'dex', value: 1 }, { ability: 'con', value: 1 },
      { ability: 'int', value: 1 }, { ability: 'wis', value: 1 }, { ability: 'cha', value: 1 },
    ],
    languages: ['srd51:language.common'],
    extraLanguages: 1,
    traits: [],
  },
  {
    slug: 'dragonborn', name: 'Dragonborn', size: 'Medium', speed: 30,
    abilityAdjustments: [{ ability: 'str', value: 2 }, { ability: 'cha', value: 1 }],
    languages: ['srd51:language.common', 'srd51:language.draconic'],
    ancestries: [
      { name: 'Black', damage: 'acid', shape: '5 by 30 ft. line', save: 'dex' },
      { name: 'Blue', damage: 'lightning', shape: '5 by 30 ft. line', save: 'dex' },
      { name: 'Brass', damage: 'fire', shape: '5 by 30 ft. line', save: 'dex' },
      { name: 'Bronze', damage: 'lightning', shape: '5 by 30 ft. line', save: 'dex' },
      { name: 'Copper', damage: 'acid', shape: '5 by 30 ft. line', save: 'dex' },
      { name: 'Gold', damage: 'fire', shape: '15 ft. cone', save: 'dex' },
      { name: 'Green', damage: 'poison', shape: '15 ft. cone', save: 'con' },
      { name: 'Red', damage: 'fire', shape: '15 ft. cone', save: 'dex' },
      { name: 'Silver', damage: 'cold', shape: '15 ft. cone', save: 'con' },
      { name: 'White', damage: 'cold', shape: '15 ft. cone', save: 'con' },
    ],
    traits: [
      { name: 'Draconic Ancestry', description: 'Your breath weapon and damage resistance are determined by your draconic ancestry.', modifiers: [{ type: 'choose-ancestry' }] },
      { name: 'Breath Weapon', description: 'Exhale destructive energy in the shape set by your ancestry. Each creature in the area makes a saving throw against DC 8 + your Constitution modifier + your proficiency bonus, taking 2d6 damage on a failure (increasing at 6th, 11th, and 16th level) and half on a success. Recharges on a short or long rest.', modifiers: [{ type: 'breath-weapon' }] },
      { name: 'Damage Resistance', description: 'Resistance to the damage type of your draconic ancestry.', modifiers: [{ type: 'ancestry-resistance' }] },
    ],
  },
  {
    slug: 'gnome-rock', name: 'Rock Gnome', size: 'Small', speed: 25,
    abilityAdjustments: [{ ability: 'int', value: 2 }, { ability: 'con', value: 1 }],
    languages: ['srd51:language.common', 'srd51:language.gnomish'],
    traits: [
      { name: 'Darkvision', description: 'See in dim light within 60 feet as if bright light, and in darkness as if dim light.', modifiers: [DARKVISION(60)] },
      { name: 'Gnome Cunning', description: 'Advantage on Intelligence, Wisdom, and Charisma saving throws against magic.', modifiers: [] },
      { name: "Artificer's Lore", description: 'Add twice your proficiency bonus to History checks about magic items, alchemical objects, or technological devices.', modifiers: [] },
      { name: 'Tinker', description: "Proficiency with tinker's tools; spend 1 hour and 10 gp to construct a tiny clockwork device.", modifiers: [{ type: 'tool-proficiency', names: ["Tinker's tools"] }] },
    ],
  },
  {
    slug: 'half-elf', name: 'Half-Elf', size: 'Medium', speed: 30,
    abilityAdjustments: [{ ability: 'cha', value: 2 }],
    flexibleAdjustments: { count: 2, value: 1, exclude: ['cha'] },
    languages: ['srd51:language.common', 'srd51:language.elvish'],
    extraLanguages: 1,
    traits: [
      { name: 'Darkvision', description: 'See in dim light within 60 feet as if bright light, and in darkness as if dim light.', modifiers: [DARKVISION(60)] },
      { name: 'Fey Ancestry', description: 'Advantage on saving throws against being charmed, and magic cannot put you to sleep.', modifiers: [{ type: 'condition-advantage', condition: 'charmed' }] },
      { name: 'Skill Versatility', description: 'Proficiency in two skills of your choice.', modifiers: [{ type: 'skill-choice', count: 2 }] },
    ],
  },
  {
    slug: 'half-orc', name: 'Half-Orc', size: 'Medium', speed: 30,
    abilityAdjustments: [{ ability: 'str', value: 2 }, { ability: 'con', value: 1 }],
    languages: ['srd51:language.common', 'srd51:language.orc'],
    traits: [
      { name: 'Darkvision', description: 'See in dim light within 60 feet as if bright light, and in darkness as if dim light.', modifiers: [DARKVISION(60)] },
      { name: 'Menacing', description: 'Proficiency in the Intimidation skill.', modifiers: [{ type: 'skill-proficiency', ids: ['srd51:skill.intimidation'] }] },
      { name: 'Relentless Endurance', description: 'When reduced to 0 hit points without being killed outright, drop to 1 hit point instead. Once per long rest.', modifiers: [] },
      { name: 'Savage Attacks', description: 'On a critical hit with a melee weapon, roll one of the weapon damage dice one additional time.', modifiers: [] },
    ],
  },
  {
    slug: 'tiefling', name: 'Tiefling', size: 'Medium', speed: 30,
    abilityAdjustments: [{ ability: 'int', value: 1 }, { ability: 'cha', value: 2 }],
    languages: ['srd51:language.common', 'srd51:language.infernal'],
    traits: [
      { name: 'Darkvision', description: 'See in dim light within 60 feet as if bright light, and in darkness as if dim light.', modifiers: [DARKVISION(60)] },
      { name: 'Hellish Resistance', description: 'Resistance to fire damage.', modifiers: [{ type: 'resistance', damage: 'fire' }] },
      {
        name: 'Infernal Legacy',
        description: 'You know the thaumaturgy cantrip. At 3rd level you can cast hellish rebuke as a 2nd-level spell once per long rest; at 5th level you can cast darkness once per long rest. Charisma is your spellcasting ability for these spells.',
        modifiers: [{
          type: 'innate-spells', ability: 'cha', grants: [
            { spellId: 'srd51:spell.thaumaturgy', minLevel: 1, atWill: true },
            { spellId: 'srd51:spell.hellish-rebuke', minLevel: 3, uses: 1, castAtLevel: 2 },
            { spellId: 'srd51:spell.darkness', minLevel: 5, uses: 1 },
          ],
        }],
      },
    ],
  },
];
