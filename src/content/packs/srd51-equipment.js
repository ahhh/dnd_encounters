// SRD 5.1 equipment.
//
// Weapons carry their damage dice and properties structurally so an attack
// record can be *derived* rather than written down: the equipment builder picks
// a weapon the character is proficient with, and the attack maths falls out of
// these fields plus the ability scores. `proficiency` is 'simple' or 'martial'
// and is checked against the class's proficiency list before anything is
// equipped. Costs are in copper pieces to keep currency arithmetic exact.

const W = (slug, name, proficiency, category, damage, damageType, cost, weight, properties = [], extra = {}) =>
  ({ slug, name, proficiency, category, damage, damageType, cost, weight, properties, ...extra });

export const WEAPONS = [
  // Simple melee
  W('club', 'Club', 'simple', 'melee', '1d4', 'bludgeoning', 10, 2, ['light']),
  W('dagger', 'Dagger', 'simple', 'melee', '1d4', 'piercing', 200, 1, ['finesse', 'light', 'thrown'], { thrownRange: [20, 60] }),
  W('greatclub', 'Greatclub', 'simple', 'melee', '1d8', 'bludgeoning', 20, 10, ['two-handed']),
  W('handaxe', 'Handaxe', 'simple', 'melee', '1d6', 'slashing', 500, 2, ['light', 'thrown'], { thrownRange: [20, 60] }),
  W('javelin', 'Javelin', 'simple', 'melee', '1d6', 'piercing', 50, 2, ['thrown'], { thrownRange: [30, 120] }),
  W('light-hammer', 'Light Hammer', 'simple', 'melee', '1d4', 'bludgeoning', 200, 2, ['light', 'thrown'], { thrownRange: [20, 60] }),
  W('mace', 'Mace', 'simple', 'melee', '1d6', 'bludgeoning', 500, 4, []),
  W('quarterstaff', 'Quarterstaff', 'simple', 'melee', '1d6', 'bludgeoning', 20, 4, ['versatile'], { versatileDamage: '1d8' }),
  W('sickle', 'Sickle', 'simple', 'melee', '1d4', 'slashing', 100, 2, ['light']),
  W('spear', 'Spear', 'simple', 'melee', '1d6', 'piercing', 100, 3, ['thrown', 'versatile'], { thrownRange: [20, 60], versatileDamage: '1d8' }),
  // Simple ranged
  W('crossbow-light', 'Light Crossbow', 'simple', 'ranged', '1d8', 'piercing', 2500, 5, ['ammunition', 'loading', 'two-handed'], { range: [80, 320], ammo: 'srd51:gear.crossbow-bolts' }),
  W('dart', 'Dart', 'simple', 'ranged', '1d4', 'piercing', 5, 0.25, ['finesse', 'thrown'], { thrownRange: [20, 60] }),
  W('shortbow', 'Shortbow', 'simple', 'ranged', '1d6', 'piercing', 2500, 2, ['ammunition', 'two-handed'], { range: [80, 320], ammo: 'srd51:gear.arrows' }),
  W('sling', 'Sling', 'simple', 'ranged', '1d4', 'bludgeoning', 10, 0, ['ammunition'], { range: [30, 120], ammo: 'srd51:gear.sling-bullets' }),
  // Martial melee
  W('battleaxe', 'Battleaxe', 'martial', 'melee', '1d8', 'slashing', 1000, 4, ['versatile'], { versatileDamage: '1d10' }),
  W('flail', 'Flail', 'martial', 'melee', '1d8', 'bludgeoning', 1000, 2, []),
  W('glaive', 'Glaive', 'martial', 'melee', '1d10', 'slashing', 2000, 6, ['heavy', 'reach', 'two-handed'], { reach: 10 }),
  W('greataxe', 'Greataxe', 'martial', 'melee', '1d12', 'slashing', 3000, 7, ['heavy', 'two-handed']),
  W('greatsword', 'Greatsword', 'martial', 'melee', '2d6', 'slashing', 5000, 6, ['heavy', 'two-handed']),
  W('halberd', 'Halberd', 'martial', 'melee', '1d10', 'slashing', 2000, 6, ['heavy', 'reach', 'two-handed'], { reach: 10 }),
  W('lance', 'Lance', 'martial', 'melee', '1d12', 'piercing', 1000, 6, ['reach', 'special'], { reach: 10 }),
  W('longsword', 'Longsword', 'martial', 'melee', '1d8', 'slashing', 1500, 3, ['versatile'], { versatileDamage: '1d10' }),
  W('maul', 'Maul', 'martial', 'melee', '2d6', 'bludgeoning', 1000, 10, ['heavy', 'two-handed']),
  W('morningstar', 'Morningstar', 'martial', 'melee', '1d8', 'piercing', 1500, 4, []),
  W('pike', 'Pike', 'martial', 'melee', '1d10', 'piercing', 500, 18, ['heavy', 'reach', 'two-handed'], { reach: 10 }),
  W('rapier', 'Rapier', 'martial', 'melee', '1d8', 'piercing', 2500, 2, ['finesse']),
  W('scimitar', 'Scimitar', 'martial', 'melee', '1d6', 'slashing', 2500, 3, ['finesse', 'light']),
  W('shortsword', 'Shortsword', 'martial', 'melee', '1d6', 'piercing', 1000, 2, ['finesse', 'light']),
  W('trident', 'Trident', 'martial', 'melee', '1d6', 'piercing', 500, 4, ['thrown', 'versatile'], { thrownRange: [20, 60], versatileDamage: '1d8' }),
  W('war-pick', 'War Pick', 'martial', 'melee', '1d8', 'piercing', 500, 2, []),
  W('warhammer', 'Warhammer', 'martial', 'melee', '1d8', 'bludgeoning', 1500, 2, ['versatile'], { versatileDamage: '1d10' }),
  W('whip', 'Whip', 'martial', 'melee', '1d4', 'slashing', 200, 3, ['finesse', 'reach'], { reach: 10 }),
  // Martial ranged
  W('blowgun', 'Blowgun', 'martial', 'ranged', '1', 'piercing', 1000, 1, ['ammunition', 'loading'], { range: [25, 100], ammo: 'srd51:gear.blowgun-needles' }),
  W('crossbow-hand', 'Hand Crossbow', 'martial', 'ranged', '1d6', 'piercing', 7500, 3, ['ammunition', 'light', 'loading'], { range: [30, 120], ammo: 'srd51:gear.crossbow-bolts' }),
  W('crossbow-heavy', 'Heavy Crossbow', 'martial', 'ranged', '1d10', 'piercing', 5000, 18, ['ammunition', 'heavy', 'loading', 'two-handed'], { range: [100, 400], ammo: 'srd51:gear.crossbow-bolts' }),
  W('longbow', 'Longbow', 'martial', 'ranged', '1d8', 'piercing', 5000, 2, ['ammunition', 'heavy', 'two-handed'], { range: [150, 600], ammo: 'srd51:gear.arrows' }),
  W('net', 'Net', 'martial', 'ranged', '0', 'none', 100, 3, ['special', 'thrown'], { thrownRange: [5, 15] }),
];

const A = (slug, name, armorType, baseAC, maxDexBonus, cost, weight, extra = {}) =>
  ({ slug, name, armorType, baseAC, maxDexBonus, cost, weight, ...extra });

export const ARMOR = [
  A('padded', 'Padded Armor', 'light', 11, null, 500, 8, { stealthDisadvantage: true }),
  A('leather', 'Leather Armor', 'light', 11, null, 1000, 10),
  A('studded-leather', 'Studded Leather Armor', 'light', 12, null, 4500, 13),
  A('hide', 'Hide Armor', 'medium', 12, 2, 1000, 12),
  A('chain-shirt', 'Chain Shirt', 'medium', 13, 2, 5000, 20),
  A('scale-mail', 'Scale Mail', 'medium', 14, 2, 5000, 45, { stealthDisadvantage: true }),
  A('breastplate', 'Breastplate', 'medium', 14, 2, 40000, 20),
  A('half-plate', 'Half Plate Armor', 'medium', 15, 2, 75000, 40, { stealthDisadvantage: true }),
  A('ring-mail', 'Ring Mail', 'heavy', 14, 0, 3000, 40, { stealthDisadvantage: true }),
  A('chain-mail', 'Chain Mail', 'heavy', 16, 0, 7500, 55, { stealthDisadvantage: true, strengthRequirement: 13 }),
  A('splint', 'Splint Armor', 'heavy', 17, 0, 20000, 60, { stealthDisadvantage: true, strengthRequirement: 15 }),
  A('plate', 'Plate Armor', 'heavy', 18, 0, 150000, 65, { stealthDisadvantage: true, strengthRequirement: 15 }),
  A('shield', 'Shield', 'shield', 0, null, 1000, 6, { acBonus: 2 }),
];

const G = (slug, name, cost, weight, extra = {}) => ({ slug, name, cost, weight, ...extra });

export const GEAR = [
  G('arrows', 'Arrows (20)', 100, 1, { ammunition: true, quantity: 20 }),
  G('crossbow-bolts', 'Crossbow Bolts (20)', 100, 1.5, { ammunition: true, quantity: 20 }),
  G('sling-bullets', 'Sling Bullets (20)', 4, 1.5, { ammunition: true, quantity: 20 }),
  G('blowgun-needles', 'Blowgun Needles (50)', 100, 1, { ammunition: true, quantity: 50 }),
  G('backpack', 'Backpack', 200, 5),
  G('bedroll', 'Bedroll', 100, 7),
  G('rations', "Rations (1 day)", 50, 2),
  G('rope-hempen', 'Hempen Rope (50 feet)', 100, 10),
  G('torch', 'Torch', 1, 1),
  G('tinderbox', 'Tinderbox', 50, 1),
  G('waterskin', 'Waterskin', 20, 5),
  G('lantern-hooded', 'Hooded Lantern', 500, 2),
  G('oil-flask', 'Flask of Oil', 10, 1),
  G('healers-kit', "Healer's Kit", 500, 3),
  G('holy-symbol', 'Holy Symbol', 500, 1, { focus: 'divine' }),
  G('component-pouch', 'Component Pouch', 2500, 2, { focus: 'arcane' }),
  G('arcane-focus', 'Arcane Focus', 1000, 3, { focus: 'arcane' }),
  G('druidic-focus', 'Druidic Focus', 1000, 3, { focus: 'druidic' }),
  G('spellbook', 'Spellbook', 5000, 3),
  G('thieves-tools', "Thieves' Tools", 2500, 1, { tool: true }),
  G('smiths-tools', "Smith's Tools", 2000, 8, { tool: true }),
  G('herbalism-kit', 'Herbalism Kit', 500, 3, { tool: true }),
  G('disguise-kit', 'Disguise Kit', 2500, 3, { tool: true }),
  G('lute', 'Lute', 3500, 2, { tool: true, instrument: true }),
  G('lyre', 'Lyre', 3000, 2, { tool: true, instrument: true }),
  G('caltrops', 'Bag of Caltrops (20)', 100, 2),
  G('hunting-trap', 'Hunting Trap', 500, 25),
  G('manacles', 'Manacles', 200, 6),
  G('potion-healing', 'Potion of Healing', 5000, 0.5, { consumable: true, heals: '2d4 + 2' }),
  G('explorers-pack', "Explorer's Pack", 1000, 59, { pack: true }),
  G('dungeoneers-pack', "Dungeoneer's Pack", 1200, 61.5, { pack: true }),
  G('priests-pack', "Priest's Pack", 1900, 24, { pack: true }),
  G('scholars-pack', "Scholar's Pack", 4000, 10, { pack: true }),
  G('burglars-pack', "Burglar's Pack", 1600, 44.5, { pack: true }),
  G('entertainers-pack', "Entertainer's Pack", 4000, 38, { pack: true }),
];
