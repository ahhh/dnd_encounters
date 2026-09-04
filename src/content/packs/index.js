// Pack assembly.
//
// Two packs, deliberately kept apart. `srd51` is licensed content and carries
// the attribution notice the licence requires on every entity it contributes.
// `openflavor` is written for this project. Anything a sheet uses records which
// of the two it came from, so a generated NPC can always be traced back to a
// licence.

import { definePack, createRegistry } from '../registry.js';
import { SKILLS, LANGUAGES, FEATS, BACKGROUNDS as SRD_BACKGROUNDS } from './srd51-core.js';
import { SPECIES } from './srd51-species.js';
import { CLASSES } from './srd51-classes.js';
import { WEAPONS, ARMOR, GEAR } from './srd51-equipment.js';
import { SPELLS } from './srd51-spells.js';
import { MONSTERS } from './srd51-monsters.js';
import { BACKGROUNDS, NAME_TABLES, PERSONALITY_TABLES, NPC_ARCHETYPES } from './open-flavor.js';

export const SRD51_MANIFEST = {
  id: 'srd51',
  name: 'System Reference Document 5.1',
  version: '5.1.0',
  license: 'CC-BY-4.0',
  url: 'https://dnd.wizards.com/resources/systems-reference-document',
  attribution:
    'This work includes material from the System Reference Document 5.1 ("SRD 5.1") by Wizards of '
    + 'the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. '
    + 'The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License, '
    + 'available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  note: 'Content is a curated subset of the SRD, restructured into machine-readable mechanics.',
};

export const OPEN_FLAVOR_MANIFEST = {
  id: 'openflavor',
  name: 'Open Flavour Pack',
  version: '1.0.0',
  license: 'CC0-1.0',
  attribution: 'Backgrounds, names, and personality tables written for this project and released under CC0 1.0.',
  note: 'Not derived from any published setting. Free to edit, extend, or replace.',
};

export const srd51Pack = definePack(SRD51_MANIFEST, {
  skill: SKILLS,
  language: LANGUAGES,
  feat: FEATS,
  background: SRD_BACKGROUNDS,
  species: SPECIES,
  class: CLASSES,
  weapon: WEAPONS,
  armor: ARMOR,
  gear: GEAR,
  spell: SPELLS,
  monster: MONSTERS,
});

export const openFlavorPack = definePack(OPEN_FLAVOR_MANIFEST, {
  background: BACKGROUNDS,
  'name-table': NAME_TABLES,
  'personality-table': PERSONALITY_TABLES,
  'npc-archetype': NPC_ARCHETYPES,
});

export const ALL_PACKS = [srd51Pack, openFlavorPack];

/** The default corpus. Pass a subset of pack ids to narrow it. */
export function buildRegistry(packIds = null) {
  const packs = packIds
    ? ALL_PACKS.filter((p) => packIds.includes(p.manifest.id))
    : ALL_PACKS;
  return createRegistry(packs);
}

export const DEFAULT_PACK_IDS = ALL_PACKS.map((p) => p.manifest.id);
