// Slot casting: choosing which creature fills each slot.
//
// This is where the encounter layer takes the responsibility the build plan
// assigns it -- "an encounter system owns which entities exist" -- and it is
// deliberately not delegated downward. Asked for a CR 1/2 creature on its own,
// the creature generator will happily return a CR 2 one with a note, because a
// near miss is a better answer than no answer to somebody who wanted *an*
// enemy. Inside a group that behaviour compounds: eight near misses in the same
// direction turn a standard encounter into a deadly one while every individual
// sheet remains perfectly defensible.
//
// So the group picks its own creatures at exactly the rating it budgeted for,
// and then asks the creature generator to build that specific creature's sheet.
// The sheet layer still owns everything about the sheet; it just no longer gets
// to choose the cast.
//
// Variety is chosen per *tier* rather than per slot. A line of eight enemies
// drawn independently reads as a coincidence; two or three kinds of creature
// across those eight reads as a warband.

import { parseCR } from '../rules/srd51/proficiency.js';

/** How many distinct creatures a tier of this size should field. */
export const varietyFor = (count) => Math.max(1, Math.min(3, Math.ceil(count / 3)));

/**
 * Scores a candidate for a slot. Rating is not scored at all here -- candidates
 * are pre-filtered to the exact rating, so scoring it again would only blur a
 * decision that has already been made correctly.
 */
export function scoreCandidate(monster, { style, family, environment, theme, tier }) {
  let score = 1;
  const flies = (monster.speed || []).some((s) => s.type === 'fly');
  const ranged = (monster.actions || []).some((a) => a.attack && a.attack.range);

  if (style === 'caster' && monster.spellcasting) score += 8;
  if (style === 'caster' && !monster.spellcasting && ranged) score += 2;
  if (style === 'melee' && !monster.spellcasting && !ranged) score += 6;
  if (style === 'melee' && !monster.spellcasting) score += 2;

  if (family && (monster.families || []).includes(family)) score += 6;
  if (environment && (monster.environments || []).includes(environment)) score += 4;

  if (tier === 'leader') {
    if (['leader', 'controller', 'solo'].includes(monster.tacticalRole)) score += 4;
    if (monster.legendaryActions?.length) score += 3;
    if (flies) score += 1;
  }

  if (theme) {
    const t = theme.toLowerCase();
    if ((monster.environments || []).some((e) => t.includes(e))) score += 3;
    if ((monster.families || []).some((f) => t.includes(f))) score += 3;
    if (monster.name.toLowerCase().split(/\s+/).some((w) => t.includes(w))) score += 5;
  }
  return score;
}

/**
 * Candidates at exactly this rating, loosened one constraint at a time. Returns
 * what it found plus what it had to give up, because a group that quietly
 * ignored the caster nudge should say so rather than just look wrong.
 */
export function castingCandidates(pool, want) {
  const atRating = pool.filter((m) => parseCR(m.cr) === parseCR(want.cr));
  if (!atRating.length) return { candidates: [], relaxed: ['rating'] };

  const steps = [
    { relax: [], filter: (m) => matchStyle(m, want.style) && matchFamily(m, want.family) && matchEnv(m, want.environment) },
    { relax: ['environment'], filter: (m) => matchStyle(m, want.style) && matchFamily(m, want.family) },
    { relax: ['environment', 'family'], filter: (m) => matchStyle(m, want.style) },
    { relax: ['environment', 'family', 'style'], filter: () => true },
  ];
  for (const step of steps) {
    const candidates = atRating.filter(step.filter);
    if (candidates.length) return { candidates, relaxed: step.relax };
  }
  return { candidates: atRating, relaxed: ['environment', 'family', 'style'] };
}

const matchFamily = (m, family) => !family || (m.families || []).includes(family);
const matchEnv = (m, environment) => !environment || (m.environments || []).includes(environment);

function matchStyle(m, style) {
  if (style === 'caster') return !!m.spellcasting;
  if (style === 'melee') {
    const ranged = (m.actions || []).some((a) => a.attack && a.attack.range);
    return !m.spellcasting && !ranged;
  }
  return true;
}

/**
 * Casts one tier: draws a few distinct creatures, then deals them out across
 * the tier's slots. Dealing is weighted too, so "six goblins and two
 * hobgoblins" is a likelier reading than an even three-and-three split.
 */
export function castTier({ pool, slots, want, stream }) {
  const { candidates, relaxed } = castingCandidates(pool, want);
  if (!candidates.length) return null;

  const weightOf = (m) => scoreCandidate(m, want) ** 1.5;
  const cast = stream.sampleWeighted(candidates, varietyFor(slots.length), weightOf);
  if (!cast.length) return null;

  // The first drawn creature is the tier's mainstay; later ones thin out.
  const assignments = slots.map((slot, i) => {
    if (i < cast.length) return cast[i];            // every kind appears at least once
    return stream.weighted(cast, (m, index) => weightOf(m) / (index + 1));
  });

  return { assignments, relaxed, considered: candidates.length };
}
