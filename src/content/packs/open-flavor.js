// Project-authored flavour content.
//
// Deliberately a separate pack from `srd51` with its own licence, because the
// boundary matters: everything here was written for this project and can be
// edited, translated, or replaced freely, while the SRD pack cannot. Nothing in
// this file carries mechanical weight beyond the background proficiencies --
// personality is generated from a stream that no derived statistic reads.

const bg = (slug, name, skills, o = {}) => ({
  slug, name,
  description: o.description || '',
  skills: skills.map((s) => `srd51:skill.${s}`),
  languages: [],
  languageChoices: o.languageChoices ?? 0,
  toolProficiencies: o.tools || [],
  equipment: o.equipment || ['srd51:gear.explorers-pack'],
  startingGold: o.gold ?? 1500,
  feature: o.feature,
  themes: o.themes || [],
});

export const BACKGROUNDS = [
  bg('watch-veteran', 'Watch Veteran', ['athletics', 'intimidation'], {
    description: 'You kept order on a city wall or a garrison gate long enough to know which fights are worth having.',
    equipment: ['srd51:gear.dungeoneers-pack', 'srd51:gear.manacles'],
    feature: { name: 'Old Post', description: 'Guards and soldiers recognise your bearing. You can usually get a hearing from the local watch, and you know where their patrols thin out.' },
    themes: ['soldier', 'urban', 'law'],
  }),
  bg('wilderness-guide', 'Wilderness Guide', ['survival', 'nature'], {
    description: 'You led travellers through country that kills the unprepared, and you have the scars that taught you the routes.',
    tools: ['Herbalism kit'],
    equipment: ['srd51:gear.explorers-pack', 'srd51:gear.hunting-trap'],
    feature: { name: 'Read the Country', description: 'You can find shelter, water, and a defensible camp in any terrain you have travelled before, and you always know roughly where north is.' },
    themes: ['wilderness', 'scout', 'forest'],
  }),
  bg('street-runner', 'Street Runner', ['sleight-of-hand', 'stealth'], {
    description: 'You grew up moving goods and messages through alleys that do not appear on any map.',
    tools: ["Thieves' tools"],
    equipment: ['srd51:gear.burglars-pack', 'srd51:gear.thieves-tools'],
    gold: 1000,
    feature: { name: 'Back Ways', description: 'In any settlement you have spent a week in, you can find an unwatched route between two points, and you know who to pay to be forgotten.' },
    themes: ['urban', 'criminal', 'scout'],
  }),
  bg('cloister-scholar', 'Cloister Scholar', ['arcana', 'history'], {
    description: 'You spent years in a library, and you can still smell the dust when you think hard.',
    languageChoices: 2,
    equipment: ['srd51:gear.scholars-pack'],
    feature: { name: 'Where to Look', description: 'Even when you do not know an answer, you know which archive, sage, or ruin would hold it.' },
    themes: ['scholar', 'arcane', 'temple'],
  }),
  bg('caravan-guard', 'Caravan Guard', ['perception', 'animal-handling'], {
    description: 'You have crossed the same four hundred miles of road so many times you know every ambush point on it.',
    equipment: ['srd51:gear.explorers-pack', 'srd51:gear.rope-hempen'],
    feature: { name: 'Road Sense', description: 'You know the trade roads of your home region: the safe inns, the bad fords, and which tolls can be argued down.' },
    themes: ['road', 'soldier', 'travel'],
  }),
  bg('temple-almoner', 'Temple Almoner', ['medicine', 'persuasion'], {
    description: 'You handed out bread and bandages at a shrine door, and heard everything the desperate say.',
    equipment: ['srd51:gear.priests-pack', 'srd51:gear.healers-kit'],
    feature: { name: 'Charitable Welcome', description: 'The poor of any town will speak to you where they would not speak to an official, and temples of most faiths will shelter you for a night.' },
    themes: ['temple', 'faith', 'healer', 'urban'],
  }),
  bg('travelling-player', 'Travelling Player', ['performance', 'deception'], {
    description: 'You worked a stage made of two carts and a plank, and learned to read a crowd before it read you.',
    tools: ['One musical instrument of your choice'],
    equipment: ['srd51:gear.entertainers-pack', 'srd51:gear.disguise-kit'],
    feature: { name: 'Play to the Room', description: 'You can earn a night’s food and lodging in most settlements by performing, and you can tell within a minute what an audience wants to hear.' },
    themes: ['face', 'urban', 'travel'],
  }),
  bg('grave-tender', 'Grave Tender', ['religion', 'investigation'], {
    description: 'You kept the boneyard: dug, sealed, and salted, and noticed which graves did not stay shut.',
    equipment: ['srd51:gear.priests-pack', 'srd51:gear.torch'],
    feature: { name: 'Rites of the Dead', description: 'You know the burial customs of several peoples, and you can tell a natural grave from a disturbed one at a glance.' },
    themes: ['crypt', 'faith', 'undead'],
  }),
  bg('dockhand', 'Dockhand', ['athletics', 'perception'], {
    description: 'You loaded hulls in the rain for a decade, and heard every rumour that came off a ship.',
    tools: ["Navigator's tools"],
    equipment: ['srd51:gear.explorers-pack', 'srd51:gear.rope-hempen'],
    gold: 1000,
    feature: { name: 'Harbour Talk', description: 'You can find passage on a working ship in most ports, and you hear news from distant coasts before the criers do.' },
    themes: ['coast', 'urban', 'travel'],
  }),
  bg('court-attendant', 'Court Attendant', ['insight', 'persuasion'], {
    description: 'You stood at the edge of a hall where decisions were made, and learned exactly how much of it was theatre.',
    languageChoices: 1,
    equipment: ['srd51:gear.scholars-pack'],
    gold: 2500,
    feature: { name: 'Protocol', description: 'You know how to address, flatter, and delay the powerful, and you can usually talk your way into a hall you have no business being in.' },
    themes: ['face', 'urban', 'noble'],
  }),
];

/**
 * Name tables. Split by cultural register rather than by species so that any
 * species can plausibly draw from any of them -- the generator picks a register
 * from the species by default but a theme can override it.
 */
export const NAME_TABLES = [
  { slug: 'names-common-personal', name: 'Common Personal Names', register: 'common', kind: 'personal', entries: ['Aldis', 'Bryn', 'Cassa', 'Doren', 'Edda', 'Fenn', 'Garrick', 'Hessa', 'Ivor', 'Jenna', 'Kael', 'Lyra', 'Marrow', 'Nessa', 'Orrin', 'Petra', 'Quill', 'Rowan', 'Sable', 'Tolan', 'Ursa', 'Vance', 'Wren', 'Yorick', 'Zeph', 'Cordell', 'Merrin', 'Halvard', 'Isolde', 'Brannock'] },
  { slug: 'names-common-family', name: 'Common Family Names', register: 'common', kind: 'family', entries: ['Ashfall', 'Bellweather', 'Cartwright', 'Dunmore', 'Emberly', 'Fairholt', 'Greave', 'Hollowbrook', 'Ironmonger', 'Karsley', 'Lockridge', 'Marchbank', 'Netherby', 'Oakhurst', 'Pyle', 'Quarry', 'Ravenhill', 'Stonewell', 'Thorne', 'Underhill', 'Vance', 'Wildecarr', 'Yarrow', 'Blackbriar', 'Copperkettle'] },
  { slug: 'names-dwarven', name: 'Dwarven Names', register: 'dwarven', kind: 'personal', entries: ['Baern', 'Dagnal', 'Eberk', 'Fargrim', 'Gunnloda', 'Harbek', 'Ilde', 'Kathra', 'Morgran', 'Nalral', 'Orsik', 'Riswynn', 'Rurik', 'Torbera', 'Ulfgar', 'Vistra', 'Whurbin', 'Amber', 'Bardryn', 'Dorn'] },
  { slug: 'names-dwarven-clan', name: 'Dwarven Clan Names', register: 'dwarven', kind: 'family', entries: ['Balderk', 'Dankil', 'Fireforge', 'Gorunn', 'Holderhek', 'Ironfist', 'Loderr', 'Lutgehr', 'Rumnaheim', 'Strakeln', 'Torunn', 'Ungart'] },
  { slug: 'names-elven', name: 'Elven Names', register: 'elven', kind: 'personal', entries: ['Adran', 'Aelar', 'Berrian', 'Caelynn', 'Dayereth', 'Enna', 'Galinndan', 'Hadarai', 'Immeral', 'Ivellios', 'Keyleth', 'Laucian', 'Mindartis', 'Naal', 'Paelias', 'Quarion', 'Riardon', 'Silvyr', 'Thamior', 'Varis'] },
  { slug: 'names-elven-family', name: 'Elven Family Names', register: 'elven', kind: 'family', entries: ['Amakiir', 'Amastacia', 'Galanodel', 'Holimion', 'Ilphelkiir', 'Liadon', 'Meliamne', 'Naïlo', 'Siannodel', 'Xiloscient'] },
  { slug: 'names-halfling', name: 'Halfling Names', register: 'halfling', kind: 'personal', entries: ['Alton', 'Bree', 'Cade', 'Callie', 'Eldon', 'Euphemia', 'Finnan', 'Garret', 'Jillian', 'Lyle', 'Merla', 'Milo', 'Nedda', 'Osborn', 'Paela', 'Perrin', 'Roscoe', 'Seraphina', 'Verna', 'Wellby'] },
  { slug: 'names-halfling-family', name: 'Halfling Family Names', register: 'halfling', kind: 'family', entries: ['Brushgather', 'Goodbarrel', 'Greenbottle', 'High-hill', 'Hilltopple', 'Leagallow', 'Tealeaf', 'Thorngage', 'Tosscobble', 'Underbough'] },
  { slug: 'names-orcish', name: 'Orcish Names', register: 'orcish', kind: 'personal', entries: ['Dench', 'Feng', 'Gell', 'Henk', 'Holg', 'Imsh', 'Keth', 'Krusk', 'Mhurren', 'Ront', 'Shump', 'Thokk', 'Baggi', 'Emen', 'Engong', 'Myev', 'Neega', 'Ovak', 'Sutha', 'Vola'] },
  { slug: 'names-infernal', name: 'Infernal Names', register: 'infernal', kind: 'personal', entries: ['Akmenos', 'Amnon', 'Barakas', 'Damakos', 'Ekemon', 'Iados', 'Kairon', 'Leucis', 'Melech', 'Mordai', 'Morthos', 'Pelaios', 'Skamos', 'Therai', 'Akta', 'Bryseis', 'Criella', 'Ea', 'Kallista', 'Nemeia', 'Orianna', 'Rieta'] },
  { slug: 'names-draconic', name: 'Draconic Names', register: 'draconic', kind: 'personal', entries: ['Arjhan', 'Balasar', 'Donaar', 'Ghesh', 'Kriv', 'Medrash', 'Nadarr', 'Pandjed', 'Rhogar', 'Shamash', 'Torinn', 'Akra', 'Biri', 'Farideh', 'Harann', 'Kava', 'Mishann', 'Nala', 'Sora', 'Thava'] },
  { slug: 'names-gnomish', name: 'Gnomish Names', register: 'gnomish', kind: 'personal', entries: ['Alston', 'Boddynock', 'Dimble', 'Fonkin', 'Gerbo', 'Jebeddo', 'Namfoodle', 'Roondar', 'Seebo', 'Zook', 'Bimpnottin', 'Caramip', 'Ellywick', 'Loopmottin', 'Mardnab', 'Nissa', 'Oda', 'Roywyn', 'Waywocket', 'Zanna'] },
  { slug: 'names-epithet', name: 'Epithets', register: 'any', kind: 'epithet', entries: ['the Quiet', 'the Twice-Buried', 'Longshanks', 'Ashhand', 'the Patient', 'One-Ear', 'the Debtor', 'Coldwater', 'the Unlucky', 'Sharpcoin', 'the Younger', 'Nightwalker', 'the Blunt', 'Ratcatcher', 'Threefingers', 'the Devout', 'Saltbeard', 'the Late', 'Ironjaw', 'the Merciful'] },
];

/** Personality tables. Every roll here draws from an isolated stream. */
export const PERSONALITY_TABLES = [
  { slug: 'disposition', name: 'Disposition', entries: ['guarded', 'openly friendly', 'brusque', 'watchful', 'weary', 'eager to please', 'quietly amused', 'formal', 'restless', 'unbothered', 'impatient', 'melancholy', 'sharp-tongued', 'earnest', 'unreadable', 'gently mocking'] },
  { slug: 'motivation', name: 'Motivation', entries: ['pay off a debt that is not theirs', 'be taken seriously by people who matter', 'get far away from the last town', 'keep one specific person alive', 'finish work someone else abandoned', 'prove a rumour about themselves is false', 'earn enough to stop doing this', 'find out who gave the order', 'be forgiven', 'protect a secret that would ruin them', 'see something no one has seen', 'outlive their reputation'] },
  { slug: 'ideal', name: 'Ideal', entries: ['A promise made is a debt owed.', 'Power should answer to somebody.', 'Everything is negotiable, including this.', 'The work matters more than who gets credit.', 'Mercy costs nothing and buys a great deal.', 'Order is what keeps people fed.', 'No one should be owned.', 'Knowledge hoarded is knowledge wasted.', 'Blood is the only contract that holds.', 'Take what the strong will not defend.'] },
  { slug: 'bond', name: 'Bond', entries: ['a sibling they have not written to in years', 'the town that took them in', 'a mentor who died badly', 'a debt to a moneylender in a city three weeks away', 'a child they send money to', 'the company they served with', 'a shrine they swore an oath at', 'a map they have never been able to follow', 'the person who saved their life once', 'a grave they visit every spring'] },
  { slug: 'flaw', name: 'Flaw', entries: ['cannot leave an insult alone', 'lies reflexively about small things', 'drinks when it is a bad idea', 'trusts anyone who flatters their competence', 'freezes when a plan goes wrong', 'cannot resist a wager', 'holds grudges past all usefulness', 'talks too much when nervous', 'gives away money they do not have', 'assumes the worst and acts on it first'] },
  { slug: 'mannerism', name: 'Mannerism', entries: ['taps a ring against whatever is nearest', 'never finishes a sentence about themselves', 'repeats the last two words you said', 'stands too close', 'counts things aloud under their breath', 'always sits facing the door', 'cleans their nails while talking', 'laughs a half-beat late', 'refers to themselves in the third person when angry', 'keeps one hand behind their back', 'answers questions with questions', 'hums when thinking'] },
  { slug: 'voice-cue', name: 'Voice Cue', entries: ['flat and fast', 'a rasp, like an old injury', 'unhurried, almost sleepy', 'over-precise, every consonant landed', 'a border accent they try to hide', 'too loud, always', 'soft enough to make you lean in', 'clipped, military', 'sing-song, mocking', 'a chuckle in every sentence'] },
  { slug: 'wants', name: 'Wants', entries: ['a straight answer', 'to be let go', 'a share, and to be asked properly', 'someone to take the blame with them', 'safe passage out tonight', 'the thing you are carrying', 'a name', 'their reputation back', 'a witness', 'one favour, unspecified, later'] },
  { slug: 'fears', name: 'Fears', entries: ['being made an example of', 'the dark, honestly', 'their employer finding out', 'dying somewhere no one will look', 'being useless', 'the thing under the floor', 'going back', 'being recognised', 'owing anyone anything', 'that they were right'] },
  { slug: 'combat-behavior', name: 'Combat Behaviour', entries: ['fights from cover and gives ground willingly', 'targets whoever is giving orders', 'goes for the nearest enemy and stays there', 'protects one ally above all else', 'opens strong then looks for a way out', 'fights defensively until someone else commits', 'uses terrain and forces enemies to come to them', 'tries to disable rather than kill', 'flanks and refuses a straight fight', 'holds the line and does not move'] },
  { slug: 'surrender-condition', name: 'Surrender Condition', entries: ['surrenders once reduced below half and clearly losing', 'flees rather than surrenders, at the first real wound', 'fights to the death; they have nowhere to go', 'surrenders immediately if the leader falls', 'will parley if addressed by name', 'surrenders only to someone of rank', 'pretends to surrender and looks for an opening', 'gives up the moment payment stops being likely', 'will not surrender while allies are still standing', 'begs for terms as soon as the fight turns'] },
  { slug: 'appearance', name: 'Appearance', entries: ['a badly set broken nose', 'hands stained by their trade', 'expensive boots, everything else worn through', 'a shaved head and a fresh scalp scar', 'braids weighted with small coins', 'one eye milky and blind', 'a burn along the jaw they do not explain', 'immaculate, in a way that reads as effort', 'too thin for their frame', 'a soldier’s posture gone slightly to seed', 'ink on the fingers, always', 'a heavy cloak in any weather'] },
  { slug: 'age-descriptor', name: 'Age', entries: ['barely of age', 'young and untested', 'young but hard-used', 'in their prime', 'settled into middle years', 'greying', 'old, and still dangerous', 'old, and mostly reputation'] },
  { slug: 'occupation', name: 'Occupation Cover', entries: ['carter', 'tanner', 'ferrymaster', 'debt collector', 'chandler', 'hedge doctor', 'tollkeeper', 'stonemason', 'letter-writer', 'gravedigger', 'brewer', 'fishmonger', 'horse dealer', 'sellsword between contracts', 'temple sweeper'] },
];

/** Role hints. Used to bias the build planner toward a coherent shape. */
export const NPC_ARCHETYPES = [
  { slug: 'line-holder', name: 'Line Holder', role: 'guardian', classes: ['fighter', 'paladin'], skills: ['athletics', 'perception'], combatStyle: 'melee-defensive' },
  { slug: 'shock-troop', name: 'Shock Troop', role: 'brute', classes: ['barbarian', 'fighter'], skills: ['athletics', 'intimidation'], combatStyle: 'melee-heavy' },
  { slug: 'pathfinder', name: 'Pathfinder', role: 'scout', classes: ['ranger', 'rogue'], skills: ['stealth', 'survival', 'perception'], combatStyle: 'ranged-skirmish' },
  { slug: 'bowline', name: 'Bowline', role: 'archer', classes: ['ranger', 'fighter'], skills: ['perception', 'stealth'], combatStyle: 'ranged' },
  { slug: 'quiet-professional', name: 'Quiet Professional', role: 'expert', classes: ['rogue', 'bard'], skills: ['stealth', 'investigation', 'sleight-of-hand'], combatStyle: 'finesse-skirmish' },
  { slug: 'negotiator', name: 'Negotiator', role: 'face', classes: ['bard', 'warlock'], skills: ['persuasion', 'deception', 'insight'], combatStyle: 'ranged' },
  { slug: 'field-medic', name: 'Field Medic', role: 'healer', classes: ['cleric', 'druid'], skills: ['medicine', 'insight'], combatStyle: 'support' },
  { slug: 'battle-chaplain', name: 'Battle Chaplain', role: 'divine-caster', classes: ['cleric', 'paladin'], skills: ['religion', 'insight'], combatStyle: 'melee-defensive' },
  { slug: 'hedge-mage', name: 'Hedge Mage', role: 'arcane-caster', classes: ['wizard', 'sorcerer'], skills: ['arcana', 'investigation'], combatStyle: 'ranged' },
  { slug: 'binder', name: 'Binder', role: 'controller', classes: ['wizard', 'druid', 'warlock'], skills: ['arcana', 'nature'], combatStyle: 'ranged' },
  { slug: 'standard-bearer', name: 'Standard Bearer', role: 'support', classes: ['bard', 'cleric'], skills: ['persuasion', 'performance'], combatStyle: 'support' },
  { slug: 'duellist', name: 'Duellist', role: 'warrior', classes: ['fighter', 'rogue', 'monk'], skills: ['acrobatics', 'athletics'], combatStyle: 'finesse-melee' },
];
