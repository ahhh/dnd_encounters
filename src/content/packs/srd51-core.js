// SRD 5.1 core tables: skills, languages, feats.
//
// Short, structural, and referenced by id from everywhere else. Skills carry
// their governing ability because the validator recomputes every skill modifier
// from the ability score rather than trusting the number on the sheet.

export const SKILLS = [
  { slug: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { slug: 'animal-handling', name: 'Animal Handling', ability: 'wis' },
  { slug: 'arcana', name: 'Arcana', ability: 'int' },
  { slug: 'athletics', name: 'Athletics', ability: 'str' },
  { slug: 'deception', name: 'Deception', ability: 'cha' },
  { slug: 'history', name: 'History', ability: 'int' },
  { slug: 'insight', name: 'Insight', ability: 'wis' },
  { slug: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { slug: 'investigation', name: 'Investigation', ability: 'int' },
  { slug: 'medicine', name: 'Medicine', ability: 'wis' },
  { slug: 'nature', name: 'Nature', ability: 'int' },
  { slug: 'perception', name: 'Perception', ability: 'wis' },
  { slug: 'performance', name: 'Performance', ability: 'cha' },
  { slug: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { slug: 'religion', name: 'Religion', ability: 'int' },
  { slug: 'sleight-of-hand', name: 'Sleight of Hand', ability: 'dex' },
  { slug: 'stealth', name: 'Stealth', ability: 'dex' },
  { slug: 'survival', name: 'Survival', ability: 'wis' },
];

export const LANGUAGES = [
  { slug: 'common', name: 'Common', script: 'Common', exotic: false },
  { slug: 'dwarvish', name: 'Dwarvish', script: 'Dwarvish', exotic: false },
  { slug: 'elvish', name: 'Elvish', script: 'Elvish', exotic: false },
  { slug: 'giant', name: 'Giant', script: 'Dwarvish', exotic: false },
  { slug: 'gnomish', name: 'Gnomish', script: 'Dwarvish', exotic: false },
  { slug: 'goblin', name: 'Goblin', script: 'Dwarvish', exotic: false },
  { slug: 'halfling', name: 'Halfling', script: 'Common', exotic: false },
  { slug: 'orc', name: 'Orc', script: 'Dwarvish', exotic: false },
  { slug: 'abyssal', name: 'Abyssal', script: 'Infernal', exotic: true },
  { slug: 'celestial', name: 'Celestial', script: 'Celestial', exotic: true },
  { slug: 'draconic', name: 'Draconic', script: 'Draconic', exotic: true },
  { slug: 'deep-speech', name: 'Deep Speech', script: '—', exotic: true },
  { slug: 'infernal', name: 'Infernal', script: 'Infernal', exotic: true },
  { slug: 'primordial', name: 'Primordial', script: 'Dwarvish', exotic: true },
  { slug: 'sylvan', name: 'Sylvan', script: 'Elvish', exotic: true },
  { slug: 'undercommon', name: 'Undercommon', script: 'Elvish', exotic: true },
];

/**
 * The SRD contains exactly one feat. Rather than invent proprietary-adjacent
 * ones, the character builder spends almost every Ability Score Improvement on
 * ability scores and treats this as the sole feat option -- which keeps every
 * generated build strictly legal under the licensed ruleset.
 */
export const FEATS = [
  {
    slug: 'grappler',
    name: 'Grappler',
    description:
      'You have advantage on attack rolls against a creature you are grappling, '
      + 'and you can use an action to try to pin a creature grappled by you.',
    prerequisites: [{ type: 'ability', ability: 'str', min: 13 }],
    modifiers: [],
  },
];

/**
 * The SRD publishes one background. It lives here with the rest of the licensed
 * content; the project-authored backgrounds are a separate pack with a separate
 * licence, so a user can tell at a glance which is which.
 */
export const BACKGROUNDS = [
  {
    slug: 'acolyte', name: 'Acolyte',
    description: 'You have spent your life in the service of a temple, acting as an intermediary between the realm of the holy and the mortal world.',
    skills: ['srd51:skill.insight', 'srd51:skill.religion'],
    languages: [], languageChoices: 2,
    toolProficiencies: [],
    equipment: ['srd51:gear.holy-symbol', 'srd51:gear.priests-pack'],
    startingGold: 1500,
    feature: { name: 'Shelter of the Faithful', description: 'You and your companions can receive free healing and care at a temple of your faith, and the temple will support you modestly.' },
    themes: ['temple', 'faith', 'scholar'],
  },
];
