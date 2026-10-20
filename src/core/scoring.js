// ──────────────────────────────────────────────────────────────────────────────
// WRITING / SPEAKING SCORING — the one file to edit when the organisation supplies its own formula.
// Everything in the app (record screens, statistics, exports) calls these functions only.
// ──────────────────────────────────────────────────────────────────────────────
import { isValidBand, roundToHalfBand } from './bands.js';

export const WRITING_SCORING = {
  id: 'provisional-mean-v1',
  provisional: true,
  label: 'Provisional: mean of the four criteria, rounded to the nearest half band',
  explanation:
    'The final Writing formula has not been supplied yet. Until it is, the app shows the mean of the four ' +
    'criterion scores (rounded to the nearest half band) as a provisional figure. A band entered by the teacher ' +
    'is stored separately and is never overwritten.',
  // Combination of Task 1 and Task 2 for the overall Writing statistics.
  // IELTS publishes that Task 2 contributes twice as much as Task 1; weights are configurable here.
  combine: {
    task1Weight: 1,
    task2Weight: 2,
    label: 'Latest Task 1 and latest Task 2 band, weighted 1 : 2 (Task 2 counts double)',
  },
};

const CRIT_W = ['ta', 'cc', 'lr', 'gra'];
const CRIT_S = ['fc', 'lr', 'gra', 'pr'];

/** Provisional per-essay band from criterion scores. Replace the body when the real formula arrives. */
export function calcWritingTaskBand(criteria) {
  const v = CRIT_W.map(k => criteria?.[k]);
  return v.every(isValidBand) ? roundToHalfBand(v) : null;
}

/** Combine the latest Task 1 and Task 2 bands into one overall Writing band (weights above). */
export function combineWriting(t1, t2, cfg = WRITING_SCORING.combine) {
  if (!isValidBand(t1) || !isValidBand(t2)) return null;
  return roundToHalfBand([t1, t2], [cfg.task1Weight, cfg.task2Weight]);
}

/** Provisional Speaking band from criteria (IELTS describes the Speaking band as the average of the four criteria). */
export function calcSpeakingBand(criteria) {
  const v = CRIT_S.map(k => criteria?.[k]);
  return v.every(isValidBand) ? roundToHalfBand(v) : null;
}

/** The score used in statistics for a Writing record: teacher band first, else provisional. */
export function writingScore(rec) {
  if (isValidBand(rec.teacherOverall)) return { value: rec.teacherOverall, provisional: false };
  const p = calcWritingTaskBand(rec.criteria);
  return p == null ? null : { value: p, provisional: true };
}
export function speakingScore(rec) {
  if (isValidBand(rec.overall)) return { value: rec.overall, provisional: false };
  const p = calcSpeakingBand(rec.criteria);
  return p == null ? null : { value: p, provisional: true };
}
