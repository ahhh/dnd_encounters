// Personality and identity.
//
// Mechanically inert by construction. Everything here draws from
// `npc:identity` and `npc:personality`, which no derived statistic ever reads,
// so rerolling a character's flaw cannot move their AC by a point. That
// isolation is the whole reason these tables live in their own module and their
// own streams.

const NAME_REGISTERS = {
  'dwarf-hill': 'dwarven',
  'elf-high': 'elven',
  'halfling-lightfoot': 'halfling',
  'gnome-rock': 'gnomish',
  'half-orc': 'orcish',
  tiefling: 'infernal',
  dragonborn: 'draconic',
  human: 'common',
  'half-elf': 'elven',
};

const table = (registry, slug) => registry.get(`openflavor:personality-table.${slug}`);
const names = (registry, slug) => registry.get(`openflavor:name-table.${slug}`);

/** Picks a name in the register the species suggests, falling back to common. */
export function buildIdentity({ registry, species, stream, named, index, anonymousLabel }) {
  const register = NAME_REGISTERS[species.slug] || 'common';
  const personalTable = registry.all('name-table')
    .find((t) => t.register === register && t.kind === 'personal')
    || names(registry, 'names-common-personal');
  const familyTable = registry.all('name-table')
    .find((t) => t.register === register && t.kind === 'family')
    || names(registry, 'names-common-family');

  const personal = stream.choice(personalTable.entries);
  // Not every NPC has a surname; a third get an epithet instead, which reads
  // more like a person a table would actually meet.
  const roll = stream.float();
  let name = personal;
  if (!named) {
    // An unnamed member of a group is identified by the group's label -- "Guard
    // 3" is what a DM actually calls them at the table.
    name = `${anonymousLabel || species.name} ${index != null ? index + 1 : ''}`.trim();
  } else if (roll < 0.5) {
    name = `${personal} ${stream.choice(familyTable.entries)}`;
  } else if (roll < 0.75) {
    name = `${personal} ${stream.choice(names(registry, 'names-epithet').entries)}`;
  }

  return {
    name,
    personalName: personal,
    pronouns: stream.choice(['they/them', 'she/her', 'he/him', 'they/them']),
    size: species.size,
    ageDescriptor: stream.choice(table(registry, 'age-descriptor').entries),
    appearance: stream.choice(table(registry, 'appearance').entries),
    occupation: stream.choice(table(registry, 'occupation').entries),
    nameRegister: register,
    anonymous: !named,
  };
}

/** The full personality record. One draw per field, all from one stream. */
export function buildPersonality({ registry, stream, role }) {
  const pick = (slug) => stream.choice(table(registry, slug).entries);
  return {
    disposition: pick('disposition'),
    motivation: pick('motivation'),
    ideal: pick('ideal'),
    bond: pick('bond'),
    flaw: pick('flaw'),
    mannerism: pick('mannerism'),
    voiceCue: pick('voice-cue'),
    wants: pick('wants'),
    fears: pick('fears'),
    combatBehavior: pick('combat-behavior'),
    surrenderCondition: pick('surrender-condition'),
    roleNote: role,
  };
}
