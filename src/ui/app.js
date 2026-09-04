// App bootstrap.
//
// Wires the toolbar, the spec form and the view tabs to the generator API. All
// the state that matters lives in the seed and the form: press Generate twice
// without changing anything and you get the same sheet, which is the whole
// premise of the tool and worth being able to demonstrate by hand.

import {
  generateCharacter, generateCreature, generateEncounter, getRegistry,
  toMarkdown, toDocument, serializeDocument, importDocument, reroll, REROLL_SCOPES,
  encounterMarkdown, toEncounterDocument,
} from '../api.js';
import { fingerprint } from '../core/ids.js';
import { createControls, toCharacterSpec, toCreatureSpec, toGroupSpec } from './controls.js';
import { renderCharacter, renderCreature, el } from './sheetview.js';
import { renderEncounter, renderGroupRoster } from './groupview.js';
import { renderInspector } from './inspector.js';

const $ = (id) => document.getElementById(id);
const registry = getRegistry();
const AUTOSAVE = 'sheetforge.state.v1';

const state = {
  kind: 'character',
  view: 'sheet',
  result: null,
  roster: [],
  // -1 selects the encounter summary; 0+ selects a member's sheet.
  rosterIndex: -1,
  encounter: null,
  groupResult: null,
  character: {
    level: 5, role: 'scout', theme: 'Forest Guide',
    species: 'random', class: 'random', background: 'random',
    abilityMethod: 'standard-array', hpPolicy: 'fixed',
    spellcaster: 'any', rangePreference: 'any', requiredSkill: '', named: true,
  },
  creature: {
    mode: 'existing', targetCR: '3', creatureType: 'any', family: 'undead',
    environment: 'crypt', role: 'any', baseCreature: 'random',
    spellcaster: 'any', flying: 'any', ranged: 'any',
    theme: '', withPersonality: true,
  },
  group: {
    partyLevel: 5, partySize: 4, difficulty: 'standard',
    shape: 0, style: 0,
    mode: 'existing', creatureType: 'any', family: 'any', environment: 'any',
    theme: '', maxEnemies: 16, mixedTiers: true, cohesion: true, withPersonality: true,
  },
};

restore();

const controls = createControls($('side'), {
  registry, state, onChange: () => { controls.read(); persist(); },
});

// --- generation ------------------------------------------------------------------

function currentSpec(seed) {
  return state.kind === 'character'
    ? toCharacterSpec(seed, state.character)
    : toCreatureSpec(seed, state.creature);
}

function generate() {
  controls.read();
  const seed = $('seed').value.trim() || 'unseeded';
  if (state.kind === 'group') { generateGroup(seed); return; }

  const spec = currentSpec(seed);
  const result = state.kind === 'character'
    ? generateCharacter(spec, { registry })
    : generateCreature(spec, { registry });
  state.encounter = null;
  state.roster = [];
  state.rosterIndex = -1;
  show(result);
  renderRoster();
  persist();
}

/**
 * The group tab. One call produces the whole encounter -- composition, roster
 * and every member's sheet -- so there is no separate "and now fill it in"
 * step that could disagree with the summary.
 */
function generateGroup(seed) {
  const result = generateEncounter(toGroupSpec(seed, state.group), { registry });
  if (!result.ok) {
    state.encounter = null;
    state.roster = [];
    state.rosterIndex = -1;
    renderRoster();
    show(result);
    persist();
    return;
  }
  state.encounter = result.encounter;
  state.groupResult = result;
  state.roster = result.sheets;
  state.rosterIndex = -1;
  state.result = null;
  renderRoster();
  renderView();
  renderRerollBar();
  setStatus(null, null, result.encounter);
  $('output').scrollTop = 0;
  persist();
}

function show(result) {
  state.result = result;
  const output = $('output');
  output.replaceChildren();

  if (!result.ok) {
    const f = result.failure;
    output.append(el('article', 'sheet'));
    const box = output.firstChild;
    box.append(el('h1', null, 'No sheet was produced'));
    box.append(el('p', 'subtitle', `${f.code} at stage "${f.stage}"`));
    box.append(el('div', 'notice err', f.message));
    if (f.validationErrors?.length) {
      box.append(el('h2', null, 'Validation errors'));
      for (const e of f.validationErrors) {
        const entry = el('div', 'entry');
        entry.append(el('div', 'name', `${e.code} · ${e.path}`), el('div', 'body', e.message));
        box.append(entry);
      }
    }
    box.append(el('p', 'hint',
      'The generator returns a structured failure rather than a sheet it knows to be wrong. Try a different seed, or relax a constraint.'));
    setStatus(null, f.message);
    renderRerollBar();
    return;
  }

  renderView();
  renderRerollBar();
  setStatus(result);
  $('output').scrollTop = 0;
}

function renderView() {
  const output = $('output');

  // The group summary is selected: the encounter itself is the document, and
  // every view tab shows the encounter rather than any one member.
  if (state.kind === 'group' && state.encounter && state.rosterIndex === -1) {
    output.replaceChildren();
    const encounter = state.encounter;
    if (state.view === 'sheet') {
      output.append(renderEncounter(encounter, (index) => selectMember(index)));
    } else if (state.view === 'markdown') {
      output.append(el('pre', 'code', encounterMarkdown(encounter, state.roster)));
    } else if (state.view === 'json') {
      output.append(el('pre', 'code',
        serializeDocument(toEncounterDocument(state.groupResult, registry))));
    } else {
      output.append(renderGroupInspector(state.groupResult));
    }
    return;
  }

  const result = state.result;
  if (!result?.ok) return;
  output.replaceChildren();
  const sheet = result.sheet;

  if (state.view === 'sheet') {
    output.append(sheet.kind === 'creature' ? renderCreature(sheet) : renderCharacter(sheet));
  } else if (state.view === 'markdown') {
    output.append(el('pre', 'code', toMarkdown(sheet)));
  } else if (state.view === 'json') {
    output.append(el('pre', 'code', serializeDocument(toDocument(result, registry))));
  } else {
    output.append(renderInspector(result));
  }
}

// --- rerolls ----------------------------------------------------------------------

const CHARACTER_SCOPES = ['everything', 'identity', 'build', 'abilities', 'skills', 'equipment', 'spells', 'personality'];
const CREATURE_SCOPES = ['enemy-base', 'enemy-features', 'enemy-actions', 'enemy-spells', 'enemy-personality'];

function renderRerollBar() {
  const bar = $('rerollbar');
  bar.replaceChildren();
  // Rerolling one stream of one member would leave the group's arithmetic
  // describing a roster that no longer exists, so the summary offers a new
  // seed instead. A member's own sheet still rerolls normally.
  if (state.kind === 'group' && state.rosterIndex === -1) return;
  if (!state.result?.ok) return;
  bar.append(el('span', 'lbl', 'Reroll'));
  const scopes = state.result.sheet.kind === 'creature' ? CREATURE_SCOPES : CHARACTER_SCOPES;
  for (const scope of scopes) {
    if (!REROLL_SCOPES[scope]) continue;
    const button = el('button', 'ghost', scope.replace('enemy-', ''));
    button.title = `Reroll ${scope}: bumps only the ${REROLL_SCOPES[scope].length} stream(s) it covers`;
    button.addEventListener('click', () => {
      const next = reroll(state.result.sheet, scope, { registry });
      show(next);
    });
    bar.append(button);
  }
}

// --- roster --------------------------------------------------------------------------

function renderRoster() {
  const panel = $('roster');
  const crumb = $('groupcrumb');

  if (state.kind === 'group' && state.encounter) {
    renderGroupRoster(panel, state.encounter, state.roster, state.rosterIndex, select);
    crumb.hidden = false;
    crumb.textContent = state.rosterIndex === -1
      ? 'Encounter'
      : `Encounter › ${state.roster[state.rosterIndex]?.sheet.identity.name || ''}`;
    return;
  }

  crumb.hidden = true;
  panel.replaceChildren();
  if (state.roster.length < 2) { panel.hidden = true; return; }
  panel.hidden = false;
  panel.append(el('h3', null, `Group (${state.roster.length})`));
  state.roster.forEach((entry, index) => {
    const sheet = entry.sheet;
    const button = el('button', 'rosteritem');
    button.setAttribute('aria-pressed', String(index === state.rosterIndex));
    button.append(el('div', 'n', sheet.identity.name));
    button.append(el('div', 'd', sheet.kind === 'creature'
      ? `${sheet.size} ${sheet.creatureType} · CR ${sheet.challengeRating}`
      : `${sheet.species.name} ${sheet.classLevels[0].name} ${sheet.level}`));
    button.addEventListener('click', () => {
      state.rosterIndex = index;
      show(entry);
      renderRoster();
    });
    panel.append(button);
  });
}

/** Moves between the encounter summary (-1) and a member's sheet. */
function select(index) {
  state.rosterIndex = index;
  if (index === -1) {
    state.result = null;
    renderView();
    renderRerollBar();
    setStatus(null, null, state.encounter);
  } else {
    show(state.roster[index]);
  }
  renderRoster();
  $('output').scrollTop = 0;
}

const selectMember = (index) => select(index);

/**
 * The group inspector: what the composer considered, and why it picked what it
 * picked. The shortlist is the useful part -- it is the only place the shape
 * nudge's effect on the search is visible.
 */
function renderGroupInspector(result) {
  const root = el('article', 'sheet');
  const inspector = result.inspector;
  root.append(el('h1', null, 'Composition search'));
  root.append(el('p', 'subtitle',
    `${inspector.considered} compositions priced · ${inspector.poolSize} creatures in the filtered pool`));

  root.append(el('h2', null, 'Shortlist'));
  const table = el('table', 'grid');
  const thead = el('thead');
  const hr = el('tr');
  for (const h of ['Composition', 'Enemies', 'Adjusted XP', 'Score', 'Budget miss', 'Shape miss']) {
    hr.append(el('th', null, h));
  }
  thead.append(hr);
  const tbody = el('tbody');
  for (const row of inspector.shortlist) {
    const tr = el('tr', row.chosen ? 'trained' : 'untrained');
    tr.append(el('td', null, `${row.composition}${row.chosen ? '  ← chosen' : ''}`));
    tr.append(el('td', 'n', String(row.count)));
    tr.append(el('td', 'n', String(row.adjustedXP)));
    tr.append(el('td', 'n', String(row.score)));
    tr.append(el('td', 'n', String(row.terms.budgetError)));
    tr.append(el('td', 'n', String(row.terms.shapeError)));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  root.append(table);

  root.append(el('h2', null, 'Slots'));
  const slots = el('table', 'grid');
  const sthead = el('thead');
  const shr = el('tr');
  for (const h of ['#', 'Rating', 'Tier', 'Style asked for']) shr.append(el('th', null, h));
  sthead.append(shr);
  const stbody = el('tbody');
  for (const slot of inspector.slots) {
    const tr = el('tr');
    tr.append(el('td', 'n', String(slot.ordinal)));
    tr.append(el('td', 'n', `CR ${slot.cr}`));
    tr.append(el('td', null, slot.tier));
    tr.append(el('td', null, slot.style));
    stbody.append(tr);
  }
  slots.append(sthead, stbody);
  root.append(slots);

  root.append(el('h2', null, 'Ratings available'));
  root.append(el('p', 'hint',
    `The search was restricted to CR ${inspector.ladder.join(', ')} — the ratings the enabled content `
    + 'can actually supply for this request, above the relevance floor for this party level.'));
  return root;
}

// --- status ---------------------------------------------------------------------------

function setStatus(result, message, encounter) {
  if (encounter) {
    $('st-seed').textContent = encounter.seed;
    const v = encounter.validation;
    $('st-valid').textContent = v?.valid
      ? `group validated · 0 errors${encounter.warnings.length ? `, ${encounter.warnings.length} warnings` : ''}`
      : `${v?.errors.length || 0} validation errors`;
    $('st-valid').className = v?.valid ? 'ok' : 'err';
    $('st-fingerprint').textContent = fingerprint(encounter);
    $('st-hint').textContent =
      `${encounter.difficulty.label} · ${encounter.xp.adjusted} XP against a ${encounter.xp.budget} budget`;
    return;
  }
  if (!result?.ok) {
    $('st-seed').textContent = $('seed').value;
    $('st-valid').textContent = message ? 'failed' : '—';
    $('st-valid').className = message ? 'err' : '';
    $('st-fingerprint').textContent = '—';
    $('st-hint').textContent = message || '';
    return;
  }
  const v = result.validation;
  $('st-seed').textContent = result.sheet.seed;
  $('st-valid').textContent = v.valid
    ? `validated · 0 errors${v.warnings.length ? `, ${v.warnings.length} warnings` : ''}`
    : `${v.errors.length} validation errors`;
  $('st-valid').className = v.valid ? 'ok' : 'err';
  $('st-fingerprint').textContent = fingerprint(result.sheet);
  $('st-hint').textContent = 'Same seed, spec and versions always reproduce this sheet.';
}

// --- toolbar ----------------------------------------------------------------------------

$('generate').addEventListener('click', generate);

$('reseed').addEventListener('click', () => {
  $('seed').value = randomSeed();
  generate();
});

$('seed').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') generate();
});

for (const tab of $('kindtabs').querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    state.kind = tab.dataset.kind;
    for (const other of $('kindtabs').querySelectorAll('.tab')) {
      other.setAttribute('aria-pressed', String(other === tab));
    }
    controls.render();
    persist();
    generate();
  });
}

for (const tab of $('viewtabs').querySelectorAll('.vtab')) {
  tab.addEventListener('click', () => {
    state.view = tab.dataset.view;
    for (const other of $('viewtabs').querySelectorAll('.vtab')) {
      other.setAttribute('aria-pressed', String(other === tab));
    }
    renderView();
    persist();
  });
}

$('copymd').addEventListener('click', async () => {
  const text = state.kind === 'group' && state.rosterIndex === -1
    ? (state.encounter ? encounterMarkdown(state.encounter, state.roster) : null)
    : (state.result?.ok ? toMarkdown(state.result.sheet) : null);
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    $('st-hint').textContent = 'Markdown copied to the clipboard.';
  } catch {
    $('st-hint').textContent = 'Clipboard blocked; use the Markdown tab and copy by hand.';
  }
});

$('savejson').addEventListener('click', () => {
  if (state.kind === 'group' && state.rosterIndex === -1) {
    if (!state.encounter) return;
    const text = serializeDocument(toEncounterDocument(state.groupResult, registry));
    download(`encounter-${state.encounter.seed.replace(/[^a-z0-9]+/g, '-')}.json`, text);
    return;
  }
  if (!state.result?.ok) return;
  const text = serializeDocument(toDocument(state.result, registry));
  const name = `${state.result.sheet.identity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
  download(name, text);
});

$('load').addEventListener('click', () => $('loadfile').click());
$('loadfile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const imported = importDocument(await file.text());
  event.target.value = '';
  if (!imported.ok) { $('st-hint').textContent = `Could not load: ${imported.error}`; return; }
  if (imported.encounter) {
    // A saved group reopens complete: summary, roster and stat blocks, all
    // exactly as stored rather than recomposed.
    state.kind = 'group';
    state.encounter = imported.encounter;
    state.groupResult = { ok: true, encounter: imported.encounter, sheets: imported.sheets.map((sheet) => ({ sheet })), inspector: null };
    state.roster = state.groupResult.sheets;
    state.rosterIndex = -1;
    state.result = null;
    for (const tab of $('kindtabs').querySelectorAll('.tab')) {
      tab.setAttribute('aria-pressed', String(tab.dataset.kind === 'group'));
    }
    controls.render();
    renderRoster();
    renderView();
    renderRerollBar();
    setStatus(null, null, imported.encounter);
    $('seed').value = imported.document.manifest?.requestedSeed || imported.encounter.seed;
    $('st-hint').textContent = imported.warning || 'Loaded from file — shown as stored, not regenerated.';
    return;
  }
  // A loaded sheet is shown exactly as stored; it is not regenerated.
  show({ ok: true, sheet: imported.sheet, validation: imported.sheet.validation, inspector: null });
  $('seed').value = imported.document.manifest?.requestedSeed || imported.sheet.seed;
  $('st-hint').textContent = imported.warning || 'Loaded from file — shown as stored, not regenerated.';
});

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const SEED_WORDS = ['ember', 'raven', 'crypt', 'ashen', 'quiet', 'hollow', 'iron', 'salt', 'thorn', 'grey',
  'warden', 'eye', 'moth', 'lantern', 'bell', 'oath', 'kiln', 'vale', 'rook', 'tide'];

function randomSeed() {
  // The one place uncontrolled randomness is correct: choosing a *new* seed is
  // a user action, not part of generation.
  const pick = () => SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 9000) + 1000}`;
}

// --- persistence -----------------------------------------------------------------------

function persist() {
  try {
    localStorage.setItem(AUTOSAVE, JSON.stringify({
      kind: state.kind, view: state.view, seed: $('seed').value,
      character: state.character, creature: state.creature, group: state.group,
    }));
  } catch { /* private browsing, quota, or a browser that blocks storage */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUTOSAVE) || 'null');
    if (!saved) return;
    if (saved.kind) state.kind = saved.kind;
    if (saved.view) state.view = saved.view;
    Object.assign(state.character, saved.character || {});
    Object.assign(state.creature, saved.creature || {});
    Object.assign(state.group, saved.group || {});
    if (saved.seed) queueMicrotask(() => { $('seed').value = saved.seed; });
  } catch { /* ignore unreadable stored state */ }
}

// --- start ------------------------------------------------------------------------------

for (const tab of $('kindtabs').querySelectorAll('.tab')) {
  tab.setAttribute('aria-pressed', String(tab.dataset.kind === state.kind));
}
for (const tab of $('viewtabs').querySelectorAll('.vtab')) {
  tab.setAttribute('aria-pressed', String(tab.dataset.view === state.view));
}
controls.render();
generate();
