// The spec form.
//
// Built from the registry rather than hard-coded, so adding a species or a
// creature family to a content pack makes it appear here with no UI change.
// The form's only job is to produce a spec object; it knows nothing about how
// generation works.

import { CHARACTER_ROLES, ABILITY_METHODS, HP_POLICIES } from '../sheets/character/spec.js';
import { CREATURE_ROLES, CREATURE_MODES } from '../sheets/creature/spec.js';
import { CR_LADDER, formatCR } from '../rules/srd51/proficiency.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function field(label, control, hint) {
  const wrap = el('div', 'field');
  const lab = el('label', null, label);
  lab.setAttribute('for', control.id);
  wrap.append(lab, control);
  if (hint) wrap.append(el('div', 'hint', hint));
  return wrap;
}

function select(id, options, value) {
  const node = el('select');
  node.id = id;
  for (const option of options) {
    const opt = el('option', null, option.label);
    opt.value = option.value;
    if (String(option.value) === String(value)) opt.selected = true;
    node.append(opt);
  }
  return node;
}

function number(id, value, min, max) {
  const node = el('input');
  node.type = 'number';
  node.id = id;
  node.value = value;
  node.min = min;
  node.max = max;
  return node;
}

function text(id, value, placeholder) {
  const node = el('input');
  node.type = 'text';
  node.id = id;
  node.value = value || '';
  node.placeholder = placeholder || '';
  node.spellcheck = false;
  return node;
}

function checkbox(id, label, checked) {
  const wrap = el('div', 'field row');
  const box = el('input');
  box.type = 'checkbox';
  box.id = id;
  box.checked = checked;
  const lab = el('label', null, label);
  lab.setAttribute('for', id);
  wrap.append(box, lab);
  return wrap;
}

const titled = (text) => el('div', 'section-title', text);
const named = (list) => list.map((v) => ({ value: v, label: v.replace(/-/g, ' ') }));
const ANY = { value: 'random', label: 'Random / any' };

/** Distinct values of a tag array across a content kind, for filter menus. */
function collect(registry, kind, key) {
  const values = new Set();
  for (const entry of registry.all(kind)) for (const v of entry[key] || []) values.add(v);
  return [...values].sort();
}

export function createControls(root, { registry, state, onChange }) {
  function render() {
    root.replaceChildren();
    if (state.kind === 'character') renderCharacter();
    else renderCreature();
    for (const input of root.querySelectorAll('input, select')) {
      input.addEventListener('change', onChange);
    }
  }

  function renderCharacter() {
    const s = state.character;
    root.append(titled('Character'));
    root.append(field('Level', number('level', s.level, 1, 20)));
    root.append(field('Role', select('role', [ANY, ...named(CHARACTER_ROLES)], s.role),
      'Roles guide which legal options get picked. They never make an illegal one legal.'));
    root.append(field('Theme', text('theme', s.theme, 'e.g. Forest Guide'),
      'Free text. Nudges class, background and skill choices toward a matching flavour.'));

    root.append(titled('Build'));
    root.append(field('Species', select('species', [ANY, ...registry.all('species').map(refOption)], s.species)));
    root.append(field('Class', select('class', [ANY, ...registry.all('class').map(refOption)], s.class)));
    root.append(field('Background', select('background', [ANY, ...registry.all('background').map(refOption)], s.background)));

    root.append(titled('Method'));
    root.append(field('Ability scores', select('abilityMethod', named(ABILITY_METHODS), s.abilityMethod)));
    root.append(field('Hit points', select('hpPolicy', named(HP_POLICIES), s.hpPolicy),
      'Fixed uses the average of the hit die each level, which is what makes a sheet comparable to another of the same level.'));

    root.append(titled('Constraints'));
    root.append(field('Spellcasting', select('spellcaster', [
      { value: 'any', label: 'Either' },
      { value: 'yes', label: 'Must cast spells' },
      { value: 'no', label: 'Must not cast spells' },
    ], s.spellcaster)));
    root.append(field('Preferred range', select('rangePreference', [
      { value: 'any', label: 'Let the role decide' },
      { value: 'melee', label: 'Melee' },
      { value: 'ranged', label: 'Ranged' },
    ], s.rangePreference)));
    root.append(field('Required skill', select('requiredSkill', [
      { value: '', label: 'None' },
      ...registry.all('skill').map(refOption),
    ], s.requiredSkill)));
    root.append(checkbox('named', 'Give them a name', s.named));
  }

  function renderCreature() {
    const s = state.creature;
    root.append(titled('Creature'));
    root.append(field('Mode', select('mode', [
      { value: 'existing', label: 'Existing — a real SRD creature' },
      { value: 'variant', label: 'Variant — documented transforms' },
      { value: 'generated', label: 'Generated — original mechanics' },
    ].filter((o) => CREATURE_MODES.includes(o.value)), s.mode),
    s.mode === 'existing'
      ? 'Returns a published stat block, normalised and never altered to force a rating.'
      : 'Re-rated by the CR model and labelled as generated content.'));

    root.append(field('Target CR', select('targetCR', [
      { value: 'any', label: 'Any' },
      ...CR_LADDER.filter((c) => c <= 20).map((c) => ({ value: String(c), label: `CR ${formatCR(c)}` })),
    ], s.targetCR)));

    root.append(field('Creature type', select('creatureType', [
      { value: 'any', label: 'Any' },
      ...collect(registry, 'monster', 'families').length
        ? [...new Set(registry.all('monster').map((m) => m.creatureType))].sort().map((t) => ({ value: t, label: t }))
        : [],
    ], s.creatureType)));

    root.append(field('Family', select('family', [
      { value: 'any', label: 'Any' },
      ...collect(registry, 'monster', 'families').map((f) => ({ value: f, label: f })),
    ], s.family)));

    root.append(field('Environment', select('environment', [
      { value: 'any', label: 'Any' },
      ...collect(registry, 'monster', 'environments').map((e) => ({ value: e, label: e })),
    ], s.environment)));

    root.append(field('Tactical role', select('creatureRole', [
      { value: 'any', label: 'Any' },
      ...named(CREATURE_ROLES),
    ], s.role), s.mode === 'existing'
      ? 'Metadata only for a real creature: it filters the search and never changes the stat block.'
      : 'Shapes how the CR budget is spent between hit points, armour and damage.'));

    if (s.mode !== 'generated') {
      root.append(titled('Base creature'));
      root.append(field('Pick a specific creature', select('baseCreature', [
        ANY,
        ...registry.all('monster')
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((m) => ({ value: m.slug, label: `${m.name} (CR ${m.cr})` })),
      ], s.baseCreature)));
    }

    root.append(titled('Constraints'));
    root.append(field('Spellcasting', select('cSpellcaster', [
      { value: 'any', label: 'Either' }, { value: 'yes', label: 'Casts spells' }, { value: 'no', label: 'No spellcasting' },
    ], s.spellcaster)));
    root.append(field('Flight', select('flying', [
      { value: 'any', label: 'Either' }, { value: 'yes', label: 'Can fly' }, { value: 'no', label: 'Cannot fly' },
    ], s.flying)));
    root.append(field('Ranged attacks', select('ranged', [
      { value: 'any', label: 'Either' }, { value: 'yes', label: 'Has a ranged attack' }, { value: 'no', label: 'Melee only' },
    ], s.ranged)));
    root.append(field('Theme', text('ctheme', s.theme, 'e.g. crypt guardian')));
    root.append(checkbox('withPersonality', 'Roll disposition and tactics', s.withPersonality));
  }

  /** Reads the current form back into the state object it came from. */
  function read() {
    const value = (id) => root.querySelector(`#${id}`)?.value;
    const checked = (id) => !!root.querySelector(`#${id}`)?.checked;

    if (state.kind === 'character') {
      Object.assign(state.character, {
        level: Number(value('level')) || 1,
        role: value('role'),
        theme: value('theme') || '',
        species: value('species'),
        class: value('class'),
        background: value('background'),
        abilityMethod: value('abilityMethod'),
        hpPolicy: value('hpPolicy'),
        spellcaster: value('spellcaster'),
        rangePreference: value('rangePreference'),
        requiredSkill: value('requiredSkill') || '',
        named: checked('named'),
      });
    } else {
      Object.assign(state.creature, {
        mode: value('mode'),
        targetCR: value('targetCR'),
        creatureType: value('creatureType'),
        family: value('family'),
        environment: value('environment'),
        role: value('creatureRole'),
        baseCreature: value('baseCreature') || 'random',
        spellcaster: value('cSpellcaster'),
        flying: value('flying'),
        ranged: value('ranged'),
        theme: value('ctheme') || '',
        withPersonality: checked('withPersonality'),
      });
    }
  }

  return { render, read };
}

const refOption = (entry) => ({ value: entry.slug, label: entry.name });

/** Turns the form's tri-state selects into the spec's `true | false | null`. */
export const triState = (value) => (value === 'yes' ? true : value === 'no' ? false : null);

/** Builds the generation spec the API expects from the stored form state. */
export function toCharacterSpec(seed, s) {
  return {
    seed,
    level: s.level,
    role: s.role,
    theme: s.theme,
    species: s.species,
    class: s.class,
    background: s.background,
    named: s.named,
    constraints: {
      abilityMethod: s.abilityMethod,
      hpPolicy: s.hpPolicy,
      spellcaster: triState(s.spellcaster),
      meleePreferred: s.rangePreference === 'melee' ? true : null,
      rangedPreferred: s.rangePreference === 'ranged' ? true : null,
      requiredSkills: s.requiredSkill ? [s.requiredSkill] : [],
      requiredLanguages: [],
    },
  };
}

export function toCreatureSpec(seed, s) {
  return {
    seed,
    mode: s.mode,
    targetCR: s.targetCR === 'any' ? null : Number(s.targetCR),
    creatureType: s.creatureType === 'any' ? null : s.creatureType,
    family: s.family === 'any' ? null : s.family,
    environment: s.environment === 'any' ? null : s.environment,
    role: s.role === 'any' ? null : s.role,
    baseCreature: s.baseCreature,
    theme: s.theme,
    withPersonality: s.withPersonality,
    constraints: {
      spellcaster: triState(s.spellcaster),
      flying: triState(s.flying),
      ranged: triState(s.ranged),
    },
  };
}
