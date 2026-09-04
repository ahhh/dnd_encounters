// Generated creatures.
//
// The last path to be built and the least authoritative, exactly as the plan
// requires: original mechanics are only trustworthy once CR evaluation is. The
// procedure runs forward from the target rating -- the CR band supplies the
// hit points, AC, attack bonus and damage a creature at that rating is expected
// to show -- and then the finished block is handed to the *same* evaluator used
// on real creatures. If it does not come back inside policy, the numbers are
// adjusted deterministically and it is evaluated again; if it still fails, the
// generator returns a failure rather than stamping the requested CR on it.

import { bandFor, effectiveHP, formatCR, parseCR } from '../../rules/srd51/challenge.js';
import { proficiencyBonusForCR, xpForCR } from '../../rules/srd51/proficiency.js';
import { abilityModifier } from '../../rules/srd51/abilities.js';
import { sheetId } from '../../core/ids.js';
import { evaluateCreature } from './cr-evaluator.js';

/** Role shapes the same CR budget into different creatures. */
const ROLE_SHAPES = {
  brute: { hp: 1.25, ac: -2, attacks: 1, damageShare: 1, speed: 30, abilities: ['str', 'con'] },
  soldier: { hp: 1.0, ac: +2, attacks: 2, damageShare: 0.5, speed: 30, abilities: ['str', 'con'] },
  skirmisher: { hp: 0.85, ac: +1, attacks: 2, damageShare: 0.5, speed: 40, abilities: ['dex', 'con'] },
  artillery: { hp: 0.7, ac: 0, attacks: 2, damageShare: 0.5, speed: 30, ranged: true, abilities: ['dex', 'con'] },
  controller: { hp: 0.85, ac: 0, attacks: 1, damageShare: 0.6, speed: 30, saveBased: true, abilities: ['cha', 'con'] },
  support: { hp: 0.9, ac: +1, attacks: 1, damageShare: 0.6, speed: 30, saveBased: true, abilities: ['wis', 'con'] },
  ambusher: { hp: 0.8, ac: 0, attacks: 1, damageShare: 1, speed: 30, stealth: true, abilities: ['dex', 'con'] },
  leader: { hp: 1.0, ac: +1, attacks: 2, damageShare: 0.5, speed: 30, abilities: ['cha', 'str'] },
  solo: { hp: 1.4, ac: +1, attacks: 3, damageShare: 0.34, speed: 40, legendary: true, abilities: ['str', 'con'] },
};

/** Creature-type templates: the defences and senses the type implies. */
const TYPE_TEMPLATES = {
  undead: {
    sizes: ['Medium', 'Large'], hitDieBySize: true,
    immunities: ['poison'], conditionImmunities: ['exhaustion', 'poisoned'],
    senses: [{ type: 'darkvision', range: 60 }],
    traits: [{ name: 'Undead Nature', description: 'The creature requires no air, food, drink, or sleep.' }],
    damageFlavour: 'necrotic', naming: ['Hollow', 'Ashen', 'Grave', 'Cold', 'Withered', 'Silent'],
    nouns: ['Revenant', 'Husk', 'Warden', 'Mourner', 'Pallbearer', 'Attendant'],
  },
  fiend: {
    sizes: ['Medium', 'Large'],
    resistances: ['cold', 'bludgeoning, piercing, and slashing from nonmagical attacks that are not silvered'],
    immunities: ['fire', 'poison'], conditionImmunities: ['poisoned'],
    senses: [{ type: 'darkvision', range: 120 }],
    traits: [{ name: 'Magic Resistance', description: 'The creature has advantage on saving throws against spells and other magical effects.' }],
    damageFlavour: 'fire', naming: ['Barbed', 'Smouldering', 'Bound', 'Sworn', 'Cinder'],
    nouns: ['Tormentor', 'Collector', 'Warden', 'Herald', 'Debtor'],
  },
  aberration: {
    sizes: ['Medium', 'Large'],
    resistances: ['psychic'], senses: [{ type: 'darkvision', range: 120 }],
    traits: [{ name: 'Alien Mind', description: 'The creature has advantage on saving throws against being charmed or frightened.' }],
    damageFlavour: 'psychic', naming: ['Folded', 'Unblinking', 'Mirrored', 'Wrong-Angled', 'Quiet'],
    nouns: ['Watcher', 'Thing', 'Chorus', 'Remnant', 'Coil'],
  },
  construct: {
    sizes: ['Medium', 'Large'],
    immunities: ['poison', 'psychic'],
    conditionImmunities: ['charmed', 'exhaustion', 'frightened', 'paralyzed', 'petrified', 'poisoned'],
    senses: [{ type: 'blindsight', range: 60 }, { type: 'darkvision', range: 60 }],
    traits: [{ name: 'Immutable Form', description: 'The creature is immune to any spell or effect that would alter its form.' }],
    damageFlavour: 'force', naming: ['Iron', 'Clockwork', 'Sealed', 'Ninth', 'Patient'],
    nouns: ['Sentinel', 'Servitor', 'Frame', 'Doorkeeper', 'Engine'],
  },
  elemental: {
    sizes: ['Large', 'Huge'],
    immunities: ['poison'],
    conditionImmunities: ['exhaustion', 'grappled', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'unconscious'],
    senses: [{ type: 'darkvision', range: 60 }],
    traits: [{ name: 'Elemental Form', description: 'The creature can move through a space as narrow as 1 inch wide without squeezing.' }],
    damageFlavour: 'lightning', naming: ['Rushing', 'Sunken', 'Kindled', 'Grinding', 'Howling'],
    nouns: ['Fury', 'Tide', 'Ember', 'Drift', 'Mote'],
  },
  monstrosity: {
    sizes: ['Large', 'Huge'], senses: [{ type: 'darkvision', range: 60 }],
    traits: [{ name: 'Keen Smell', description: 'The creature has advantage on Wisdom (Perception) checks that rely on smell.' }],
    damageFlavour: 'piercing', naming: ['Ridged', 'Split-Jaw', 'Pale', 'Hooked', 'Long'],
    nouns: ['Stalker', 'Render', 'Crawler', 'Hunter', 'Maw'],
  },
  beast: {
    sizes: ['Medium', 'Large'],
    traits: [{ name: 'Pack Tactics', description: 'The creature has advantage on an attack roll against a creature if at least one of its allies is within 5 feet of it.' }],
    damageFlavour: 'slashing', naming: ['Grey', 'Scarred', 'Winter', 'Bramble', 'River'],
    nouns: ['Hound', 'Boar', 'Cat', 'Raptor', 'Ox'],
  },
  fey: {
    sizes: ['Small', 'Medium'], senses: [{ type: 'darkvision', range: 60 }],
    traits: [{ name: 'Fey Step', description: 'As a bonus action, the creature can teleport up to 30 feet to an unoccupied space it can see.' }],
    damageFlavour: 'psychic', naming: ['Thorned', 'Laughing', 'Hollow-Eyed', 'Green', 'Borrowed'],
    nouns: ['Piper', 'Bargain', 'Warden', 'Cousin', 'Knock'],
  },
  giant: {
    sizes: ['Large', 'Huge'], senses: [{ type: 'darkvision', range: 60 }],
    traits: [{ name: 'Siege Monster', description: 'The creature deals double damage to objects and structures.' }],
    damageFlavour: 'bludgeoning', naming: ['Hill-Born', 'Stone', 'Frost-Bitten', 'Broad', 'Loud'],
    nouns: ['Breaker', 'Herdsman', 'Thrower', 'Elder', 'Digger'],
  },
  humanoid: {
    sizes: ['Small', 'Medium'],
    traits: [{ name: 'Disciplined', description: 'The creature has advantage on saving throws against being frightened while an ally is within 30 feet.' }],
    damageFlavour: 'slashing', naming: ['Sworn', 'Masked', 'Second', 'Quiet', 'Redhand'],
    nouns: ['Blade', 'Sergeant', 'Zealot', 'Runner', 'Enforcer'],
  },
  plant: {
    sizes: ['Large', 'Huge'], immunities: [], conditionImmunities: ['blinded', 'deafened', 'exhaustion'],
    senses: [{ type: 'blindsight', range: 30 }],
    traits: [{ name: 'False Appearance', description: 'While the creature remains motionless, it is indistinguishable from ordinary vegetation.' }],
    damageFlavour: 'bludgeoning', naming: ['Creeping', 'Rotted', 'Blooming', 'Choking', 'Deep'],
    nouns: ['Growth', 'Bloom', 'Snare', 'Root', 'Thicket'],
  },
  ooze: {
    sizes: ['Medium', 'Large'],
    conditionImmunities: ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'prone'],
    senses: [{ type: 'blindsight', range: 60 }],
    traits: [{ name: 'Amorphous', description: 'The creature can move through a space as narrow as 1 inch wide without squeezing.' }],
    damageFlavour: 'acid', naming: ['Sallow', 'Clinging', 'Weeping', 'Slow', 'Blind'],
    nouns: ['Mass', 'Slick', 'Crawl', 'Pool', 'Film'],
  },
  celestial: {
    sizes: ['Medium', 'Large'],
    resistances: ['radiant'], conditionImmunities: ['charmed', 'exhaustion', 'frightened'],
    senses: [{ type: 'darkvision', range: 120 }],
    traits: [{ name: 'Magic Resistance', description: 'The creature has advantage on saving throws against spells and other magical effects.' }],
    damageFlavour: 'radiant', naming: ['Gilded', 'Sworn', 'Third', 'Bright', 'Unyielding'],
    nouns: ['Warden', 'Witness', 'Herald', 'Lantern', 'Judge'],
  },
  dragon: {
    sizes: ['Large', 'Huge'],
    senses: [{ type: 'blindsight', range: 30 }, { type: 'darkvision', range: 120 }],
    traits: [{ name: 'Keen Senses', description: 'The creature has advantage on Wisdom (Perception) checks that rely on sight, hearing, or smell.' }],
    damageFlavour: 'fire', naming: ['Young', 'Scarred', 'Bronze-Scaled', 'Hoarding', 'Cave'],
    nouns: ['Wyrm', 'Drake', 'Serpent', 'Hoarder', 'Broodling'],
  },
};

const HIT_DIE_BY_SIZE = { Tiny: 4, Small: 6, Medium: 8, Large: 10, Huge: 12, Gargantuan: 20 };
const AVERAGE = (die) => (die + 1) / 2;

/**
 * Chooses dice that land as close as possible to a target average damage.
 * Dice counts are capped only to keep the block readable -- a high-CR solo
 * legitimately needs a lot of dice, and dropping every option because they are
 * all "too many" would leave nothing to choose from.
 */
function diceForAverage(target, bonus, stream) {
  const want = Math.max(1, target - bonus);
  const options = [];
  for (const sides of [4, 6, 8, 10, 12]) {
    const count = Math.min(30, Math.max(1, Math.round(want / AVERAGE(sides))));
    const average = count * AVERAGE(sides);
    options.push({ dice: `${count}d${sides}`, average, error: Math.abs(average - want) });
  }
  options.sort((a, b) => a.error - b.error);
  const shortlist = options.filter((o) => o.error <= options[0].error + 1);
  const pick = stream.choice(shortlist.length ? shortlist : options);
  return {
    dice: pick.dice,
    bonus,
    average: Math.floor(pick.average + bonus),
  };
}

/**
 * Builds one candidate stat block at the requested CR. `scale` lets the caller
 * nudge the whole thing up or down between evaluation passes.
 */
function buildCandidate({ targetCR, creatureType, role, stream, registry, offsets = { hp: 0, damage: 0, ac: 0 } }) {
  const cr = parseCR(targetCR);
  const band = bandFor(cr);
  const shape = ROLE_SHAPES[role] || ROLE_SHAPES.skirmisher;
  const template = TYPE_TEMPLATES[creatureType] || TYPE_TEMPLATES.monstrosity;
  const pb = proficiencyBonusForCR(cr);

  const size = stream.choice(template.sizes);
  const hitDie = HIT_DIE_BY_SIZE[size];

  // Ability scores: the role's two priorities get the high numbers, the rest
  // are set from the creature type's general disposition.
  const [primary, secondary] = shape.abilities;
  const scores = { str: 10, dex: 10, con: 10, int: 6, wis: 10, cha: 8 };
  const tier = Math.min(10, Math.round(cr / 2));
  scores[primary] = Math.min(26, 12 + tier * 2 + stream.int(0, 2));
  scores[secondary] = Math.min(24, 11 + tier * 2 + stream.int(0, 1));
  if (['aberration', 'fiend', 'celestial', 'dragon', 'fey'].includes(creatureType)) {
    scores.int = Math.min(20, 10 + tier);
    scores.cha = Math.min(22, 12 + tier);
  }
  if (creatureType === 'ooze') { scores.int = 1; scores.wis = 6; scores.cha = 2; }
  const mods = {};
  for (const [k, v] of Object.entries(scores)) mods[k] = abilityModifier(v);

  // Hit points: work back from the band to a dice formula that produces it.
  //
  // The evaluator scales hit points up for resistances and immunities, so the
  // *raw* number has to be divided by that same multiplier or a heavily warded
  // creature would come out rated several steps above its target. Dividing here
  // rather than discovering it by iteration is what makes the first pass land.
  const ward = effectiveHP(1, {
    resistances: template.resistances || [],
    immunities: template.immunities || [],
    conditionImmunities: template.conditionImmunities || [],
  }).multiplier;
  const targetHP = Math.max(1, Math.round((band.hp * shape.hp) / ward + offsets.hp));
  const perDie = AVERAGE(hitDie) + mods.con;
  const dieCount = Math.max(1, Math.round(targetHP / Math.max(1, perDie)));
  const conTotal = dieCount * mods.con;
  const average = Math.max(1, Math.floor(dieCount * AVERAGE(hitDie)) + conTotal);

  const ac = Math.max(10, band.ac + shape.ac + offsets.ac);
  const attackBonus = band.attack + Math.max(0, mods[primary] - 3) + (cr >= 5 ? 1 : 0);
  const saveDC = 8 + pb + mods[shape.saveBased ? (creatureType === 'undead' ? 'cha' : primary) : primary];

  // Damage: the band's DPR divided across the role's attack routine.
  const totalDamage = Math.max(1, band.dpr + offsets.damage);
  const perAttack = totalDamage * shape.damageShare;
  const damageMod = mods[shape.ranged ? 'dex' : primary];
  const primaryDice = diceForAverage(perAttack, damageMod, stream);

  const attackName = shape.ranged
    ? stream.choice(['Spine Volley', 'Hurled Shard', 'Barbed Dart', 'Screech'])
    : stream.choice(['Slam', 'Claw', 'Bite', 'Gore', 'Rending Blow']);

  const actions = [];
  if (shape.attacks > 1) {
    actions.push({
      id: 'multiattack', name: 'Multiattack', actionType: 'action',
      description: `The creature makes ${numberWord(shape.attacks)} ${attackName.toLowerCase()} attacks.`,
      multiattackCount: shape.attacks, effects: [],
    });
  }
  actions.push({
    id: attackName.toLowerCase().replace(/\s+/g, '-'),
    name: attackName,
    actionType: 'action',
    primary: true,
    attack: shape.ranged
      ? { bonus: attackBonus, range: { normal: 60, long: 180 } }
      : { bonus: attackBonus, reach: size === 'Huge' ? 10 : 5 },
    damage: [{
      ...primaryDice, type: template.damageFlavour,
      display: `${primaryDice.dice} + ${primaryDice.bonus} ${template.damageFlavour}`,
    }],
    effects: [],
  });

  // Controllers and supports get a recharge area effect instead of raw damage.
  if (shape.saveBased) {
    const areaDice = diceForAverage(totalDamage * 0.9, 0, stream);
    actions.push({
      id: 'burst', name: stream.choice(['Withering Burst', 'Sundering Pulse', 'Keening Wave']),
      actionType: 'action',
      save: { ability: stream.choice(['dex', 'con', 'wis']), dc: saveDC },
      recharge: { formula: '5-6' },
      damage: [{ ...areaDice, type: template.damageFlavour, display: `${areaDice.dice} ${template.damageFlavour}` }],
      description: `Each creature in a 15-foot cone must make a DC ${saveDC} saving throw, taking the damage on a failure and half as much on a success.`,
      effects: [],
    });
  }

  const traits = [...(template.traits || [])];
  if (shape.legendary) {
    traits.push({
      name: 'Legendary Resistance (3/Day)',
      description: 'If the creature fails a saving throw, it can choose to succeed instead.',
    });
  }
  if (shape.stealth) {
    traits.push({
      name: 'Ambusher',
      description: 'The creature has advantage on attack rolls against any creature it has surprised.',
    });
  }

  const movement = [{ type: 'walk', value: shape.speed }];
  if (creatureType === 'dragon' || (creatureType === 'elemental' && stream.chance(0.5))) {
    movement.push({ type: 'fly', value: shape.speed + 20 });
  }

  const senses = [...(template.senses || [])];
  senses.push({ type: 'passive Perception', value: 10 + mods.wis + (cr >= 5 ? pb : 0), source: 'derived' });

  const name = `${stream.choice(template.naming)} ${stream.choice(template.nouns)}`;

  return {
    name, size, creatureType, hitDie, dieCount, average, conTotal,
    scores, mods, ac, pb, saveDC, attackBonus, movement, senses, traits, actions,
    template, role, ward,
  };
}

const numberWord = (n) => ['zero', 'one', 'two', 'three', 'four', 'five'][n] || String(n);

/**
 * Builds a generated creature and iterates until the evaluator agrees with the
 * target, or gives up. Iterations adjust hit points, damage and AC -- the
 * inputs -- and never the evaluated result.
 */
export function buildGeneratedCreature({ spec, stream, registry, seed }) {
  const targetCR = spec.targetCR ?? 1;
  const role = spec.role || 'skirmisher';
  const creatureType = spec.creatureType || 'monstrosity';
  const attempts = [];

  // Corrections are additive and sized from the CR curve itself: above CR 4 the
  // bands step by 15 hit points and 6 damage per round, so a creature two rungs
  // light needs about 30 more hit points -- not "twelve percent more, twice".
  // A multiplicative nudge oscillates at high CR; this converges in a pass or
  // two, and the loop is here for the residue rather than the search.
  const HP_PER_CR = 15;
  const DPR_PER_CR = 6;
  let offsets = { hp: 0, damage: 0, ac: 0 };
  let closest = null;

  for (let pass = 0; pass < 8; pass++) {
    const candidate = buildCandidate({ targetCR, creatureType, role, stream, registry, offsets });
    const sheet = assembleSheet({ candidate, spec, seed, targetCR });
    const evaluation = evaluateCreature(sheet, targetCR);
    const distance = Math.abs(parseCR(evaluation.evaluatedCR) - parseCR(targetCR));
    attempts.push({
      pass,
      offsets: { ...offsets },
      evaluatedCR: evaluation.evaluatedCR,
      defensiveCR: evaluation.defensiveCR,
      offensiveCR: evaluation.offensiveCR,
    });

    if (evaluation.withinPolicy) {
      const evaluated = formatCR(parseCR(evaluation.evaluatedCR));
      sheet.challengeRating = evaluated;
      sheet.xp = xpForCR(evaluated);
      sheet.proficiencyBonus = proficiencyBonusForCR(evaluated);
      sheet.crEvaluation = evaluation;
      sheet.crPasses = attempts;
      return { ok: true, sheet, evaluation };
    }
    if (!closest || distance < closest.distance) closest = { distance, evaluation };

    const defGap = parseCR(targetCR) - parseCR(evaluation.defensiveCR);
    const offGap = parseCR(targetCR) - parseCR(evaluation.offensiveCR);
    offsets = {
      hp: offsets.hp + (defGap * HP_PER_CR) / candidate.ward,
      damage: offsets.damage + offGap * DPR_PER_CR,
      // AC only moves when hit points alone clearly cannot close the gap.
      ac: clamp(offsets.ac + (Math.abs(defGap) >= 3 ? Math.sign(defGap) : 0), -3, 3),
    };
  }

  return {
    ok: false,
    reason: `evaluated CR never settled within one step of the requested CR ${formatCR(parseCR(targetCR))}`
      + `${closest ? ` (closest was ${closest.evaluation.evaluatedCR})` : ''}`,
    attempts,
  };
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function assembleSheet({ candidate, spec, seed, targetCR }) {
  const cr = formatCR(parseCR(targetCR));
  return {
    id: sheetId('enemy', seed, candidate.name),
    kind: 'creature',
    seed,
    identity: { name: candidate.name, anonymous: false, generatedContent: true },

    sourceMode: 'generated',
    baseCreature: null,

    size: candidate.size,
    creatureType: candidate.creatureType,
    alignment: 'unaligned',

    challengeRating: cr,
    xp: xpForCR(cr),
    proficiencyBonus: candidate.pb,

    abilityScores: candidate.scores,
    abilityModifiers: candidate.mods,

    armorClass: { total: candidate.ac, source: 'natural armour' },
    hitPoints: {
      average: candidate.average,
      formula: `${candidate.dieCount}d${candidate.hitDie}${candidate.conTotal ? ` + ${candidate.conTotal}` : ''}`,
      max: candidate.average,
      current: candidate.average,
    },
    movement: candidate.movement,

    savingThrows: [],
    skills: [],

    vulnerabilities: candidate.template.vulnerabilities || [],
    resistances: candidate.template.resistances || [],
    immunities: candidate.template.immunities || [],
    conditionImmunities: candidate.template.conditionImmunities || [],

    senses: candidate.senses,
    languages: [{ id: null, name: '—', source: null, literal: true }],

    traits: candidate.traits,
    actions: candidate.actions,
    bonusActions: [],
    reactions: [],
    legendaryActions: [],

    tacticalRole: candidate.role,
    families: [candidate.creatureType],
    environments: spec.environment ? [spec.environment] : [],

    contentNotice: 'Generated game content. Original mechanics produced by this tool; not an official D&D creature.',
    generation: { notes: [] },
  };
}

export { TYPE_TEMPLATES, ROLE_SHAPES };
