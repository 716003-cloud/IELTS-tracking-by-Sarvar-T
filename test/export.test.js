import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbook, workbookToBlob } from '../src/core/export-xlsx.js';
import { buildHtmlReport } from '../src/core/export-html.js';
import { sampleData, PNG_1PX } from './fixtures.js';

describe('Excel export', () => {
  it('produces a real .xlsx with the required sheets and correct values', async () => {
    const data = sampleData();
    const wb = await buildWorkbook(data, { now: new Date('2026-10-17T10:00:00Z') });
    const blob = await workbookToBlob(wb);
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(buf[0], buf[1])).toBe('PK'); // OOXML zip container, not a renamed CSV
    const rd = new ExcelJS.Workbook(); await rd.xlsx.load(buf.buffer);
    expect(rd.worksheets.map(w => w.name)).toEqual(expect.arrayContaining(['General Statistics', 'Listening', 'Reading', 'Writing Task 1', 'Writing Task 2', 'Speaking Sessions', 'Goals and Settings', 'Mistakes & Review', 'Attachments']));

    const L = rd.getWorksheet('Listening');
    const headers = L.getRow(5).values.slice(1);
    const rows = []; L.eachRow((r, n) => { if (n > 5) rows.push(r.values.slice(1)); });
    expect(headers).toEqual(expect.arrayContaining(['Source / test name', 'Total /40', 'Band', 'Change vs A1', 'Change vs A2']));
    const first = rows.find(r => r[1] === 'Cambridge IELTS 18 — Test 2');
    const col = h => headers.indexOf(h);
    // attempt 1: 5,6,7,8 = 26 ; attempt 2: 7,7,8,9 = 31 (+5); attempt 3: 9,8,9,9 = 35 (+4, +9)
    const totals = headers.map((h, i) => (h === 'Total /40' ? first[i] : null)).filter(v => v != null);
    expect(totals).toEqual([26, 31, 35]);
    expect(first[col('Change vs A1')]).toBe(5);
    const lower = rows.find(r => String(r[1]).startsWith('Mock'));
    expect(lower[col('Change vs A1')]).toBe(-1);

    const w1 = rd.getWorksheet('Writing Task 1'); const wr = w1.getRow(5).values.slice(1);
    expect(wr[3]).toBe(data.writing1[0].essay);   // essay text byte-for-byte incl. line breaks and Cyrillic
    expect(wr[4]).toBe('Good.\nWork on cohesion.');
    expect(w1.getRow(4).values.slice(1)).toEqual(expect.arrayContaining(['Task Achievement', 'Provisional band (calculated)', 'Teacher-assessed overall']));
    expect(rd.getWorksheet('Writing Task 2').getRow(4).values.slice(1)).toContain('Task Response');

    const att = rd.getWorksheet('Attachments'); const arows = []; att.eachRow((r, n) => { if (n > 4) arows.push(r.values.slice(1)); });
    expect(arows).toHaveLength(2);
    expect(arows.find(r => r[0].endsWith('.webm'))[8]).toBe('Reference only'); // audio is never claimed to be embedded
    const mist = rd.getWorksheet('Mistakes & Review'); let m = 0; mist.eachRow((r, n) => { if (n > 4) m++; });
    expect(m).toBe(2);
  });
  it('embeds images only when an image provider is given, and does not alter records', async () => {
    const data = sampleData(); const before = JSON.stringify(data);
    const png = Buffer.from(PNG_1PX.split(',')[1], 'base64');
    const wb = await buildWorkbook(data, { imageProvider: async () => ({ buffer: png, extension: 'png', width: 1, height: 1 }) });
    expect(wb.getWorksheet('Speaking Images').getImages().length).toBe(1);
    const plain = await buildWorkbook(data);
    expect(plain.getWorksheet('Speaking Images').getImages().length).toBe(0);
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe('HTML report', () => {
  it('is self-contained: no scripts, no external URLs, escapes user text, embeds media via data URIs', async () => {
    const data = sampleData();
    const { html, notes } = await buildHtmlReport(data, { now: new Date('2026-10-17T10:00:00Z'), mediaProvider: async m => (m.kind === 'image' ? PNG_1PX : 'data:audio/webm;base64,AAAA') });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(src|href)\s*=\s*["']https?:/i);
    expect(html).not.toMatch(/url\(\s*["']?https?:/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).toContain('<audio controls');
    expect(html).toContain('src="data:audio/webm;base64,AAAA"');
    expect(html).toContain(`<img src="${PNG_1PX}"`);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Ўзбекча матн');
    expect(html).toContain('Mock &lt;b&gt;test&lt;/b&gt; &amp; more');
    expect(html).toContain('Generated 2026-10-17');
    expect(html).toContain('<svg class="chart"');
    for (const id of ['overview', 'listening', 'reading', 'writing', 'speaking']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('font-family:Anton');
    expect(notes).toEqual([]);
  });
  it('is honest when media is not embedded', async () => {
    const { html, notes } = await buildHtmlReport(sampleData(), { mediaProvider: async () => null });
    expect(html).not.toContain('<audio');
    expect(html).toContain('Audio not embedded in this report');
    expect(notes.length).toBe(2);
  });
  it('handles an empty profile', async () => {
    const { html } = await buildHtmlReport({ settings: {} });
    expect(html).toContain('No scored records yet.');
    expect(html).toContain('No sessions yet.');
  });
});
