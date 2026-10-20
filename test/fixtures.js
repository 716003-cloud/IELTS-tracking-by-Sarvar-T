import { newPractice, newWriting, newSpeaking } from '../src/core/model.js';
import { seedCategories } from '../src/core/categories.js';

export function sampleData() {
  const mk = (kind, date, a1, a2, a3, src) => { const r = newPractice(kind); r.date = date; r.source = src; r.status = 'saved'; r.attempts[1].scores = a1; if (a2) r.attempts[2].scores = a2; if (a3) r.attempts[3].scores = a3; r.createdAt = date + 'T10:00:00.000Z'; return r; };
  const L1 = mk('listening', '2026-08-01', [5, 6, 7, 8], [7, 7, 8, 9], [9, 8, 9, 9], 'Cambridge IELTS 18 — Test 2');
  L1.partTitles = ['Hotel booking', '', 'Seminar', '']; L1.completed = true;
  L1.mistakes[0] = { categories: ['l_spelling', 'l_accents'], custom: 'Names!', review: { l_spelling: 'improved', l_accents: 'not_improved' } };
  const L2 = mk('listening', '2026-09-10', [8, 8, 8, 8], [7, 8, 8, 8], null, 'Mock <b>test</b> & more');
  const R1 = mk('reading', '2026-08-15', [8, 7, 6], [10, 9, 8], null, 'Passage pack');
  const W1 = newWriting(1); W1.date = '2026-08-20'; W1.title = 'Bar chart'; W1.essay = 'Para one.\n\nPara two <script>alert(1)</script> & “quotes”. Ўзбекча матн'; W1.feedback = 'Good.\nWork on cohesion.'; W1.criteria = { ta: 6, cc: 6, lr: 6.5, gra: 6 }; W1.status = 'saved';
  const W2 = newWriting(2); W2.date = '2026-09-02'; W2.title = 'Technology essay'; W2.essay = 'Essay two'; W2.criteria = { ta: 6.5, cc: 6.5, lr: 6.5, gra: 6.5 }; W2.teacherOverall = 6.5; W2.status = 'saved';
  const S1 = newSpeaking(); S1.date = '2026-09-05'; S1.title = 'Cue card: a book'; S1.parts = [2]; S1.criteria = { fc: 6, lr: 6.5, gra: 6, pr: 6.5 }; S1.overall = 6.5; S1.feedback = 'Fluent'; S1.status = 'saved';
  const media = [
    { id: 'm1', sessionId: S1.id, part: 2, kind: 'audio', mime: 'audio/webm', size: 2048, duration: 75, name: '2026-09-05_cue-card-a-book-abc123_part2_audio01.webm', path: 'media/speaking_audio/2026-09-05_cue-card-a-book-abc123_part2_audio01.webm' },
    { id: 'm2', sessionId: S1.id, part: 2, kind: 'image', mime: 'image/png', size: 70, name: '2026-09-05_cue-card-a-book-abc123_part2_image01.png', path: 'media/question_images/2026-09-05_cue-card-a-book-abc123_part2_image01.png' },
  ];
  return { listening: [L1, L2], reading: [R1], writing1: [W1], writing2: [W2], speaking: [S1], media,
    settings: { targets: { overall: 7, listening: 7.5, reading: 7, writing: 7, speaking: 7 }, categories: seedCategories(), profile: { name: 'Aziza' }, theme: 'system' } };
}
export const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
