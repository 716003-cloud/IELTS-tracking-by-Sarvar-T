import { describe, it, expect } from 'vitest';
import { LISTENING_TABLE, READING_ACADEMIC_TABLE, bandFor, overallBand, roundToHalfBand, isValidBand } from '../src/core/bands.js';
import { calcWritingTaskBand, combineWriting, calcSpeakingBand } from '../src/core/scoring.js';

describe('conversion tables', () => {
  for (const [name, t] of [['listening', LISTENING_TABLE], ['reading', READING_ACADEMIC_TABLE]]) {
    it(`${name}: 41 entries, valid half bands, never decreasing`, () => {
      expect(t).toHaveLength(41);
      t.forEach((b, i) => { expect(isValidBand(b)).toBe(true); if (i) expect(b).toBeGreaterThanOrEqual(t[i - 1]); });
      expect(t[40]).toBe(9);
    });
  }
  it('matches the British Council minimum-mark anchors (band 5/6/7/8)', () => {
    expect([16, 23, 30, 35].map(r => bandFor('listening', r))).toEqual([5, 6, 7, 8]);
    expect([15, 23, 30, 35].map(r => bandFor('reading', r))).toEqual([5, 6, 7, 8]);
    expect([15, 22, 29, 34].map(r => bandFor('listening', r))).toEqual([4.5, 5.5, 6.5, 7.5]);
    expect([14, 22, 29, 34].map(r => bandFor('reading', r))).toEqual([4.5, 5.5, 6.5, 7.5]);
  });
  it('resolves the unresolved/inconsistent anchors', () => {
    expect(bandFor('listening', 26)).toBe(6.5);
    expect(bandFor('listening', 18)).toBe(5.5);
    expect(bandFor('listening', 15)).toBe(4.5);
    expect(bandFor('reading', 39)).toBe(9);
    expect(bandFor('reading', 26)).toBe(6);
    expect(bandFor('reading', 18)).toBe(5);
  });
  it('rejects invalid raw scores', () => {
    expect(bandFor('listening', -1)).toBeNull();
    expect(bandFor('listening', 41)).toBeNull();
    expect(bandFor('reading', 3.5)).toBeNull();
    expect(bandFor('reading', null)).toBeNull();
  });
});

describe('overall band', () => {
  const o = (l, r, w, s) => overallBand({ listening: l, reading: r, writing: w, speaking: s });
  it('official British Council examples', () => {
    expect(o(6.5, 6.5, 5, 7).value).toBe(6.5);   // 6.25 -> 6.5
    expect(o(4, 3.5, 4, 4).value).toBe(4);       // 3.875 -> 4.0
    expect(o(6.5, 6.5, 5.5, 6).value).toBe(6);   // 6.125 -> 6.0
  });
  it('.75 rounds up to next whole band, .25 up to next half', () => {
    expect(o(7, 7, 7, 6).value).toBe(7);         // 6.75 -> 7.0
    expect(o(6, 6, 6, 6.5).value).toBe(6);       // 6.125 -> 6.0
    expect(o(6, 6, 6.5, 6.5).value).toBe(6.5);   // 6.25 -> 6.5
  });
  it('rounding edge cases', () => {
    expect(roundToHalfBand([7, 7, 7, 6.5])).toBe(7);     // 6.875 -> 7
    expect(roundToHalfBand([6.5, 7, 7, 6.5])).toBe(7);   // 6.75 -> 7
    expect(roundToHalfBand([6, 6, 6.5, 6])).toBe(6);     // 6.125 -> 6
    expect(roundToHalfBand([6, 6.5, 6, 6.5])).toBe(6.5); // 6.25 -> 6.5
    expect(roundToHalfBand([5.5, 5.5, 5.5, 6])).toBe(5.5); // 5.625 -> 5.5
    expect(roundToHalfBand([9, 9, 9, 9])).toBe(9);
    expect(roundToHalfBand([0, 0, 0, 0.5])).toBe(0);     // 0.125 -> 0
  });
  it('missing skills are never zero; incomplete is labelled', () => {
    const r = o(7, 7, null, undefined);
    expect(r).toMatchObject({ value: 7, complete: false, estimate: true, count: 2 });
    expect(o(null, null, null, null).value).toBeNull();
    expect(o(7, 7, 7, 7)).toMatchObject({ complete: true, estimate: false });
  });
});

describe('writing / speaking scoring (provisional)', () => {
  it('mean of four criteria, half-band rounding; null when incomplete', () => {
    expect(calcWritingTaskBand({ ta: 6, cc: 6, lr: 6.5, gra: 6.5 })).toBe(6.5); // 6.25 -> 6.5
    expect(calcWritingTaskBand({ ta: 6, cc: 6, lr: 6, gra: null })).toBeNull();
    expect(calcSpeakingBand({ fc: 7, lr: 7, gra: 6, pr: 6 })).toBe(6.5);        // 6.5
  });
  it('task 2 counts double when combined', () => {
    expect(combineWriting(6, 7)).toBe(6.5);     // (6 + 2*7)/3 = 6.67 -> 6.5
    expect(combineWriting(7, 6)).toBe(6.5);     // (7 + 2*6)/3 = 6.33 -> 6.5
    expect(combineWriting(5, 8)).toBe(7);       // (5 + 16)/3 = 7.0
    expect(combineWriting(null, 7)).toBeNull();
  });
});
