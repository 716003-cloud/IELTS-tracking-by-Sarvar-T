// Record factories, validation and derived values (totals, bands, improvements).
import { uid, todayISO, nowISO, isISODate } from './util.js';
import { bandFor, isValidBand } from './bands.js';
import { calcWritingTaskBand, calcSpeakingBand } from './scoring.js';

export const SCHEMA_VERSION = 1;

export const SKILLS = {
  listening: { key: 'listening', label: 'Listening', parts: 4, max: [10, 10, 10, 10], partWord: 'Part' },
  reading: { key: 'reading', label: 'Reading', parts: 3, max: [13, 13, 14], partWord: 'Passage' },
};
export const ATTEMPTS = [1, 2, 3];

const stamp = () => ({ createdAt: nowISO(), updatedAt: nowISO(), schemaVersion: SCHEMA_VERSION });

export function newPractice(kind) {
  const n = SKILLS[kind].parts;
  return {
    id: uid(), type: kind, date: todayISO(), source: '', description: '',
    partTitles: Array(n).fill(''),
    attempts: { 1: { scores: Array(n).fill(null) }, 2: { scores: Array(n).fill(null) }, 3: { scores: Array(n).fill(null) } },
    mistakes: Array.from({ length: n }, () => ({ categories: [], custom: '', review: {} })),
    completed: false, status: 'draft', ...stamp(),
  };
}
export const newWriting = task => ({
  id: uid(), type: task === 2 ? 'writing2' : 'writing1', date: todayISO(), title: '', prompt: '', essay: '', feedback: '',
  criteria: { ta: null, cc: null, lr: null, gra: null }, teacherOverall: null, status: 'draft', ...stamp(),
});
export const newSpeaking = () => ({
  id: uid(), type: 'speaking', date: todayISO(), title: '', topic: '', parts: [],
  criteria: { fc: null, lr: null, gra: null, pr: null }, overall: null, feedback: '', notes: '', status: 'draft', ...stamp(),
});

/** Error message for one score input, or null when valid / empty. */
export function scoreError(kind, partIndex, value) {
  if (value === null || value === undefined || value === '') return null;
  const max = SKILLS[kind].max[partIndex];
  if (typeof value !== 'number' || !Number.isInteger(value)) return 'Enter a whole number';
  if (value < 0 || value > max) return `Must be between 0 and ${max}`;
  return null;
}

/** Parse the raw text of a score input. Returns {value, error}. Invalid text yields value null + error. */
export function parseScoreInput(kind, partIndex, text) {
  const t = String(text ?? '').trim();
  if (t === '') return { value: null, error: null };
  if (!/^\d+$/.test(t)) return { value: null, error: 'Enter a whole number' };
  const v = Number(t);
  const error = scoreError(kind, partIndex, v);
  return error ? { value: null, error } : { value: v, error: null };
}

export function attemptSummary(kind, attempt) {
  const cfg = SKILLS[kind];
  const s = attempt?.scores || [];
  const filled = s.filter(v => Number.isInteger(v)).length;
  const complete = filled === cfg.parts;
  const total = complete ? s.reduce((a, b) => a + b, 0) : null;
  return {
    filled, started: filled > 0, complete, total,
    incorrect: complete ? 40 - total : null,
    band: complete ? bandFor(kind, total) : null,
  };
}

const diff = (a, b) => (a != null && b != null ? a - b : null);

/** Everything derived from a practice record (never stored, so it can never go stale). */
export function recordSummary(rec) {
  const kind = rec.type;
  const att = ATTEMPTS.map(i => attemptSummary(kind, rec.attempts?.[i]));
  const partDelta = i => // per-part change of attempt i (1-based, i>=2) versus the previous attempt
    rec.attempts[i].scores.map((v, p) => diff(Number.isInteger(v) ? v : null, Number.isInteger(rec.attempts[i - 1].scores[p]) ? rec.attempts[i - 1].scores[p] : null));
  let finalIdx = -1;
  att.forEach((a, i) => { if (a.complete) finalIdx = i; });
  const first = att[0];
  const final = finalIdx >= 0 ? att[finalIdx] : null;
  return {
    attempts: att,
    attempt2Done: att[1].complete,
    attempt3Done: att[2].complete,
    improvements: {
      a2vs1: diff(att[1].total, att[0].total),
      a3vs2: diff(att[2].total, att[1].total),
      a3vs1: diff(att[2].total, att[0].total),
    },
    bandImprovements: {
      a2vs1: diff(att[1].band, att[0].band),
      a3vs2: diff(att[2].band, att[1].band),
      a3vs1: diff(att[2].band, att[0].band),
    },
    partDeltas: { 2: partDelta(2), 3: partDelta(3) },
    finalAttempt: finalIdx >= 0 ? finalIdx + 1 : null,
    firstBand: first.band,
    finalBand: final ? final.band : null,
    totalImprovementFirstToFinal: final && finalIdx > 0 ? final.total - first.total : null,
  };
}

/** Validation used when the user presses Save. Drafts may be incomplete, but never invalid. */
export function validatePractice(rec) {
  const errors = [];
  if (!isISODate(rec.date)) errors.push('Choose a valid date.');
  for (const i of [1, 2, 3]) {
    (rec.attempts[i]?.scores || []).forEach((v, p) => {
      const e = scoreError(rec.type, p, v);
      if (e) errors.push(`Attempt ${i}, ${SKILLS[rec.type].partWord} ${p + 1}: ${e}`);
    });
  }
  return errors;
}
export const canMarkComplete = rec => {
  const s = recordSummary(rec);
  return s.attempts[0].complete && s.attempt2Done
    ? { ok: true }
    : { ok: false, message: !s.attempts[0].complete
        ? 'Enter all Attempt 1 scores first. Attempt 2 is also required before the record can be completed.'
        : 'Attempt 2 is still required. Review your mistakes, try again, and enter the complete Attempt 2 scores. Your Attempt 1 is safe; you can save and come back later.' };
};

export function validateWriting(rec) {
  const errors = [];
  if (!isISODate(rec.date)) errors.push('Choose a valid date.');
  for (const [k, v] of Object.entries(rec.criteria || {})) if (v != null && !isValidBand(v)) errors.push(`Invalid band for ${k}.`);
  if (rec.teacherOverall != null && !isValidBand(rec.teacherOverall)) errors.push('Invalid teacher overall band.');
  return errors;
}
export function validateSpeaking(rec) {
  const errors = [];
  if (!isISODate(rec.date)) errors.push('Choose a valid date.');
  for (const [k, v] of Object.entries(rec.criteria || {})) if (v != null && !isValidBand(v)) errors.push(`Invalid band for ${k}.`);
  if (rec.overall != null && !isValidBand(rec.overall)) errors.push('Invalid overall band.');
  return errors;
}

export function assessmentStatus(rec, kind) {
  const keys = kind === 'speaking' ? ['fc', 'lr', 'gra', 'pr'] : ['ta', 'cc', 'lr', 'gra'];
  const n = keys.filter(k => isValidBand(rec.criteria?.[k])).length;
  const overall = kind === 'speaking' ? rec.overall : rec.teacherOverall;
  if (n === 4 && isValidBand(overall)) return { key: 'assessed', label: 'Assessed' };
  if (n === 0 && !isValidBand(overall)) return { key: 'none', label: 'Not assessed' };
  return { key: 'partial', label: `Partly assessed (${n}/4 criteria${isValidBand(overall) ? ' + overall' : ''})` };
}
export { calcWritingTaskBand, calcSpeakingBand };

export const WRITING_CRITERIA = task => [
  { key: 'ta', label: task === 2 ? 'Task Response' : 'Task Achievement' },
  { key: 'cc', label: 'Coherence and Cohesion' },
  { key: 'lr', label: 'Lexical Resource' },
  { key: 'gra', label: 'Grammatical Range and Accuracy' },
];
export const SPEAKING_CRITERIA = [
  { key: 'fc', label: 'Fluency and Coherence' },
  { key: 'lr', label: 'Lexical Resource' },
  { key: 'gra', label: 'Grammatical Range and Accuracy' },
  { key: 'pr', label: 'Pronunciation' },
];
