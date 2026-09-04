// Sheet rendering.
//
// Renders the canonical sheet objects to DOM. Nothing here computes a game
// value -- if a number is on screen it came off the sheet, which means the
// screen and the JSON export can never disagree. Where a sheet carries a
// calculation record, it is shown underneath the number, because "AC 17" is
// much less useful at a table than "AC 17: studded leather 12, Dexterity +4,
// shield +1".

import { ABILITY_NAMES, signed } from '../rules/srd51/abilities.js';

const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function section(title) {
  return el('h2', null, title);
}

function stat(key, value, why) {
  const box = el('div', 'stat');
  box.append(el('div', 'k', key), el('div', 'v', String(value)));
  if (why) box.append(el('div', 'why', why));
  return box;
}

/**
 * "Studded Leather Armor 12 · Dexterity +4" from a calculation record.
 *
 * A part carrying `base: true` is a starting value rather than a modifier, so
 * it prints unsigned. Everything else is something added to it and prints with
 * its sign -- guessing from position instead would render an attack's ability
 * modifier as "Strength 3".
 */
const explain = (calculation) => (calculation?.parts || [])
  .map((p) => `${p.label} ${p.base ? p.value : signed(p.value)}`)
  .join(' · ');

function kv(pairs) {
  const list = el('dl', 'kv');
  for (const [key, value] of pairs) {
    if (value === null || value === undefined || value === '') continue;
    list.append(el('dt', null, key), el('dd', null, String(value)));
  }
  return list;
}

function chips(values, className = 'chip') {
  const wrap = el('div', 'chips');
  for (const value of values) wrap.append(el('span', className, value));
  return wrap;
}

function abilityBlock(scores, mods) {
  const grid = el('div', 'abilities');
  for (const a of ABILITY_ORDER) {
    const box = el('div', 'ability');
    box.append(
      el('div', 'k', ABILITY_NAMES[a].slice(0, 3).toUpperCase()),
      el('div', 'v', String(scores[a])),
      el('div', 'm', signed(mods[a])),
    );
    grid.append(box);
  }
  return grid;
}

function table(headers, rows) {
  const node = el('table', 'grid');
  const thead = el('thead');
  const hr = el('tr');
  for (const h of headers) hr.append(el('th', null, h));
  thead.append(hr);
  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr', row.className || null);
    for (const cell of row.cells) {
      const td = el('td', cell.numeric ? 'n' : null);
      if (cell.node) td.append(cell.node);
      else td.textContent = cell.text ?? '';
      tr.append(td);
    }
    tbody.append(tr);
  }
  node.append(thead, tbody);
  return node;
}

const damageText = (damage) => (damage || [])
  .map((d) => {
    const dice = d.dice
      ? `${d.dice}${d.bonus ? ` ${d.bonus > 0 ? '+' : '-'} ${Math.abs(d.bonus)}` : ''}`
      : String(d.bonus ?? 0);
    return `${dice} ${d.type}${d.note ? ` (${d.note})` : ''}`;
  })
  .join(' plus ');

function notice(text, kind = '') {
  return el('div', `notice${kind ? ` ${kind}` : ''}`, text);
}

// --- character ------------------------------------------------------------------

export function renderCharacter(sheet) {
  const root = el('article', 'sheet');
  const cls = sheet.classLevels[0];

  root.append(el('h1', null, sheet.identity.name));
  root.append(el('p', 'subtitle',
    `${sheet.species.name} ${cls.name}${cls.subclass ? ` (${cls.subclass.name})` : ''}, level ${sheet.level} — ${sheet.background.name}`));

  const stats = el('div', 'statrow');
  stats.append(
    stat('Armor Class', sheet.armorClass.total, explain(sheet.armorClass.calculation)),
    stat('Hit Points', sheet.hitPoints.max, explain(sheet.hitPoints.calculation)),
    stat('Hit Dice', sheet.hitDice.map((d) => `${d.total}${d.die}`).join(', ')),
    stat('Initiative', signed(sheet.initiative), explain(sheet.initiativeCalculation)),
    stat('Speed', `${sheet.movement[0].value} ft.`, explain(sheet.movement[0].calculation)),
    stat('Proficiency', signed(sheet.proficiencyBonus)),
    stat('Attacks', `${sheet.attacksPerAction}/action`),
  );
  root.append(stats);

  root.append(section('Abilities'));
  root.append(abilityBlock(sheet.abilityScores, sheet.abilityModifiers));
  root.append(el('p', 'hint',
    `${sheet.abilityGeneration.method} (${sheet.abilityGeneration.note}); species adjustments and ability score improvements applied on top.`));

  root.append(section('Saving Throws'));
  root.append(table(['Save', 'Modifier', ''], sheet.savingThrows.map((s) => ({
    className: s.proficient ? 'trained' : 'untrained',
    cells: [
      { text: ABILITY_NAMES[s.ability] },
      { text: signed(s.modifier), numeric: true },
      { text: s.proficient ? 'proficient' : '' },
    ],
  }))));

  root.append(section('Skills'));
  root.append(table(['Skill', 'Mod', 'Source'], sheet.skills.map((s) => ({
    className: s.proficiency === 'none' ? 'untrained' : 'trained',
    cells: [
      { text: `${s.name} (${s.ability.toUpperCase()})` },
      { text: signed(s.modifier), numeric: true },
      { text: s.proficiency === 'none' ? '' : `${s.proficiency === 'expertise' ? 'expertise · ' : ''}${s.source?.name || s.source?.type || ''}` },
    ],
  }))));

  root.append(section('Attacks'));
  for (const attack of sheet.attacks) {
    const entry = el('div', 'entry');
    const bits = [];
    if (attack.attackBonus !== undefined) bits.push(`${signed(attack.attackBonus)} to hit`);
    if (attack.reach) bits.push(`reach ${attack.reach} ft.`);
    if (attack.normalRange) bits.push(`range ${attack.normalRange}/${attack.longRange} ft.`);
    if (attack.thrownRange) bits.push(`thrown ${attack.thrownRange[0]}/${attack.thrownRange[1]} ft.`);
    entry.append(el('div', 'name', attack.name));
    entry.append(el('div', 'body', `${bits.join(', ')}${bits.length ? ' — ' : ''}${damageText(attack.damage)}`));
    if (attack.calculation) entry.append(el('div', 'body', explain(attack.calculation)));
    if (attack.properties?.length) entry.append(chips(attack.properties));
    root.append(entry);
  }

  if (sheet.spellcasting) root.append(...spellcastingBlock(sheet.spellcasting));

  root.append(section('Features'));
  for (const feature of sheet.features) {
    const entry = el('div', 'entry');
    const name = el('div', 'name', feature.name);
    name.append(el('span', 'lvl', `level ${feature.level}`));
    entry.append(name, el('div', 'body', feature.description));
    root.append(entry);
  }

  if (sheet.feats.length) {
    root.append(section('Feats'));
    for (const feat of sheet.feats) {
      const entry = el('div', 'entry');
      entry.append(el('div', 'name', feat.name), el('div', 'body', feat.description));
      root.append(entry);
    }
  }

  if (sheet.resources.length) {
    root.append(section('Resources'));
    root.append(table(['Pool', 'Max', 'Recharge', 'Source'], sheet.resources.map((r) => ({
      cells: [{ text: r.name }, { text: String(r.max), numeric: true }, { text: r.recharge || '' }, { text: r.source }],
    }))));
  }

  root.append(section('Equipment'));
  root.append(table(['Item', 'Qty', ''], sheet.equipment.map((item) => ({
    cells: [
      { text: item.name },
      { text: String(item.quantity), numeric: true },
      { text: `${item.equipped ? 'equipped' : ''}${item.note ? ` · ${item.note}` : ''}` },
    ],
  }))));
  root.append(kv([
    ['Coin', `${sheet.currency.gp} gp`],
    ['Languages', sheet.languages.map((l) => l.name).join(', ')],
    ['Resistances', sheet.defenses.resistances.map((r) => r.damage).join(', ')],
    ['Condition immunities', sheet.defenses.conditionImmunities.join(', ')],
    ['Senses', sheet.senses.map((s) => (s.range ? `${s.type} ${s.range} ft.` : `${s.type} ${s.value}`)).join(', ')],
  ]));

  root.append(section('Personality'));
  const p = sheet.personality;
  root.append(kv([
    ['Disposition', p.disposition],
    ['Motivation', p.motivation],
    ['Ideal', p.ideal],
    ['Bond', p.bond],
    ['Flaw', p.flaw],
    ['Mannerism', p.mannerism],
    ['Voice', p.voiceCue],
    ['Wants', p.wants],
    ['Fears', p.fears],
    ['In combat', p.combatBehavior],
    ['Surrenders', p.surrenderCondition],
    ['Appearance', sheet.identity.appearance],
    ['Age', sheet.identity.ageDescriptor],
    ['Cover occupation', sheet.identity.occupation],
    ['Pronouns', sheet.identity.pronouns],
  ]));

  root.append(...provenanceBlock(sheet));
  return root;
}

function spellcastingBlock(sc) {
  const out = [section('Spellcasting')];
  const stats = el('div', 'statrow');
  stats.append(
    stat('Save DC', sc.spellSaveDC, explain(sc.calculation?.saveDC)),
    stat('Attack', signed(sc.spellAttackBonus), explain(sc.calculation?.attackBonus)),
    stat('Ability', ABILITY_NAMES[sc.ability]),
  );
  out.push(stats);

  if (sc.slots?.length) {
    out.push(chips(sc.slots.map((s) => `${ordinal(s.level)} × ${s.total}${s.pact ? ' pact' : ''}`), 'chip mono'));
  }
  const groups = [
    ['Cantrips', sc.cantrips],
    ['Bonus cantrips', sc.bonusCantrips],
    ['Always prepared', sc.alwaysPrepared],
    [sc.prepares ? `Prepared (${(sc.preparedSpells || []).length}/${sc.preparedLimit ?? '—'})`
      : `Known (${(sc.knownSpells || []).length}/${sc.knownLimit ?? '—'})`, sc.preparedSpells || sc.knownSpells],
    ['Innate', sc.innateSpells],
    ['Mystic Arcanum', sc.mysticArcanum],
    [`Spellbook (${(sc.spellbook || []).length})`, sc.spellbook],
  ];
  for (const [label, list] of groups) {
    if (!list?.length) continue;
    const entry = el('div', 'entry');
    entry.append(el('div', 'name', label));
    const sorted = [...list].sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
    entry.append(el('div', 'body', sorted
      .map((s) => `${s.name}${s.level ? ` (${ordinal(s.level)})` : ''}${s.uses ? ` [${s.uses}]` : ''}`)
      .join(', ')));
    out.push(entry);
  }
  return out;
}

// --- creature -------------------------------------------------------------------

export function renderCreature(sheet) {
  const root = el('article', 'sheet');
  root.append(el('h1', null, sheet.identity.name));
  root.append(el('p', 'subtitle',
    `${sheet.size} ${sheet.creatureType}${sheet.alignment ? `, ${sheet.alignment}` : ''}`));

  if (sheet.contentNotice) root.append(notice(sheet.contentNotice));

  const stats = el('div', 'statrow');
  stats.append(
    stat('Challenge', sheet.challengeRating, `${sheet.xp} XP`),
    stat('Armor Class', sheet.armorClass.total, sheet.armorClass.source),
    stat('Hit Points', sheet.hitPoints.average, sheet.hitPoints.formula),
    stat('Proficiency', signed(sheet.proficiencyBonus)),
    stat('Speed', sheet.movement.map((m) => `${m.value}${m.type === 'walk' ? '' : ` ${m.type[0]}`}`).join(' / ')),
    stat('Role', sheet.tacticalRole),
  );
  root.append(stats);

  root.append(section('Abilities'));
  root.append(abilityBlock(sheet.abilityScores, sheet.abilityModifiers));

  root.append(kv([
    ['Source', sheet.sourceMode === 'existing'
      ? `${sheet.baseCreature.name} — ${sheet.baseCreature.source.packId} ${sheet.baseCreature.source.version}, ${sheet.baseCreature.source.license}`
      : `${sheet.sourceMode}${sheet.baseCreature ? ` of ${sheet.baseCreature.name}` : ''}`],
    ['Saving throws', sheet.savingThrows.map((s) => `${ABILITY_NAMES[s.ability].slice(0, 3)} ${signed(s.bonus)}`).join(', ')],
    ['Skills', sheet.skills.map((s) => `${s.name} ${signed(s.modifier)}`).join(', ')],
    ['Vulnerabilities', sheet.vulnerabilities.join(', ')],
    ['Resistances', sheet.resistances.join(', ')],
    ['Immunities', sheet.immunities.join(', ')],
    ['Condition immunities', sheet.conditionImmunities.join(', ')],
    ['Senses', sheet.senses.map((s) => (s.range ? `${s.type} ${s.range} ft.` : `${s.type} ${s.value}`)).join(', ')],
    ['Languages', sheet.languages.map((l) => l.name).join(', ') || '—'],
    ['Environments', sheet.environments.join(', ')],
  ]));

  if (sheet.traits.length) {
    root.append(section('Traits'));
    for (const trait of sheet.traits) {
      const entry = el('div', 'entry');
      entry.append(el('div', 'name', trait.name), el('div', 'body', trait.description));
      root.append(entry);
    }
  }

  for (const [label, list] of [
    ['Actions', sheet.actions], ['Bonus Actions', sheet.bonusActions],
    ['Reactions', sheet.reactions], ['Legendary Actions', sheet.legendaryActions],
  ]) {
    if (!list?.length) continue;
    root.append(section(label));
    for (const action of list) root.append(actionEntry(action));
  }

  if (sheet.spellcasting) {
    root.append(section('Spellcasting'));
    root.append(kv([
      ['Ability', ABILITY_NAMES[sheet.spellcasting.ability]],
      ['Save DC', sheet.spellcasting.dc],
      ['Spell attack', signed(sheet.spellcasting.attackBonus)],
      ['Model', sheet.spellcasting.model],
    ]));
    for (const group of sheet.spellcasting.groups) {
      const entry = el('div', 'entry');
      entry.append(el('div', 'name', group.label),
        el('div', 'body', group.spells.map((s) => s.name).join(', ')));
      root.append(entry);
    }
  }

  if (sheet.transforms?.length) {
    root.append(section('Applied Transforms'));
    for (const t of sheet.transforms) {
      const entry = el('div', 'entry');
      entry.append(el('div', 'name', t.name), el('div', 'body', `${t.effect} — ${t.description}`));
      root.append(entry);
    }
  }

  if (sheet.crEvaluation) {
    root.append(section('CR Evaluation'));
    const e = sheet.crEvaluation;
    root.append(kv([
      ['Requested', e.targetCR ?? '—'],
      ['Evaluated', e.evaluatedCR],
      ['Defensive', e.defensiveCR],
      ['Offensive', e.offensiveCR],
      ['Effective HP', e.effectiveHP],
      ['Damage / round', e.damagePerRound],
    ]));
    for (const a of e.assumptions) root.append(el('div', 'hint', `assumption: ${a}`));
    for (const w of e.warnings) root.append(notice(w));
  }

  if (sheet.personality) {
    root.append(section('Disposition and Tactics'));
    root.append(kv([
      ['Disposition', sheet.personality.disposition],
      ['In combat', sheet.personality.combatBehavior],
      ['Surrenders', sheet.personality.surrenderCondition],
      ['Wants', sheet.personality.wants],
      ['Fears', sheet.personality.fears],
    ]));
  }

  root.append(...provenanceBlock(sheet));
  return root;
}

function actionEntry(action) {
  const entry = el('div', 'entry');
  const name = el('div', 'name', action.name);
  if (action.recharge) name.append(el('span', 'lvl', `recharge ${action.recharge.formula}`));
  if (action.uses) name.append(el('span', 'lvl', `${action.uses}/day`));
  if (action.cost) name.append(el('span', 'lvl', `costs ${action.cost}`));
  entry.append(name);

  const bits = [];
  if (action.attack) {
    const reach = action.attack.range
      ? `range ${action.attack.range.normal}/${action.attack.range.long} ft.`
      : `reach ${action.attack.reach} ft.`;
    bits.push(`${signed(action.attack.bonus)} to hit, ${reach}`);
  }
  if (action.save) bits.push(`DC ${action.save.dc} ${ABILITY_NAMES[action.save.ability]} save`);
  const dmg = damageText(action.damage);
  if (dmg) bits.push(`Hit: ${dmg}`);
  if (bits.length) entry.append(el('div', 'body', bits.join(' · ')));
  if (action.description) entry.append(el('div', 'body', action.description));
  return entry;
}

// --- shared ---------------------------------------------------------------------

function provenanceBlock(sheet) {
  const out = [section('Generation and Provenance')];
  const g = sheet.generation;
  out.push(kv([
    ['Seed', g.seed],
    ['Generator', g.generatorVersion],
    ['Ruleset', `${g.ruleset.id} ${g.ruleset.version}`],
    ['Content packs', g.contentPacks.map((p) => `${p.id} ${p.version}`).join(', ')],
    ['Rerolls', Object.entries(g.rerolls || {}).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'],
  ]));
  for (const note of g.notes || []) out.push(notice(note));
  if (sheet.validation) {
    out.push(notice(
      `Independent validation: ${sheet.validation.errors.length} errors, ${sheet.validation.warnings.length} warnings.`,
      sheet.validation.valid ? 'ok' : 'err'));
    for (const w of sheet.validation.warnings) out.push(el('div', 'hint', `warning: ${w.message}`));
  }
  for (const source of g.attribution || []) {
    out.push(el('div', 'hint', source.notice));
  }
  return out;
}

const ordinal = (n) => (n === 0 ? 'cantrip'
  : `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || (n % 100 - n % 10 === 10) ? 0 : n % 10]}`);

export { el, notice };
