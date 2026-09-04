// Group rendering.
//
// The encounter summary: the page a DM actually runs the fight from. Like the
// sheet views, it computes nothing -- every number here was worked out by the
// encounter generator and independently re-derived by its validator, so the
// screen, the Markdown and the JSON cannot disagree.
//
// The difficulty arithmetic is shown as a worked line rather than a verdict.
// "Deadly" on its own is a number somebody else chose; "1400 raw XP x2.0 for
// five enemies = 2800 against a 2700 budget" is a claim a DM can check, argue
// with, and overrule -- which is the right relationship to have with a model
// that is explicitly an approximation.

import { el, notice } from './sheetview.js';

const pct = (n) => `${n > 0 ? '+' : ''}${n}%`;

function stat(key, value, why) {
  const box = el('div', 'stat');
  box.append(el('div', 'k', key), el('div', 'v', String(value)));
  if (why) box.append(el('div', 'why', why));
  return box;
}

/** The budget vs. delivered bar. Over-budget fills past the marker. */
function budgetBar(encounter) {
  const wrap = el('div', 'budgetbar');
  const ratio = encounter.xp.budget > 0 ? encounter.xp.adjusted / encounter.xp.budget : 0;
  const track = el('div', 'track');
  const fill = el('div', `fill ${ratio > 1.25 ? 'over' : ratio < 0.75 ? 'under' : 'on'}`);
  fill.style.width = `${Math.min(100, ratio * 100 * 0.8)}%`;
  const marker = el('div', 'marker');
  marker.style.left = '80%';
  track.append(fill, marker);
  wrap.append(track);
  const legend = el('div', 'legend');
  legend.append(el('span', null, `${encounter.xp.adjusted} adjusted XP`));
  legend.append(el('span', 'dim', `budget ${encounter.xp.budget} (${pct(encounter.xp.drift)})`));
  wrap.append(legend);
  return wrap;
}

export function renderEncounter(encounter, onSelect) {
  const root = el('article', 'sheet encounter');

  root.append(el('h1', null,
    `${titleCase(encounter.difficulty.label)} encounter`));
  root.append(el('p', 'subtitle',
    `${encounter.members.length} ${encounter.members.length === 1 ? 'enemy' : 'enemies'} for `
    + `${encounter.party.size} character${encounter.party.size === 1 ? '' : 's'} at level ${encounter.party.level}`
    + ` — ${encounter.requested.shape.toLowerCase()}, ${encounter.requested.style.toLowerCase()}`));

  const stats = el('div', 'statrow');
  stats.append(
    stat('Plays as', titleCase(encounter.difficulty.label),
      `${encounter.difficulty.ratio}x a standard encounter`),
    stat('Adjusted XP', encounter.xp.adjusted,
      `${encounter.xp.raw} raw x${encounter.xp.multiplier} action economy`),
    stat('Budget', encounter.xp.budget,
      `${encounter.requested.difficulty} · ${pct(encounter.xp.drift)}`),
    stat('XP award', encounter.xp.raw,
      `${encounter.xp.perCharacter} per character`),
  );
  root.append(stats);
  root.append(budgetBar(encounter));

  // --- roster -------------------------------------------------------------------

  root.append(el('h2', null, 'Roster'));
  const table = el('table', 'grid roster-table');
  const thead = el('thead');
  const hr = el('tr');
  for (const h of ['#', 'Enemy', 'CR', 'XP', 'AC', 'HP', 'Notes']) hr.append(el('th', null, h));
  thead.append(hr);
  const tbody = el('tbody');
  for (const member of encounter.members) {
    const tr = el('tr', member.tier === 'leader' ? 'leader' : null);
    tr.append(el('td', 'n', String(member.ordinal)));

    const nameCell = el('td');
    const link = el('button', 'linkish', member.name);
    link.title = 'Open this stat block';
    link.addEventListener('click', () => onSelect && onSelect(member.ordinal - 1));
    nameCell.append(link);
    tr.append(nameCell);

    tr.append(el('td', 'n', member.challengeRating));
    tr.append(el('td', 'n', String(member.xp)));
    tr.append(el('td', 'n', String(member.armorClass)));
    tr.append(el('td', 'n', String(member.hitPoints)));

    const tags = el('td');
    const chips = el('div', 'chips');
    if (member.tier === 'leader') chips.append(el('span', 'chip on', 'leader'));
    chips.append(el('span', 'chip', `${member.size} ${member.creatureType}`));
    if (member.spellcaster) chips.append(el('span', 'chip', 'caster'));
    if (member.challengeRating !== member.requestedCR) {
      chips.append(el('span', 'chip dimchip', `asked CR ${member.requestedCR}`));
    }
    tags.append(chips);
    tr.append(tags);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  root.append(table);

  // --- the arithmetic, shown ------------------------------------------------------

  root.append(el('h2', null, 'How the difficulty was worked out'));
  const steps = el('ol', 'workings');
  const perChar = Math.round(encounter.xp.budget
    / (encounter.party.size * factorFor(encounter.requested.difficulty)));
  steps.append(el('li', null,
    `A standard encounter for four characters of level ${encounter.party.level} is one creature of `
    + `CR ${encounter.party.level}, so one character's share is ${perChar} XP.`));
  steps.append(el('li', null,
    `${encounter.party.size} character${encounter.party.size === 1 ? '' : 's'} at `
    + `${encounter.requested.difficulty} difficulty gives a budget of ${encounter.xp.budget} XP.`));
  steps.append(el('li', null,
    `The composition ${encounter.composition.summary} is worth ${encounter.xp.raw} XP raw.`));
  steps.append(el('li', null,
    `${encounter.members.length} separate ${encounter.members.length === 1 ? 'enemy takes' : 'enemies take'} `
    + `${encounter.members.length === 1 ? 'one turn' : `${encounter.members.length} turns`} a round against `
    + `${encounter.party.size}, so the action economy multiplier is x${encounter.xp.multiplier}: `
    + `${encounter.xp.raw} x ${encounter.xp.multiplier} = ${encounter.xp.adjusted} adjusted XP.`));
  steps.append(el('li', null,
    `${encounter.xp.adjusted} against a standard budget of ${encounter.difficulty.standard} is `
    + `${encounter.difficulty.ratio}x, which is ${encounter.difficulty.label}.`));
  root.append(steps);

  for (const warning of encounter.warnings) root.append(notice(warning));

  if (encounter.notes.length) {
    root.append(el('h2', null, 'Notes'));
    for (const note of encounter.notes) {
      const entry = el('div', 'entry');
      entry.append(el('div', 'body', note));
      root.append(entry);
    }
  }

  root.append(notice(
    'The budget model is project-defined and derived from the SRD XP ladder — the SRD publishes no '
    + 'encounter-building guidance. It measures XP and turn count; it cannot see terrain, surprise, '
    + 'resource attrition or how the party is built. Treat it as a starting point you overrule.', 'ok'));

  return root;
}

const FACTORS = { light: 0.5, standard: 1, hard: 1.5, deadly: 2.25 };
const factorFor = (difficulty) => FACTORS[difficulty] ?? 1;
const titleCase = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);

/** The left-hand roster list for a group: the summary, then every member. */
export function renderGroupRoster(panel, encounter, sheets, selected, onSelect) {
  panel.replaceChildren();
  panel.hidden = false;
  panel.append(el('h3', null, `Group (${sheets.length})`));

  const summary = el('button', 'rosteritem summary');
  summary.setAttribute('aria-pressed', String(selected === -1));
  summary.append(el('div', 'n', 'Encounter summary'));
  summary.append(el('div', 'd',
    `${titleCase(encounter.difficulty.label)} · ${encounter.xp.adjusted} XP · ${encounter.difficulty.ratio}x`));
  summary.addEventListener('click', () => onSelect(-1));
  panel.append(summary);

  sheets.forEach((entry, index) => {
    const sheet = entry.sheet;
    const member = encounter.members[index];
    const button = el('button', `rosteritem${member?.tier === 'leader' ? ' leader' : ''}`);
    button.setAttribute('aria-pressed', String(index === selected));
    button.append(el('div', 'n', sheet.identity.name));
    button.append(el('div', 'd',
      `CR ${sheet.challengeRating} · AC ${sheet.armorClass.total} · ${sheet.hitPoints.max} hp`));
    button.addEventListener('click', () => onSelect(index));
    panel.append(button);
  });
}
