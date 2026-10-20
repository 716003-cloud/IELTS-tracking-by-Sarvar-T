// IELTS band conversion and overall-band maths. Pure functions, no I/O.
// See docs/CONVERSION_TABLES.md for sources and the corrections made to the supplied anchor table.

export const BAND_RANGE = { min: 0, max: 9 }; // configurable range for pickers / validation

// Explicit lookup tables: index = raw score (0..40), value = estimated band.
// Indicative only: the exact marks needed vary slightly between test versions.
export const LISTENING_TABLE = Object.freeze([
  /* 0-9  */ 0, 1, 2, 2, 2.5, 2.5, 3, 3, 3.5, 3.5,
  /* 10-19*/ 4, 4, 4, 4.5, 4.5, 4.5, 5, 5, 5.5, 5.5,
  /* 20-29*/ 5.5, 5.5, 5.5, 6, 6, 6, 6.5, 6.5, 6.5, 6.5,
  /* 30-39*/ 7, 7, 7.5, 7.5, 7.5, 8, 8, 8.5, 8.5, 9,
  /* 40   */ 9,
]);

export const READING_ACADEMIC_TABLE = Object.freeze([
  /* 0-9  */ 0, 1, 2, 2, 2.5, 2.5, 3, 3, 3.5, 3.5,
  /* 10-19*/ 4, 4, 4, 4.5, 4.5, 5, 5, 5, 5, 5.5,
  /* 20-29*/ 5.5, 5.5, 5.5, 6, 6, 6, 6, 6.5, 6.5, 6.5,
  /* 30-39*/ 7, 7, 7, 7.5, 7.5, 8, 8, 8.5, 8.5, 9,
  /* 40   */ 9,
]);

const TABLES = { listening: LISTENING_TABLE, reading: READING_ACADEMIC_TABLE };

/** The single authoritative raw-score -> band lookup. Returns null for invalid input. */
export function bandFor(skill, raw) {
  const t = TABLES[skill];
  if (!t || !Number.isInteger(raw) || raw < 0 || raw > 40) return null;
  return t[raw];
}

export const isValidBand = x =>
  typeof x === 'number' && Number.isFinite(x) && x >= BAND_RANGE.min && x <= BAND_RANGE.max && Number.isInteger(x * 2);

export const fmtBand = b => (b == null || Number.isNaN(b) ? '—' : Number(b).toFixed(1));
export const fmtDelta = (d, digits = 0) =>
  d == null ? '—' : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(digits)}`;

/**
 * IELTS rounding: the mean of the component bands is rounded to the nearest half band;
 * a mean ending in .25 rounds up to the next half band, and .75 rounds up to the next whole band.
 * Integer arithmetic in half-band units avoids floating-point errors.
 * `weights` default to equal weights.
 */
export function roundToHalfBand(values, weights) {
  if (!values.length || !values.every(isValidBand)) return null;
  const w = weights || values.map(() => 1);
  const wsum = w.reduce((a, b) => a + b, 0);
  const S = values.reduce((acc, v, i) => acc + v * 2 * w[i], 0); // weighted sum in half-bands
  // mean in half-bands = S / wsum ; round half up:  floor(S/wsum + 1/2)
  return Math.floor((2 * S + wsum) / (2 * wsum)) / 2;
}

/**
 * Overall IELTS band from the four skill bands.
 * Returns { value, complete, count, estimate }.
 * value is null unless at least one valid band exists; `estimate` is true when fewer than four skills are present.
 * Missing skills are never treated as zero.
 */
export function overallBand({ listening, reading, writing, speaking }) {
  const have = [listening, reading, writing, speaking].filter(isValidBand);
  if (!have.length) return { value: null, complete: false, count: 0, estimate: false };
  const value = roundToHalfBand(have);
  return { value, complete: have.length === 4, count: have.length, estimate: have.length < 4 };
}
