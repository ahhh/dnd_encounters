// App bootstrap.
//
// Wires the toolbar, the spec form and the view tabs to the generator API. All
// the state that matters lives in the seed and the form: press Generate twice
// without changing anything and you get the same sheet, which is the whole
// premise of the tool and worth being able to demonstrate by hand.

import {
  generateCharacter, generateCreature, generateSheets, getRegistry,
  toMarkdown, toDocument, serializeDocument, importDocument, reroll, REROLL_SCOPES,
} from '../api.js';
import { fingerprint } from '../core/ids.js';
import { createControls, toCharacterSpec, toCreatureSpec } from './controls.js';
import { renderCharacter, renderCreature, el } from './sheetview.js';
import { renderInspector } from './inspector.js';

const $ = (id) => document.getElementById(id);
const registry = getRegistry();
const AUTOSAVE = 'sheetforge.state.v1';

const state = {
  kind: 'character',
  view: 'sheet',
  result: null,
  roster: [],
  rosterIndex: -1,
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
  const spec = currentSpec(seed);
  const result = state.kind === 'character'
    ? generateCharacter(spec, { registry })
    : generateCreature(spec, { registry });
  show(result);
  state.roster = [];
  state.rosterIndex = -1;
  renderRoster();
  persist();
}

function generateBatch() {
  controls.read();
  const seed = $('seed').value.trim() || 'unseeded';
  const count = Math.max(1, Math.min(24, Number($('batchcount').value) || 1));
  const label = state.kind === 'character' ? (state.character.role === 'random' ? 'NPC' : state.character.role) : 'enemy';
  const batch = generateSheets([{
    kind: state.kind, label, count,
    // The batch API derives a child seed per entity; leaving this undefined is
    // what lets it do that instead of producing the same sheet n times.
    spec: { ...currentSpec(undefined), seed: undefined },
  }], { seed, registry });

  state.roster = batch.sheets;
  state.rosterIndex = 0;
  if (batch.failures.length) {
    setStatus(null, `${batch.failures.length} of ${count} failed: ${batch.failures[0].failure.message}`);
  }
  if (batch.sheets.length) show(batch.sheets[0]);
  renderRoster();
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
  const result = state.result;
  if (!result?.ok) return;
  const output = $('output');
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

// --- status ---------------------------------------------------------------------------

function setStatus(result, message) {
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
$('batch').addEventListener('click', generateBatch);

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
  if (!state.result?.ok) return;
  try {
    await navigator.clipboard.writeText(toMarkdown(state.result.sheet));
    $('st-hint').textContent = 'Markdown copied to the clipboard.';
  } catch {
    $('st-hint').textContent = 'Clipboard blocked; use the Markdown tab and copy by hand.';
  }
});

$('savejson').addEventListener('click', () => {
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
      character: state.character, creature: state.creature,
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
