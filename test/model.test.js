import { describe, it, expect } from 'vitest';
import { newPractice, recordSummary, attemptSummary, parseScoreInput, scoreError, validatePractice, canMarkComplete, assessmentStatus, newWriting } from '../src/core/model.js';

const withScores = (kind, a1, a2, a3) => {
  const r = newPractice(kind);
  if (a1) r.attempts[1].scores = a1;
  if (a2) r.attempts[2].scores = a2;
  if (a3) r.attempts[3].scores = a3;
  return r;
};

describe('listening attempts (spec example)', () => {
  const r = withScores('listening', [5, 6, 7, 8], [7, 7, 8, 9], [9, 8, 9, 9]);
  const s = recordSummary(r);
  it('totals, incorrect answers and bands', () => {
    expect(s.attempts.map(a => a.total)).toEqual([26, 31, 35]);
    expect(s.attempts.map(a => a.incorrect)).toEqual([14, 9, 5]);
    expect(s.attempts.map(a => a.band)).toEqual([6.5, 7, 8]);
  });
  it('improvements are computed from cumulative totals', () => {
    expect(s.improvements).toEqual({ a2vs1: 5, a3vs2: 4, a3vs1: 9 });
    expect(s.partDeltas[2]).toEqual([2, 1, 1, 1]);
    expect(s.finalAttempt).toBe(3);
    expect(s.finalBand).toBe(8);
  });
  it('a lower later score shows an honest negative difference', () => {
    const lower = recordSummary(withScores('listening', [8, 8, 8, 8], [7, 8, 8, 8]));
    expect(lower.improvements.a2vs1).toBe(-1);
    expect(lower.partDeltas[2][0]).toBe(-1);
  });
  it('attempt 3 stays optional; incomplete attempts produce no total or band', () => {
    const only12 = recordSummary(withScores('listening', [5, 6, 7, 8], [7, 7, 8, 9]));
    expect(only12.attempts[2]).toMatchObject({ complete: false, total: null, band: null });
    expect(only12.improvements.a3vs2).toBeNull();
    expect(only12.finalAttempt).toBe(2);
    const partial = attemptSummary('listening', { scores: [5, null, 7, 8] });
    expect(partial).toMatchObject({ complete: false, total: null, band: null, filled: 3 });
  });
});

describe('reading limits and validation', () => {
  it('passage maxima are 13, 13, 14 and total never exceeds 40', () => {
    expect(scoreError('reading', 0, 14)).toMatch(/0 and 13/);
    expect(scoreError('reading', 1, 13)).toBeNull();
    expect(scoreError('reading', 2, 14)).toBeNull();
    expect(scoreError('reading', 2, 15)).toMatch(/0 and 14/);
    expect(attemptSummary('reading', { scores: [13, 13, 14] }).total).toBe(40);
  });
  it('listening part maximum is 10', () => {
    expect(scoreError('listening', 3, 11)).toMatch(/0 and 10/);
    expect(scoreError('listening', 0, -1)).toMatch(/0 and 10/);
    expect(scoreError('listening', 0, 2.5)).toMatch(/whole/);
  });
  it('parseScoreInput rejects text and decimals instead of ignoring them', () => {
    expect(parseScoreInput('listening', 0, 'abc').error).toBeTruthy();
    expect(parseScoreInput('listening', 0, '7.5').error).toBeTruthy();
    expect(parseScoreInput('listening', 0, '-3').error).toBeTruthy();
    expect(parseScoreInput('listening', 0, '').value).toBeNull();
    expect(parseScoreInput('listening', 0, '09')).toEqual({ value: 9, error: null });
    expect(parseScoreInput('listening', 0, '11').error).toBeTruthy();
  });
  it('validatePractice lists impossible stored values', () => {
    const r = withScores('reading', [14, 5, 5]);
    expect(validatePractice(r).join(' ')).toMatch(/Attempt 1, Passage 1/);
    expect(validatePractice(newPractice('reading'))).toEqual([]);
  });
});

describe('completion rule', () => {
  it('requires a complete attempt 2', () => {
    expect(canMarkComplete(withScores('listening', [1, 2, 3, 4])).ok).toBe(false);
    expect(canMarkComplete(withScores('listening', [1, 2, 3, 4])).message).toMatch(/Attempt 2/);
    expect(canMarkComplete(withScores('listening', [1, 2, 3, 4], [2, 3, 4, 5])).ok).toBe(true);
  });
});

describe('assessment status', () => {
  it('distinguishes none / partial / assessed', () => {
    const w = newWriting(1);
    expect(assessmentStatus(w, 'writing').key).toBe('none');
    w.criteria.ta = 6;
    expect(assessmentStatus(w, 'writing').key).toBe('partial');
    Object.assign(w.criteria, { ta: 6, cc: 6, lr: 6, gra: 6 }); w.teacherOverall = 6;
    expect(assessmentStatus(w, 'writing').key).toBe('assessed');
  });
});
