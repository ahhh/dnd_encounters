// Encounter validation.
//
// Independent recomputation, the same discipline the sheet validators follow:
// it takes the finished encounter plus the sheets and works the difficulty out
// again from the ratings that are actually on those sheets. It shares no code
// with the composer, so a composer that prices a group wrongly and an encounter
// that records the wrong total cannot agree with each other by construction.
//
// What it does *not* do is second-guess the individual stat blocks. Each member
// arrived carrying its own validation from the creature validator; repeating
// that here would only mean two implementations of the same check drifting
// apart. This validator is about the group: are these the creatures the
// encounter claims to contain, and does their combined weight match the number
// printed at the top of the page.

import { CODES, Issues } from '../core/validation.js';
import { parseCR, xpForCR } from '../rules/srd51/proficiency.js';
import { encounterXP, difficultyOf, partyBudget } from '../rules/srd51/encounter.js';

export function validateEncounter(encounter, sheets) {
  const issues = new Issues();

  issues.require('party.level', encounter.party?.level, 'party level');
  issues.require('party.size', encounter.party?.size, 'party size');
  issues.requireArray('members', encounter.members, 'members', 1);

  const members = encounter.members || [];

  // The roster and the sheets must be the same set of creatures. A member row
  // whose sheet is missing is the failure mode that would let the summary and
  // the stat blocks disagree.
  const byId = new Map((sheets || []).map((entry) => [entry.sheet?.id, entry.sheet]));
  members.forEach((member, i) => {
    const sheet = byId.get(member.sheetId);
    if (!sheet) {
      issues.error(CODES.UNRESOLVED_REF, `members[${i}]`,
        `${member.name} has no matching sheet in the group`);
      return;
    }
    issues.expect(`members[${i}].challengeRating`, member.challengeRating, sheet.challengeRating,
      `${member.name} challenge rating`);
    issues.expect(`members[${i}].xp`, member.xp, xpForCR(sheet.challengeRating),
      `${member.name} XP`);
    issues.expect(`members[${i}].hitPoints`, member.hitPoints, sheet.hitPoints.max,
      `${member.name} hit points`);
    issues.expect(`members[${i}].armorClass`, member.armorClass, sheet.armorClass.total,
      `${member.name} armour class`);
    if (sheet.validation && !sheet.validation.valid) {
      issues.error(CODES.BAD_VALUE, `members[${i}]`,
        `${member.name} carries ${sheet.validation.errors.length} validation errors of its own`);
    }
  });

  // The group arithmetic, worked out again from the sheets.
  const crs = members.map((m) => m.challengeRating);
  const recomputed = encounterXP(crs, encounter.party?.size ?? 4);
  issues.expect('xp.raw', encounter.xp?.raw, recomputed.raw, 'raw XP');
  issues.expect('xp.multiplier', encounter.xp?.multiplier, recomputed.multiplier, 'action economy multiplier');
  issues.expect('xp.adjusted', encounter.xp?.adjusted, recomputed.adjusted, 'adjusted XP');

  const party = { partyLevel: encounter.party?.level, partySize: encounter.party?.size };
  const recomputedDifficulty = difficultyOf(recomputed.adjusted, party);
  issues.expect('difficulty.label', encounter.difficulty?.label, recomputedDifficulty.label, 'difficulty');
  issues.expect('difficulty.ratio', encounter.difficulty?.ratio, recomputedDifficulty.ratio, 'difficulty ratio');

  const spec = encounter.generation?.spec;
  if (spec) {
    issues.expect('xp.budget', encounter.xp?.budget, partyBudget(spec), 'budget');
  }

  // Advisory only: these are properties of a *good* encounter, not of a
  // correct one, so they can never fail a group that adds up.
  const ratings = crs.map(parseCR);
  if (ratings.length > (encounter.party?.size ?? 4) * 3) {
    issues.warn(CODES.BAD_VALUE, 'members',
      `${ratings.length} enemies against ${encounter.party?.size} characters is a lot of initiative to track`);
  }
  if (ratings.length && Math.max(...ratings) > (encounter.party?.level ?? 1) + 5) {
    issues.warn(CODES.CR_POLICY, 'members',
      `the strongest enemy is CR ${Math.max(...ratings)} against level ${encounter.party?.level} characters`);
  }

  return issues.result();
}
