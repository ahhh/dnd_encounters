// Markdown export.
//
// A DM-readable sheet, laid out for reading at a table rather than imitating a
// published book's presentation. Everything printed here comes from the sheet;
// nothing is recomputed, so if a number looks wrong in the Markdown it is wrong
// on the sheet, which is what you want from an export.

import { ABILITY_NAMES, signed } from '../rules/srd51/abilities.js';

const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const heading = (text, level = 2) => `${'#'.repeat(level)} ${text}\n`;
const line = (label, value) => (value || value === 0 ? `**${label}:** ${value}\n` : '');
const bullet = (text) => `- ${text}\n`;

function abilityTable(scores, mods) {
  const head = `| ${ABILITY_ORDER.map((a) => ABILITY_NAMES[a].slice(0, 3).toUpperCase()).join(' | ')} |\n`;
  const sep = `| ${ABILITY_ORDER.map(() => '---').join(' | ')} |\n`;
  const row = `| ${ABILITY_ORDER.map((a) => `${scores[a]} (${signed(mods[a])})`).join(' | ')} |\n`;
  return head + sep + row + '\n';
}

const damageText = (damage) => (damage || [])
  .map((d) => {
    const dice = d.dice ? `${d.dice}${d.bonus ? ` ${d.bonus > 0 ? '+' : '-'} ${Math.abs(d.bonus)}` : ''}` : String(d.bonus ?? 0);
    return `${dice} ${d.type}${d.note ? ` (${d.note})` : ''}`;
  })
  .join(' plus ');

// --- character ------------------------------------------------------------------

export function characterMarkdown(sheet) {
  let out = '';
  const cls = sheet.classLevels[0];

  out += heading(sheet.identity.name, 1);
  out += `*${sheet.species.name} ${cls.name}${cls.subclass ? ` (${cls.subclass.name})` : ''}, level ${sheet.level} — ${sheet.background.name}*\n\n`;

  out += heading('Identity');
  out += line('Pronouns', sheet.identity.pronouns);
  out += line('Size', sheet.identity.size);
  out += line('Age', sheet.identity.ageDescriptor);
  out += line('Appearance', sheet.identity.appearance);
  out += line('Occupation', sheet.identity.occupation);
  out += line('Role', sheet.role);
  out += line('Theme', sheet.theme);
  out += '\n';

  out += heading('Core Statistics');
  out += line('Armor Class', `${sheet.armorClass.total} (${sheet.armorClass.calculation.parts
    .map((p) => `${p.label} ${p.base ? p.value : signed(p.value)}`).join(', ')})`);
  out += line('Hit Points', `${sheet.hitPoints.max} (${sheet.hitDice.map((d) => `${d.total}${d.die}`).join(', ')})`);
  out += line('Initiative', signed(sheet.initiative));
  out += line('Speed', sheet.movement.map((m) => `${m.value} ft. ${m.type}`).join(', '));
  out += line('Proficiency Bonus', signed(sheet.proficiencyBonus));
  out += line('Attacks per Action', sheet.attacksPerAction);
  out += '\n';

  out += heading('Abilities');
  out += abilityTable(sheet.abilityScores, sheet.abilityModifiers);

  out += heading('Saving Throws');
  out += `${sheet.savingThrows.map((s) => `${ABILITY_NAMES[s.ability]} ${signed(s.modifier)}${s.proficient ? '*' : ''}`).join(' · ')}\n\n`;
  out += '*\\* proficient*\n\n';

  const trained = sheet.skills.filter((s) => s.proficiency !== 'none');
  out += heading('Skills');
  if (trained.length) {
    for (const skill of trained) {
      out += bullet(`${skill.name} ${signed(skill.modifier)}${skill.proficiency === 'expertise' ? ' (expertise)' : ''}${skill.source ? ` — ${skill.source.name || skill.source.type}` : ''}`);
    }
  } else out += 'No trained skills.\n';
  const passive = sheet.senses.find((s) => s.type === 'passive Perception');
  if (passive) out += `\n**Passive Perception:** ${passive.value}\n`;
  out += '\n';

  out += heading('Attacks');
  for (const attack of sheet.attacks) {
    const bits = [];
    if (attack.attackBonus !== undefined) bits.push(`${signed(attack.attackBonus)} to hit`);
    if (attack.reach) bits.push(`reach ${attack.reach} ft.`);
    if (attack.normalRange) bits.push(`range ${attack.normalRange}/${attack.longRange} ft.`);
    if (attack.thrownRange) bits.push(`thrown ${attack.thrownRange[0]}/${attack.thrownRange[1]} ft.`);
    out += bullet(`**${attack.name}** — ${bits.join(', ')}${bits.length ? ', ' : ''}${damageText(attack.damage)}${attack.properties?.length ? ` *(${attack.properties.join(', ')})*` : ''}`);
  }
  out += '\n';

  if (sheet.spellcasting) {
    const sc = sheet.spellcasting;
    out += heading('Spellcasting');
    out += line('Ability', `${ABILITY_NAMES[sc.ability]} (${signed(sc.abilityModifier)})`);
    out += line('Spell Save DC', sc.spellSaveDC);
    out += line('Spell Attack', signed(sc.spellAttackBonus));
    if (sc.slots?.length) {
      out += line('Slots', sc.slots.map((s) => `${ordinal(s.level)} ×${s.total}${s.pact ? ' (pact)' : ''}`).join(', '));
    }
    out += '\n';
    if (sc.cantrips?.length) out += `**Cantrips:** ${sc.cantrips.map((s) => s.name).join(', ')}\n\n`;
    if (sc.bonusCantrips?.length) out += `**Bonus cantrips:** ${sc.bonusCantrips.map((s) => `${s.name} (${s.grantedBy})`).join(', ')}\n\n`;
    if (sc.alwaysPrepared?.length) out += `**Always prepared:** ${sc.alwaysPrepared.map((s) => s.name).join(', ')}\n\n`;
    const list = sc.preparedSpells || sc.knownSpells || [];
    if (list.length) {
      out += `**${sc.prepares ? 'Prepared' : 'Known'} (${list.length}${sc.preparedLimit || sc.knownLimit ? `/${sc.preparedLimit || sc.knownLimit}` : ''}):**\n\n`;
      for (const level of [...new Set(list.map((s) => s.level))].sort((a, b) => a - b)) {
        out += bullet(`*${ordinal(level)}:* ${list.filter((s) => s.level === level).map((s) => s.name).join(', ')}`);
      }
      out += '\n';
    }
    if (sc.innateSpells?.length) {
      out += `**Innate:** ${sc.innateSpells.map((s) => `${s.name} (${s.uses})`).join(', ')}\n\n`;
    }
    if (sc.mysticArcanum?.length) {
      out += `**Mystic Arcanum:** ${sc.mysticArcanum.map((s) => `${s.name} (${ordinal(s.level)})`).join(', ')}\n\n`;
    }
    if (sc.spellbook?.length) {
      out += `**Spellbook (${sc.spellbook.length}):** ${sc.spellbook.map((s) => s.name).join(', ')}\n\n`;
    }
  }

  out += heading('Features');
  for (const feature of sheet.features) {
    out += bullet(`**${feature.name}** *(level ${feature.level})* — ${feature.description}`);
  }
  out += '\n';
  if (sheet.feats.length) {
    out += heading('Feats');
    for (const feat of sheet.feats) out += bullet(`**${feat.name}** — ${feat.description}`);
    out += '\n';
  }
  if (sheet.resources.length) {
    out += heading('Resources');
    for (const pool of sheet.resources) {
      out += bullet(`**${pool.name}** ${pool.max}${pool.recharge ? ` per ${pool.recharge}` : ''} *(${pool.source})*`);
    }
    out += '\n';
  }

  out += heading('Equipment');
  for (const item of sheet.equipment) {
    out += bullet(`${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}${item.equipped ? ' *(equipped)*' : ''}${item.note ? ` — ${item.note}` : ''}`);
  }
  out += `\n**Coin:** ${sheet.currency.gp} gp\n`;
  out += line('Languages', sheet.languages.map((l) => l.name).join(', '));
  if (sheet.defenses.resistances.length) {
    out += line('Resistances', sheet.defenses.resistances.map((r) => r.damage).join(', '));
  }
  out += '\n';

  out += heading('Personality');
  const p = sheet.personality;
  out += line('Disposition', p.disposition);
  out += line('Motivation', p.motivation);
  out += line('Ideal', p.ideal);
  out += line('Bond', p.bond);
  out += line('Flaw', p.flaw);
  out += line('Mannerism', p.mannerism);
  out += line('Voice', p.voiceCue);
  out += line('Wants', p.wants);
  out += line('Fears', p.fears);
  out += line('In combat', p.combatBehavior);
  out += line('Surrenders', p.surrenderCondition);
  out += '\n';

  out += generationSection(sheet);
  return out;
}

// --- creature -----------------------------------------------------------------------

export function creatureMarkdown(sheet) {
  let out = '';
  out += heading(sheet.identity.name, 1);
  out += `*${sheet.size} ${sheet.creatureType}${sheet.alignment ? `, ${sheet.alignment}` : ''}*\n\n`;

  if (sheet.contentNotice) out += `> ${sheet.contentNotice}\n\n`;

  out += line('Source', sheet.sourceMode === 'existing'
    ? `${sheet.baseCreature.name} (${sheet.baseCreature.source.packId} ${sheet.baseCreature.source.version})`
    : `${sheet.sourceMode}${sheet.baseCreature ? ` of ${sheet.baseCreature.name}` : ''}`);
  out += line('Challenge', `${sheet.challengeRating} (${sheet.xp} XP)`);
  out += line('Proficiency Bonus', signed(sheet.proficiencyBonus));
  out += line('Tactical Role', sheet.tacticalRole);
  out += '\n';

  out += line('Armor Class', `${sheet.armorClass.total}${sheet.armorClass.source ? ` (${sheet.armorClass.source})` : ''}`);
  out += line('Hit Points', `${sheet.hitPoints.average} (${sheet.hitPoints.formula})`);
  out += line('Speed', sheet.movement.map((m) => `${m.value} ft.${m.type === 'walk' ? '' : ` ${m.type}`}`).join(', '));
  out += '\n';

  out += abilityTable(sheet.abilityScores, sheet.abilityModifiers);

  if (sheet.savingThrows.length) {
    out += line('Saving Throws', sheet.savingThrows.map((s) => `${ABILITY_NAMES[s.ability].slice(0, 3)} ${signed(s.bonus)}`).join(', '));
  }
  if (sheet.skills.length) {
    out += line('Skills', sheet.skills.map((s) => `${s.name} ${signed(s.modifier)}`).join(', '));
  }
  if (sheet.vulnerabilities.length) out += line('Damage Vulnerabilities', sheet.vulnerabilities.join(', '));
  if (sheet.resistances.length) out += line('Damage Resistances', sheet.resistances.join(', '));
  if (sheet.immunities.length) out += line('Damage Immunities', sheet.immunities.join(', '));
  if (sheet.conditionImmunities.length) out += line('Condition Immunities', sheet.conditionImmunities.join(', '));
  out += line('Senses', sheet.senses.map((s) => (s.range ? `${s.type} ${s.range} ft.` : `${s.type} ${s.value}`)).join(', '));
  out += line('Languages', sheet.languages.map((l) => l.name).join(', ') || '—');
  out += '\n';

  if (sheet.traits.length) {
    out += heading('Traits');
    for (const trait of sheet.traits) out += `***${trait.name}.*** ${trait.description}\n\n`;
  }

  out += actionSection('Actions', sheet.actions);
  out += actionSection('Bonus Actions', sheet.bonusActions);
  out += actionSection('Reactions', sheet.reactions);
  out += actionSection('Legendary Actions', sheet.legendaryActions);

  if (sheet.spellcasting) {
    out += heading('Spellcasting');
    out += line('Ability', ABILITY_NAMES[sheet.spellcasting.ability]);
    out += line('Save DC', sheet.spellcasting.dc);
    out += line('Spell Attack', signed(sheet.spellcasting.attackBonus));
    out += '\n';
    for (const group of sheet.spellcasting.groups) {
      out += `***${group.label}.*** ${group.spells.map((s) => s.name).join(', ')}\n\n`;
    }
  }

  if (sheet.transforms?.length) {
    out += heading('Applied Transforms');
    for (const t of sheet.transforms) out += bullet(`**${t.name}** — ${t.effect}`);
    out += '\n';
  }
  if (sheet.crEvaluation) {
    out += heading('CR Evaluation');
    out += line('Evaluated', `${sheet.crEvaluation.evaluatedCR} (defensive ${sheet.crEvaluation.defensiveCR}, offensive ${sheet.crEvaluation.offensiveCR})`);
    if (sheet.crEvaluation.targetCR) out += line('Requested', sheet.crEvaluation.targetCR);
    out += line('Effective HP', sheet.crEvaluation.effectiveHP);
    out += line('Damage per round', sheet.crEvaluation.damagePerRound);
    for (const a of sheet.crEvaluation.assumptions) out += bullet(`*assumption:* ${a}`);
    for (const w of sheet.crEvaluation.warnings) out += bullet(`*warning:* ${w}`);
    out += '\n';
  }

  if (sheet.personality) {
    out += heading('Tactics and Disposition');
    out += line('Disposition', sheet.personality.disposition);
    out += line('In combat', sheet.personality.combatBehavior);
    out += line('Surrenders', sheet.personality.surrenderCondition);
    out += line('Wants', sheet.personality.wants);
    out += line('Fears', sheet.personality.fears);
    out += '\n';
  }

  out += generationSection(sheet);
  return out;
}

function actionSection(title, actions) {
  if (!actions?.length) return '';
  let out = heading(title);
  for (const action of actions) {
    const bits = [];
    if (action.attack) {
      const type = action.attack.range ? 'Ranged' : 'Melee';
      const reach = action.attack.range
        ? `range ${action.attack.range.normal}/${action.attack.range.long} ft.`
        : `reach ${action.attack.reach} ft.`;
      bits.push(`*${type} Attack:* ${signed(action.attack.bonus)} to hit, ${reach}`);
    }
    if (action.save) bits.push(`*DC ${action.save.dc} ${ABILITY_NAMES[action.save.ability]} save*`);
    if (action.recharge) bits.push(`*(Recharge ${action.recharge.formula})*`);
    if (action.uses) bits.push(`*(${action.uses}/day)*`);
    if (action.cost) bits.push(`*(costs ${action.cost} actions)*`);
    const dmg = damageText(action.damage);
    out += `***${action.name}.*** ${bits.join(' ')}${dmg ? ` *Hit:* ${dmg}.` : ''}${action.description ? ` ${action.description}` : ''}\n\n`;
  }
  return out;
}

function generationSection(sheet) {
  let out = heading('Generation and Provenance');
  const g = sheet.generation;
  out += line('Seed', g.seed);
  out += line('Generator', g.generatorVersion);
  out += line('Ruleset', `${g.ruleset.id} ${g.ruleset.version}`);
  out += line('Content packs', g.contentPacks.map((p) => `${p.id} ${p.version}`).join(', '));
  if (Object.keys(g.rerolls || {}).length) {
    out += line('Rerolls', Object.entries(g.rerolls).map(([k, v]) => `${k}×${v}`).join(', '));
  }
  if (sheet.validation) {
    out += line('Validation', `${sheet.validation.errors.length} errors, ${sheet.validation.warnings.length} warnings`);
  }
  for (const note of g.notes || []) out += bullet(`*note:* ${note}`);
  out += '\n';
  for (const source of g.attribution || []) {
    out += `> ${source.notice}\n\n`;
  }
  return out;
}

// --- encounter --------------------------------------------------------------------

/**
 * A group as a DM would want it on one page: the roster and the difficulty
 * arithmetic first, so the encounter can be run from the summary alone, then
 * every member's full stat block underneath it.
 *
 * `sheets` is optional -- passing only the encounter gives the one-page summary
 * without the stat blocks, which is what fits on an index card.
 */
export function encounterMarkdown(encounter, sheets = []) {
  const e = encounter;
  let out = '';

  out += heading(`Encounter — ${e.difficulty.label} for ${e.party.size} characters at level ${e.party.level}`, 1);
  out += `*${e.composition.summary} · ${e.requested.shape} · ${e.requested.style}*\n\n`;

  out += heading('Difficulty');
  out += line('Requested', `${e.requested.difficulty} (${e.requested.budget} XP budget)`);
  out += line('Raw XP', e.xp.raw);
  out += line('Action economy', `x${e.xp.multiplier} for ${e.members.length} enemies against ${e.party.size} characters`);
  out += line('Adjusted XP', `${e.xp.adjusted} (${e.xp.drift > 0 ? '+' : ''}${e.xp.drift}% against budget)`);
  out += line('Plays as', `${e.difficulty.label} — ${e.difficulty.ratio}x a standard encounter`);
  out += line('XP award', `${e.xp.raw} total, ${e.xp.perCharacter} per character`);
  out += '\n';

  out += heading('Roster');
  out += '| # | Enemy | CR | XP | AC | HP | Role |\n';
  out += '| --- | --- | --- | --- | --- | --- | --- |\n';
  for (const m of e.members) {
    out += `| ${m.ordinal} | ${m.name} | ${m.challengeRating} | ${m.xp} | ${m.armorClass} | ${m.hitPoints} `
      + `| ${m.tier === 'leader' ? 'leader' : m.creatureType}${m.spellcaster ? ', caster' : ''} |\n`;
  }
  out += '\n';

  if (e.warnings.length) {
    out += heading('Warnings');
    for (const warning of e.warnings) out += bullet(warning);
    out += '\n';
  }
  if (e.notes.length) {
    out += heading('Notes');
    for (const note of e.notes) out += bullet(note);
    out += '\n';
  }

  out += heading('How this was built');
  out += bullet(`Seed \`${e.seed}\`, generator ${e.generation.generatorVersion}, `
    + `${e.generation.contentPacks.map((p) => `${p.id} ${p.version}`).join(', ')}.`);
  out += bullet('Budget derived from the SRD XP ladder: a standard encounter for four characters of '
    + 'level L is one creature of CR L. Difficulty and party size scale that; the number of enemies '
    + 'scales it again through the action economy multiplier.');
  out += bullet('Every stat block below was produced by the ordinary creature generator and carries its '
    + 'own independent validation.');
  out += '\n';

  for (const entry of sheets) {
    const sheet = entry.sheet || entry;
    if (!sheet || sheet.kind !== 'creature') continue;
    out += '---\n\n';
    out += creatureMarkdown(sheet);
  }

  return out;
}

const ordinal = (n) => (n === 0 ? 'cantrip' : `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || (n % 100 - n % 10 === 10) ? 0 : n % 10]}`);

export { ordinal };
