// Statistics. Only valid recorded scores are used; missing scores are never treated as zero.
import { recordSummary } from './model.js';
import { writingScore, speakingScore, combineWriting, WRITING_SCORING } from './scoring.js';
import { overallBand, isValidBand } from './bands.js';
import { avg } from './util.js';

export const RANGES = [
  { id: '30', label: '1 month', days: 30 },
  { id: '90', label: '3 months', days: 90 },
  { id: 'all', label: 'All', days: null },
];
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || '') < (b.createdAt || '') ? -1 : 1);

export function inRange(points, rangeId, today = new Date()) {
  const r = RANGES.find(x => x.id === rangeId);
  if (!r || !r.days) return points;
  const cut = new Date(today.getTime() - r.days * 86400000).toISOString().slice(0, 10);
  return points.filter(p => p.date >= cut);
}

/** Listening / Reading: one point per record that has a complete first attempt. */
export function practicePoints(recs) {
  return [...recs].sort(byDate).flatMap(rec => {
    const s = recordSummary(rec);
    if (s.finalBand == null) return [];
    return [{ date: rec.date, id: rec.id, value: s.finalBand, first: s.firstBand, attempt: s.finalAttempt }];
  });
}
export function writingPoints(recs) {
  return [...recs].sort(byDate).flatMap(rec => {
    const sc = writingScore(rec);
    return sc ? [{ date: rec.date, id: rec.id, value: sc.value, provisional: sc.provisional,
      criteria: rec.criteria }] : [];
  });
}
export function speakingPoints(recs) {
  return [...recs].sort(byDate).flatMap(rec => {
    const sc = speakingScore(rec);
    return sc ? [{ date: rec.date, id: rec.id, value: sc.value, provisional: sc.provisional, criteria: rec.criteria }] : [];
  });
}

/**
 * Overall Writing series (documented in WRITING_SCORING.combine): walking forward in time, once both a Task 1
 * and a Task 2 score exist, each new essay produces a point = weighted combination of the latest Task 1 and latest
 * Task 2 band. Until both tasks exist no combined point is invented.
 */
export function writingOverallPoints(p1, p2) {
  const all = [...p1.map(p => ({ ...p, t: 1 })), ...p2.map(p => ({ ...p, t: 2 }))].sort(byDate);
  let l1 = null, l2 = null;
  const out = [];
  for (const p of all) {
    if (p.t === 1) l1 = p; else l2 = p;
    if (l1 && l2) out.push({ date: p.date, value: combineWriting(l1.value, l2.value), provisional: l1.provisional || l2.provisional });
  }
  return out;
}

export function trend(points) {
  const v = points.map(p => p.value);
  if (v.length < 2) return { key: 'insufficient', label: 'Not enough data', delta: null };
  const lastN = Math.min(3, Math.ceil(v.length / 2));
  const recent = avg(v.slice(-lastN));
  const prev = avg(v.slice(0, v.length - lastN));
  const delta = recent - prev;
  if (delta >= 0.25) return { key: 'improving', label: 'Improving', delta };
  if (delta <= -0.25) return { key: 'declining', label: 'Declining', delta };
  return { key: 'stable', label: 'Stable', delta };
}

export function targetStatus(latest, target) {
  if (!isValidBand(target)) return { key: 'no-target', label: 'No target set', gap: null };
  if (!isValidBand(latest)) return { key: 'no-data', label: 'More assessed practice is needed to compare with your target.', gap: null };
  const gap = target - latest;
  if (gap <= 0) return { key: 'reached', label: gap === 0 ? 'Target reached' : `Target reached (+${(-gap).toFixed(1)} above)`, gap };
  return { key: 'below', label: `${gap.toFixed(1)} band${gap === 1 ? '' : 's'} below target`, gap };
}

export function summarise(points, target) {
  const latest = points.length ? points[points.length - 1] : null;
  const best = points.length ? Math.max(...points.map(p => p.value)) : null;
  return { count: points.length, latest: latest ? latest.value : null, latestDate: latest?.date ?? null, best,
    trend: trend(points), target: targetStatus(latest?.value ?? null, target), provisional: !!latest?.provisional };
}

/** Listening / Reading aggregates for the skill statistics screen. */
export function practiceAggregates(recs) {
  const sums = recs.map(recordSummary);
  const withA2 = sums.filter(s => s.attempt2Done).length;
  const withA3 = sums.filter(s => s.attempt3Done).length;
  const imp12 = sums.map(s => s.improvements.a2vs1).filter(v => v != null);
  const impFinal = sums.map(s => s.totalImprovementFirstToFinal).filter(v => v != null);
  const firstTotals = sums.map(s => s.attempts[0].total).filter(v => v != null);
  return {
    records: recs.length,
    completed: recs.filter(r => r.completed).length,
    attempt2Done: withA2, attempt3Done: withA3,
    pendingAttempt2: recs.filter((r, i) => sums[i].attempts[0].complete && !sums[i].attempt2Done).length,
    avgFirstTotal: avg(firstTotals),
    avgImprovement12: avg(imp12),
    avgImprovementFinal: avg(impFinal),
    bestTotal: Math.max(-Infinity, ...sums.flatMap(s => s.attempts.map(a => a.total).filter(v => v != null))),
  };
}

/** Average part score per part for attempt 1 (weakest part detection). */
export function partAverages(recs, parts) {
  return Array.from({ length: parts }, (_, p) =>
    avg(recs.map(r => r.attempts[1].scores[p]).filter(Number.isInteger)));
}

/** Mistake categories ranked by frequency, with review outcomes. */
export function mistakeFrequency(recs) {
  const m = new Map();
  for (const r of recs) for (const part of r.mistakes || []) for (const id of part.categories || []) {
    const e = m.get(id) || { id, count: 0, improved: 0, notImproved: 0, notAssessed: 0 };
    e.count++;
    const st = part.review?.[id] || 'not_assessed';
    if (st === 'improved') e.improved++; else if (st === 'not_improved') e.notImproved++; else e.notAssessed++;
    m.set(id, e);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

/** Everything the General Statistics dashboard needs. */
export function dashboard({ listening = [], reading = [], writing1 = [], writing2 = [], speaking = [] }, targets = {}, rangeId = 'all') {
  const L = practicePoints(listening), R = practicePoints(reading);
  const W1 = writingPoints(writing1), W2 = writingPoints(writing2), S = speakingPoints(speaking);
  const WO = writingOverallPoints(W1, W2);
  // Overall Writing: combined if both tasks exist, else the single task that has data (clearly labelled).
  const writingBasis = WO.length ? 'combined' : W2.length && !W1.length ? 'task2' : W1.length && !W2.length ? 'task1' : 'none';
  const W = WO.length ? WO : (writingBasis === 'task2' ? W2 : writingBasis === 'task1' ? W1 : []);
  const skills = {
    listening: { points: inRange(L, rangeId), all: L },
    reading: { points: inRange(R, rangeId), all: R },
    writing: { points: inRange(W, rangeId), all: W, basis: writingBasis, method: WRITING_SCORING.combine.label },
    speaking: { points: inRange(S, rangeId), all: S },
  };
  for (const k of Object.keys(skills)) skills[k].summary = summarise(skills[k].all, targets[k]);
  // Latest valid bands (not range-limited: a score recorded long ago is still the latest score)
  const latest = Object.fromEntries(Object.keys(skills).map(k => [k, skills[k].summary.latest]));
  const overall = overallBand(latest);
  const attempts = { listening: practiceAggregates(listening), reading: practiceAggregates(reading) };
  const counts = { listening: listening.length, reading: reading.length, writing1: writing1.length, writing2: writing2.length, speaking: speaking.length };
  return { skills, overall, overallTarget: targetStatus(overall.value, targets.overall), attempts, counts, writingBasis };
}
