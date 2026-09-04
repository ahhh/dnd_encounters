// Debug inspector.
//
// Shows the decisions behind a sheet: the streams that were drawn from, the
// scored candidate pools, the ability assignment, the build choices, and the
// validation result. It exists so that "why did I get a warlock?" has an answer
// on screen rather than in a debugger.

import { el } from './sheetview.js';
import { ABILITY_NAMES, signed } from '../rules/srd51/abilities.js';

const section = (title) => el('h2', null, title);

function scoreTable(title, rows) {
  const wrap = el('div');
  wrap.append(el('div', 'entry').appendChild(el('div', 'name', title)).parentElement);
  const table = el('table', 'grid');
  const thead = el('thead');
  const hr = el('tr');
  for (const h of ['Candidate', 'Score', 'Share']) hr.append(el('th', null, h));
  thead.append(hr);
  const total = rows.reduce((sum, r) => sum + Math.max(0, r.score), 0) || 1;
  const tbody = el('tbody');
  for (const row of [...rows].sort((a, b) => b.score - a.score)) {
    const tr = el('tr', row.selected ? 'trained' : 'untrained');
    tr.append(
      el('td', null, `${row.name}${row.selected ? '  ← selected' : ''}`),
      el('td', 'n', row.score.toFixed(2)),
      el('td', 'n', `${(Math.max(0, row.score) / total * 100).toFixed(1)}%`),
    );
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

export function renderInspector(result) {
  const root = el('article', 'sheet');
  const { sheet, inspector, validation } = result;
  root.append(el('h1', null, 'Inspector'));
  root.append(el('p', 'subtitle', `${sheet.identity.name} — seed ${sheet.seed}`));

  if (validation) {
    root.append(section('Validation'));
    const kind = validation.valid ? 'ok' : 'err';
    root.append(el('div', `notice ${kind}`,
      `${validation.errors.length} errors, ${validation.warnings.length} warnings from independent recomputation.`));
    for (const issue of [...validation.errors, ...validation.warnings]) {
      const entry = el('div', 'entry');
      entry.append(el('div', 'name', `${issue.code} · ${issue.path}`), el('div', 'body', issue.message));
      root.append(entry);
    }
  }

  if (!inspector) {
    root.append(el('p', 'hint', 'No inspector data was recorded for this sheet (it was loaded from a file rather than generated).'));
    return root;
  }

  if (inspector.plan) {
    root.append(section('Build plan'));
    const plan = inspector.plan;
    root.append(el('div', 'entry').appendChild(el('div', 'body',
      `Role ${plan.role} · combat style ${plan.combatStyle} · equipment profile ${plan.equipmentProfile}`
      + `${plan.spellProfile ? ` · spell profile ${plan.spellProfile}` : ''}`)).parentElement);
    root.append(el('div', 'hint', `Ability priority: ${plan.preferredAbilities.map((a) => ABILITY_NAMES[a]).join(' > ')}`));
    root.append(el('div', 'hint', `Preferred skills: ${plan.preferredSkills.join(', ')}`));
  }

  const selected = {
    class: sheet.classLevels?.[0]?.id,
    species: sheet.species?.id,
    background: sheet.background?.id,
    base: inspector.selected?.id,
  };
  for (const [key, rows] of Object.entries(inspector.candidates || {})) {
    root.append(section(`${key} candidates`));
    root.append(scoreTable(`scored against the plan`, rows.map((r) => ({
      name: `${r.name}${r.cr ? ` (CR ${r.cr})` : ''}`,
      score: r.score,
      selected: r.id === selected[key],
    }))));
  }

  if (inspector.abilities) {
    root.append(section('Ability assignment'));
    const a = inspector.abilities;
    root.append(el('div', 'hint', `${a.method} — ${a.note}; base array [${a.baseArray.join(', ')}] assigned in priority order.`));
    const table = el('table', 'grid');
    const thead = el('thead');
    const hr = el('tr');
    for (const h of ['Ability', 'Rank', 'Base', 'Adjustments', 'After species']) hr.append(el('th', null, h));
    thead.append(hr);
    const tbody = el('tbody');
    for (const row of a.assignment) {
      const entry = a.breakdown[row.ability];
      const tr = el('tr');
      tr.append(
        el('td', null, ABILITY_NAMES[row.ability]),
        el('td', 'n', String(row.rank)),
        el('td', 'n', String(entry.base)),
        el('td', null, entry.adjustments.map((adj) => `${signed(adj.value)} ${adj.source.name}`).join(', ') || '—'),
        el('td', 'n', String(entry.final)),
      );
      tbody.append(tr);
    }
    table.append(thead, tbody);
    root.append(table);
    root.append(el('div', 'hint', 'Ability score improvements are applied after this table; see build choices below.'));
  }

  if (sheet.buildChoices?.length) {
    root.append(section('Build choices'));
    for (const choice of sheet.buildChoices) {
      const entry = el('div', 'entry');
      entry.append(el('div', 'name', `${choice.choiceType} (level ${choice.level})`));
      entry.append(el('div', 'body', choice.selected
        .map((s) => (s.ability ? `${ABILITY_NAMES[s.ability]} ${signed(s.value)}` : s.name || s.id))
        .join(', ') || choice.note || '—'));
      root.append(entry);
    }
  }

  if (inspector.crPasses || inspector.variantAttempts) {
    root.append(section('CR search'));
    const rows = inspector.crPasses || inspector.variantAttempts;
    const table = el('table', 'grid');
    const headers = inspector.crPasses
      ? ['Pass', 'HP offset', 'Damage offset', 'AC offset', 'Evaluated', 'Def', 'Off']
      : ['Attempt', 'Base', 'Base CR', 'Evaluated', 'Within policy'];
    const thead = el('thead');
    const hr = el('tr');
    for (const h of headers) hr.append(el('th', null, h));
    thead.append(hr);
    const tbody = el('tbody');
    for (const row of rows) {
      const tr = el('tr');
      const cells = inspector.crPasses
        ? [row.pass, row.offsets.hp.toFixed(1), row.offsets.damage.toFixed(1), row.offsets.ac,
          row.evaluatedCR, row.defensiveCR, row.offensiveCR]
        : [row.attempt, row.base, row.baseCR, row.evaluatedCR, row.withinPolicy ? 'yes' : 'no'];
      for (const cell of cells) tr.append(el('td', null, String(cell)));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    root.append(table);
  }

  if (inspector.crEvaluation) {
    root.append(section('CR evaluation (informational)'));
    root.append(el('div', 'hint',
      'An existing creature keeps its printed challenge rating. This is what the project’s CR model computes for it, shown so the model can be judged.'));
    const e = inspector.crEvaluation;
    root.append(el('div', 'entry').appendChild(el('div', 'body',
      `evaluated ${e.evaluatedCR} (defensive ${e.defensiveCR}, offensive ${e.offensiveCR}) · effective HP ${e.effectiveHP} · ${e.damagePerRound} damage/round`)).parentElement);
    for (const a of e.assumptions) root.append(el('div', 'hint', `assumption: ${a}`));
  }

  if (inspector.derived?.streams) {
    root.append(section('Random streams drawn'));
    const table = el('table', 'grid');
    const thead = el('thead');
    const hr = el('tr');
    for (const h of ['Namespace', 'Stream seed', 'Draws']) hr.append(el('th', null, h));
    thead.append(hr);
    const tbody = el('tbody');
    for (const s of inspector.derived.streams) {
      const tr = el('tr');
      tr.append(el('td', null, s.namespace), el('td', 'n', s.seedU32.toString(16)), el('td', 'n', String(s.draws)));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    root.append(table);
    root.append(el('div', 'hint',
      'Each namespace is an independent sequence. Rerolling one cannot shift the values another draws.'));
  }

  return root;
}
