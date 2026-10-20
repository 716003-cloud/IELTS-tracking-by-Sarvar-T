// Excel (.xlsx) export built with ExcelJS. Reads data only – never modifies records.
import ExcelJS from 'exceljs';
import { SKILLS, recordSummary, assessmentStatus, WRITING_CRITERIA, SPEAKING_CRITERIA } from './model.js';
import { calcWritingTaskBand, calcSpeakingBand, WRITING_SCORING, writingScore, speakingScore } from './scoring.js';
import { dashboard } from './stats.js';
import { fmtBand } from './bands.js';
import { REVIEW_STATES } from './categories.js';
import { APP_VERSION } from './backup.js';

const NAVY = 'FF00345C', WHITE = 'FFFFFFFF', LIGHT = 'FFEAF1F8';
const ATT = { 1: { argb: 'FFD9F2E1', name: 'Attempt 1' }, 2: { argb: 'FFFADADA', name: 'Attempt 2' }, 3: { argb: 'FFFDE8CC', name: 'Attempt 3' } };
const toDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const num = v => (v == null ? null : v);
const MAXCELL = 32000;
const cap = s => (s && s.length > MAXCELL ? s.slice(0, MAXCELL) + '\n[truncated: full text is in the backup]' : s || '');
const words = s => (s.trim() ? s.trim().split(/\s+/).length : 0);

function styleHeader(row) {
  row.eachCell(c => {
    c.font = { bold: true, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: 'FF999999' } } };
  });
  row.height = 32;
}
function title(ws, text, sub, cols = 8) {
  ws.mergeCells(1, 1, 1, cols); ws.getCell(1, 1).value = text;
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: NAVY } };
  if (sub) { ws.mergeCells(2, 1, 2, cols); ws.getCell(2, 1).value = sub; ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF555555' } }; }
}
function table(ws, headerRow, headers, rows, widths) {
  headers.forEach((h, i) => { ws.getCell(headerRow, i + 1).value = h; if (widths?.[i]) ws.getColumn(i + 1).width = widths[i]; });
  styleHeader(ws.getRow(headerRow));
  rows.forEach(r => ws.addRow(r));
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: headers.length } };
  ws.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 1 }];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) ws.getRow(r).eachCell({ includeEmpty: true }, c => { c.alignment = { vertical: 'top', wrapText: true, ...(c.alignment || {}) }; });
}
const rowHeightFor = (texts, widths) => Math.min(380, Math.max(18, ...texts.map((t, i) => Math.ceil((t || '').length / Math.max(8, (widths[i] || 20) * 1.1)) * 15 + 4)));

/**
 * data: { listening, reading, writing1, writing2, speaking, media, settings }
 * opts.imageProvider(meta) -> Promise<{buffer, extension:'jpeg'|'png', width, height} | null>
 */
export async function buildWorkbook(data, opts = {}) {
  const { listening = [], reading = [], writing1 = [], writing2 = [], speaking = [], media = [], settings = {} } = data;
  const targets = settings.targets || {};
  const cats = settings.categories || {};
  const catLabel = (skill, id) => (cats[skill] || []).find(c => c.id === id)?.label || id;
  const now = opts.now || new Date();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IELTS Tracker'; wb.created = now;
  const stamp = `Exported ${now.toISOString().slice(0, 10)}${settings.profile?.name ? ' · ' + settings.profile.name : ''}`;
  const dateCell = { numFmt: 'dd mmm yyyy' };
  const sessionById = new Map(speaking.map(s => [s.id, s]));

  // ── General Statistics ───────────────────────────────────────────────
  const dash = dashboard({ listening, reading, writing1, writing2, speaking }, targets, 'all');
  let ws = wb.addWorksheet('General Statistics');
  title(ws, 'IELTS progress – General Statistics', stamp, 9);
  ws.getCell('A4').value = 'Overall band'; ws.getCell('A4').font = { bold: true };
  ws.getCell('B4').value = dash.overall.value == null ? 'Not enough data' : dash.overall.value;
  ws.getCell('C4').value = dash.overall.value == null ? '' : dash.overall.complete ? 'From all four skills (IELTS rounding)' : `Incomplete estimate from ${dash.overall.count} of 4 skills`;
  ws.getCell('A5').value = 'Target overall'; ws.getCell('A5').font = { bold: true };
  ws.getCell('B5').value = num(targets.overall) ?? 'Not set';
  const skillRows = ['listening', 'reading', 'writing', 'speaking'].map(k => {
    const s = dash.skills[k].summary;
    return [k[0].toUpperCase() + k.slice(1), s.count, num(s.latest), num(s.best), num(targets[k]), s.target.gap == null ? null : Math.max(0, s.target.gap), s.trend.label, s.target.label];
  });
  ws.getRow(7).values = ['Skill', 'Scored records', 'Latest band', 'Best band', 'Target', 'Shortfall to target', 'Trend', 'Status'];
  styleHeader(ws.getRow(7)); skillRows.forEach(r => ws.addRow(r));
  ws.addRow([]);
  const cr = ws.addRow(['Records', '', '', '', '', '', '', '']); cr.font = { bold: true };
  [['Listening records', listening.length], ['Reading records', reading.length], ['Writing Task 1 records', writing1.length], ['Writing Task 2 records', writing2.length], ['Speaking sessions', speaking.length],
    ['Speaking recordings', media.filter(m => m.kind === 'audio').length]].forEach(r => ws.addRow(r));
  ws.addRow([]);
  const ar = ws.addRow(['Listening / Reading attempts', 'Records', 'Attempt 2 done', 'Attempt 3 done', 'Awaiting Attempt 2', 'Avg first-attempt total', 'Avg gain A1→A2', 'Avg gain A1→final']); styleHeader(ar);
  for (const k of ['listening', 'reading']) {
    const a = dash.attempts[k];
    ws.addRow([SKILLS[k].label, a.records, a.attempt2Done, a.attempt3Done, a.pendingAttempt2, a.avgFirstTotal == null ? null : +a.avgFirstTotal.toFixed(1), a.avgImprovement12 == null ? null : +a.avgImprovement12.toFixed(1), a.avgImprovementFinal == null ? null : +a.avgImprovementFinal.toFixed(1)]);
  }
  ws.addRow([]);
  const hist = ws.addRow(['Score history (use Insert › Chart in Excel to plot it)', '', '']); hist.font = { bold: true };
  const hh = ws.addRow(['Skill', 'Date', 'Band', 'Provisional?']); styleHeader(hh);
  for (const k of ['listening', 'reading', 'writing', 'speaking']) dash.skills[k].all.forEach(p => { const r = ws.addRow([k[0].toUpperCase() + k.slice(1), toDate(p.date), p.value, p.provisional ? 'Yes' : '']); r.getCell(2).numFmt = 'dd mmm yyyy'; });
  ws.addRow([]);
  ws.addRow([`Writing overall basis: ${dash.writingBasis === 'combined' ? WRITING_SCORING.combine.label : dash.writingBasis === 'none' ? 'no scored essays yet' : 'only ' + dash.writingBasis + ' has scores so far'}.`]);
  ws.addRow(['Charts are not generated in the Excel file in this version; the dashboard in the app and the HTML report contain the charts.']);
  [22, 14, 14, 14, 14, 18, 16, 36].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ── Listening / Reading ──────────────────────────────────────────────
  for (const kind of ['listening', 'reading']) {
    const cfg = SKILLS[kind], recs = kind === 'listening' ? listening : reading;
    ws = wb.addWorksheet(cfg.label);
    title(ws, `${cfg.label} records`, `${stamp} · scores are cumulative correct answers per attempt · bands are indicative`, 10);
    const partH = Array.from({ length: cfg.parts }, (_, i) => `${cfg.partWord[0]}${i + 1} /${cfg.max[i]}`);
    const headers = ['Date', 'Source / test name', 'Description', `${cfg.partWord} titles`];
    const groups = [{ from: 1, to: 4, label: '', argb: LIGHT }];
    [1, 2, 3].forEach(a => {
      const from = headers.length + 1;
      headers.push(...partH.map(h => `${h}`), 'Total /40', 'Incorrect', 'Band');
      if (a === 2) headers.push('Change vs A1');
      if (a === 3) headers.push('Change vs A2', 'Change vs A1');
      groups.push({ from, to: headers.length, label: ATT[a].name + (a === 2 ? ' (required)' : a === 3 ? ' (optional)' : ''), argb: ATT[a].argb });
    });
    const tail = headers.length + 1;
    headers.push('Final band', 'Attempt 2 done', 'Marked complete', 'Status', 'Record ID');
    groups.push({ from: tail, to: headers.length, label: 'Summary', argb: LIGHT });
    ws.getRow(4).height = 20;
    groups.forEach(g => { if (g.to >= g.from) { ws.mergeCells(4, g.from, 4, g.to); const c = ws.getCell(4, g.from); c.value = g.label; c.font = { bold: true }; c.alignment = { horizontal: 'center' }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: g.argb } }; } });
    const rows = [...recs].sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? -1 : 1)).map(rec => {
      const s = recordSummary(rec);
      const row = [toDate(rec.date), rec.source, rec.description, rec.partTitles.map((t, i) => (t ? `${cfg.partWord[0]}${i + 1}: ${t}` : '')).filter(Boolean).join('\n')];
      [1, 2, 3].forEach(a => {
        const at = s.attempts[a - 1];
        row.push(...rec.attempts[a].scores.map(num), num(at.total), num(at.incorrect), num(at.band));
        if (a === 2) row.push(num(s.improvements.a2vs1));
        if (a === 3) row.push(num(s.improvements.a3vs2), num(s.improvements.a3vs1));
      });
      row.push(num(s.finalBand), s.attempt2Done ? 'Yes' : 'No', rec.completed ? 'Yes' : 'No', rec.status === 'saved' ? 'Saved' : 'Draft', rec.id);
      return row;
    });
    table(ws, 5, headers, rows, [13, 28, 28, 28, ...Array(headers.length - 4).fill(8)]);
    ws.getColumn(headers.length).width = 38;
    ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 2 }];
    for (let r = 6; r <= ws.rowCount; r++) { ws.getCell(r, 1).numFmt = 'dd mmm yyyy'; }
  }

  // ── Mistakes & review ────────────────────────────────────────────────
  ws = wb.addWorksheet('Mistakes & Review');
  title(ws, 'Difficulty categories and review status', stamp, 8);
  const mrows = [];
  for (const kind of ['listening', 'reading']) {
    const cfg = SKILLS[kind];
    for (const rec of [...(kind === 'listening' ? listening : reading)].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      rec.mistakes.forEach((m, p) => {
        const base = [cfg.label, toDate(rec.date), rec.source, `${cfg.partWord} ${p + 1}`, rec.partTitles[p] || ''];
        m.categories.forEach(id => mrows.push([...base, catLabel(kind, id), REVIEW_STATES.find(r => r.id === (m.review?.[id] || 'not_assessed')).label, m.custom || '', rec.id]));
        if (!m.categories.length && m.custom) mrows.push([...base, '(custom note only)', '', m.custom, rec.id]);
      });
    }
  }
  table(ws, 4, ['Skill', 'Date', 'Source', 'Part / passage', 'Title', 'Category', 'Review status', 'Custom note', 'Record ID'], mrows, [12, 13, 28, 14, 22, 44, 16, 32, 38]);
  for (let r = 5; r <= ws.rowCount; r++) ws.getCell(r, 2).numFmt = 'dd mmm yyyy';

  // ── Writing ──────────────────────────────────────────────────────────
  for (const [task, recs] of [[1, writing1], [2, writing2]]) {
    ws = wb.addWorksheet(`Writing Task ${task}`);
    title(ws, `Writing Task ${task}`, `${stamp} · ${WRITING_SCORING.label}`, 10);
    const crit = WRITING_CRITERIA(task);
    const widths = [13, 22, 34, 60, 46, 12, 12, 12, 12, 13, 13, 10, 10, 38];
    const rows = [...recs].sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? -1 : 1)).map(r => [
      toDate(r.date), r.title, cap(r.prompt), cap(r.essay), cap(r.feedback), ...['ta', 'cc', 'lr', 'gra'].map(k => num(r.criteria[k])),
      num(calcWritingTaskBand(r.criteria)), num(r.teacherOverall), words(r.essay), r.status === 'saved' ? 'Saved' : 'Draft', r.id]);
    table(ws, 4, ['Date', 'Source / task title', 'Question / prompt', 'Essay', 'Teacher feedback', ...crit.map(c => c.label), 'Provisional band (calculated)', 'Teacher-assessed overall', 'Words', 'Status', 'Record ID'],
      rows, [13, 22, 34, 60, 46, 12, 12, 12, 12, 14, 14, 8, 9, 38]);
    for (let r = 5; r <= ws.rowCount; r++) {
      ws.getCell(r, 1).numFmt = 'dd mmm yyyy';
      const rec = [...recs].sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? -1 : 1))[r - 5];
      ws.getRow(r).height = rowHeightFor([rec.prompt, rec.essay, rec.feedback], [34, 60, 46]);
    }
  }

  // ── Speaking ─────────────────────────────────────────────────────────
  ws = wb.addWorksheet('Speaking Sessions');
  title(ws, 'Speaking sessions', `${stamp} · audio is referenced by file name (not embedded in Excel); audio files are in the complete backup`, 10);
  const files = (s, kind) => media.filter(m => m.sessionId === s.id && m.kind === kind).map(m => `${m.part ? 'P' + m.part + ': ' : ''}${m.name}`).join('\n');
  const srows = [...speaking].sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? -1 : 1)).map(s => [
    toDate(s.date), s.title, s.topic, s.parts.map(p => 'Part ' + p).join(', '), ...['fc', 'lr', 'gra', 'pr'].map(k => num(s.criteria[k])), num(s.overall), num(calcSpeakingBand(s.criteria)),
    assessmentStatus(s, 'speaking').label, cap(s.feedback), cap(s.notes), files(s, 'audio'), files(s, 'image'), files(s, 'file'), s.id]);
  table(ws, 4, ['Date', 'Title', 'Topic / description', 'Parts practised', ...SPEAKING_CRITERIA.map(c => c.label), 'Teacher overall', 'Provisional mean', 'Assessment', 'Teacher feedback', 'Student notes', 'Audio files', 'Question images', 'Other files', 'Record ID'],
    srows, [13, 22, 28, 16, 13, 13, 13, 13, 11, 11, 24, 46, 30, 40, 36, 28, 38]);
  for (let r = 5; r <= ws.rowCount; r++) ws.getCell(r, 1).numFmt = 'dd mmm yyyy';

  // ── Speaking images (embedded where possible) ────────────────────────
  ws = wb.addWorksheet('Speaking Images');
  title(ws, 'Question images', opts.imageProvider ? 'Images are downsized copies for the workbook; originals are in the complete backup.' : 'Images are not embedded in this export; see the Attachments sheet for file names.', 6);
  ws.getColumn(1).width = 60; ws.getColumn(2).width = 50;
  let row = 4;
  const images = media.filter(m => m.kind === 'image');
  for (const m of images) {
    const s = sessionById.get(m.sessionId);
    ws.getCell(row, 2).value = `${s ? s.date + ' – ' + (s.title || 'Untitled session') : 'Unknown session'}\n${m.part ? 'Speaking Part ' + m.part : 'General'}\n${m.name}`;
    ws.getCell(row, 2).alignment = { wrapText: true, vertical: 'top' };
    let img = null;
    if (opts.imageProvider) { try { img = await opts.imageProvider(m); } catch { img = null; } }
    if (img) {
      const id = wb.addImage({ buffer: img.buffer, extension: img.extension });
      const w = Math.min(420, img.width), h = Math.round((img.height * w) / img.width);
      ws.addImage(id, { tl: { col: 0, row: row - 1 }, ext: { width: w, height: h } });
      const rows = Math.max(4, Math.ceil(h / 20) + 1);
      for (let i = 0; i < rows; i++) ws.getRow(row + i).height = 20;
      row += rows + 1;
    } else { ws.getCell(row, 1).value = '(image not embedded)'; row += 2; }
  }
  if (!images.length) ws.getCell(4, 1).value = 'No question images saved.';

  // ── Attachments index ────────────────────────────────────────────────
  ws = wb.addWorksheet('Attachments');
  title(ws, 'Attachment index', 'Paths are relative to the root of the complete backup ZIP.', 8);
  table(ws, 4, ['File name', 'Type', 'Session date', 'Session title', 'Part', 'Duration (s)', 'Size (bytes)', 'Path in backup ZIP', 'In this workbook'],
    media.map(m => { const s = sessionById.get(m.sessionId); return [m.name, m.kind === 'audio' ? 'Audio' : m.kind === 'image' ? 'Image' : 'Other file', s ? toDate(s.date) : null, s?.title || '', m.part ? 'Part ' + m.part : '', num(m.duration), m.size, m.path,
      m.kind === 'image' && opts.imageProvider ? 'Image (downsized)' : 'Reference only']; }),
    [38, 10, 13, 28, 8, 12, 14, 56, 18]);
  for (let r = 5; r <= ws.rowCount; r++) ws.getCell(r, 3).numFmt = 'dd mmm yyyy';

  // ── Goals and settings ───────────────────────────────────────────────
  ws = wb.addWorksheet('Goals and Settings');
  title(ws, 'Goals and settings', stamp, 3);
  const kv = [['Target overall band', num(targets.overall) ?? 'Not set'], ['Target Listening', num(targets.listening) ?? 'Not set'], ['Target Reading', num(targets.reading) ?? 'Not set'], ['Target Writing', num(targets.writing) ?? 'Not set'], ['Target Speaking', num(targets.speaking) ?? 'Not set'],
    ['Theme', settings.theme || 'system'], ['Writing score method', WRITING_SCORING.label], ['Writing overall combination', WRITING_SCORING.combine.label],
    ['Listening / Reading conversion', 'Indicative lookup tables stored in the app (see docs/CONVERSION_TABLES.md); exact marks vary slightly between test versions.'], ['App version', APP_VERSION]];
  kv.forEach((r, i) => { ws.getRow(4 + i).values = r; ws.getCell(4 + i, 1).font = { bold: true }; ws.getCell(4 + i, 2).alignment = { wrapText: true, vertical: 'top' }; });
  ws.getColumn(1).width = 34; ws.getColumn(2).width = 90;
  let r0 = 4 + kv.length + 1;
  ws.getCell(r0, 1).value = 'Mistake categories'; ws.getCell(r0, 1).font = { bold: true };
  for (const k of ['listening', 'reading']) (cats[k] || []).forEach(c => { r0++; ws.getRow(r0).values = [`${SKILLS[k].label}${c.archived ? ' (archived)' : ''}`, c.label]; });
  return wb;
}

export async function workbookToBlob(wb) {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
export const xlsxFileName = (d = new Date()) => `ielts_export_${d.toISOString().slice(0, 10)}.xlsx`;
