// Proficiency bonus, for both rules models.
//
// Characters and creatures share the same progression curve but index it
// differently -- a character by level, a creature by challenge rating -- so
// both live here and the two callers can never drift apart.

export const proficiencyBonusForLevel = (level) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

/** CR 0-4 all use +2; from CR 5 the curve matches character levels. */
export function proficiencyBonusForCR(cr) {
  const n = typeof cr === 'number' ? cr : parseCR(cr);
  if (n < 5) return 2;
  return 2 + Math.floor((n - 1) / 4);
}

/** "1/4" -> 0.25. Fractional CRs are stored as strings so they print correctly. */
export function parseCR(cr) {
  if (typeof cr === 'number') return cr;
  const text = String(cr).trim();
  if (text.includes('/')) {
    const [a, b] = text.split('/');
    return Number(a) / Number(b);
  }
  return Number(text);
}

export function formatCR(value) {
  if (value === 0.125) return '1/8';
  if (value === 0.25) return '1/4';
  if (value === 0.5) return '1/2';
  return String(value);
}

/** XP by challenge rating (SRD 5.1). */
export const XP_BY_CR = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100,
  1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900,
  9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
  16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000,
  22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000,
  28: 120000, 29: 135000, 30: 155000,
};

export const xpForCR = (cr) => XP_BY_CR[parseCR(cr)] ?? 0;

/** Every CR the tables cover, in order. Used to snap an evaluated CR. */
export const CR_LADDER = Object.keys(XP_BY_CR).map(Number).sort((a, b) => a - b);
