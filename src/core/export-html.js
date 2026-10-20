// Self-contained HTML report: inline CSS, inline SVG charts, fonts/images/audio as data: URIs.
// No external scripts, fonts, images or network requests. Read-only snapshot, not a restore format.
import { esc, fmtDate, fmtBytes, fmtDuration } from './util.js';
import { SKILLS, recordSummary, assessmentStatus, WRITING_CRITERIA, SPEAKING_CRITERIA } from './model.js';
import { calcWritingTaskBand, calcSpeakingBand, WRITING_SCORING } from './scoring.js';
import { dashboard, practiceAggregates, mistakeFrequency } from './stats.js';
import { fmtBand, fmtDelta } from './bands.js';
import { REVIEW_STATES } from './categories.js';
import { lineChartSvg, legendHtml, SKILL_VARS } from '../ui/chart.js';
import { APP_VERSION } from './backup.js';
import logo from '../../assets/logo-white.png?inline';
import antonLatin from '@fontsource/anton/files/anton-latin-400-normal.woff2?inline';
import mul400 from '@fontsource/mulish/files/mulish-latin-400-normal.woff2?inline';
import mul700 from '@fontsource/mulish/files/mulish-latin-700-normal.woff2?inline';
import mulCyr400 from '@fontsource/mulish/files/mulish-cyrillic-400-normal.woff2?inline';
import mulCyr700 from '@fontsource/mulish/files/mulish-cyrillic-700-normal.woff2?inline';

const CSS = `
@font-face{font-family:Anton;src:url(${antonLatin}) format('woff2');font-weight:400}
@font-face{font-family:Mulish;src:url(${mul400}) format('woff2');font-weight:400;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:Mulish;src:url(${mul700}) format('woff2');font-weight:700;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:Mulish;src:url(${mulCyr400}) format('woff2');font-weight:400;unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:Mulish;src:url(${mulCyr700}) format('woff2');font-weight:700;unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
:root{--bg:#f4f7fb;--surface:#fff;--text:#171b2d;--muted:#5b6478;--line:#dbe3ee;--navy:#00345c;--yellow:#fcbc38;--grid:#e3e9f1;
--c-listening:#2f6fdb;--c-reading:#12906a;--c-writing:#b8479a;--c-speaking:#d98200;--c-overall:#00345c;--a1:#1b873f;--a2:#c93636;--a3:#c4650a;--good:#12794a;--bad:#c93636}
@media(prefers-color-scheme:dark){:root{--bg:#04172b;--surface:#0b2743;--text:#eef3f9;--muted:#a6b4c8;--line:#1d3d5e;--grid:#1d3d5e;--c-listening:#6aa6ff;--c-reading:#3ddc97;--c-writing:#f08ad4;--c-speaking:#ffb84d;--c-overall:#fcbc38;--a1:#4cd07d;--a2:#ff7b7b;--a3:#ffa94d;--good:#4cd07d;--bad:#ff7b7b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 Mulish,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{background:linear-gradient(135deg,#00345c,#00203f);color:#fff;padding:24px 20px;display:flex;gap:16px;align-items:center}
header img{width:52px;height:52px}header h1{font:400 30px Anton,Impact,"Arial Narrow",sans-serif;letter-spacing:.5px;margin:0;text-transform:uppercase}
header p{margin:2px 0 0;opacity:.85;font-size:14px}
nav{position:sticky;top:0;z-index:5;background:var(--surface);border-bottom:1px solid var(--line);display:flex;gap:4px;overflow-x:auto;padding:6px 12px}
nav a{padding:10px 14px;border-radius:999px;color:var(--text);text-decoration:none;font-weight:700;white-space:nowrap}nav a:hover{background:var(--grid)}
main{max-width:980px;margin:0 auto;padding:16px}section{margin:0 0 36px;scroll-margin-top:60px}
h2{font:400 26px Anton,Impact,sans-serif;text-transform:uppercase;color:var(--navy);margin:8px 0 14px}@media(prefers-color-scheme:dark){h2{color:var(--yellow)}}
h3{margin:18px 0 8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px}.card .big{font:400 40px Anton,Impact,sans-serif;line-height:1.1}
.muted{color:var(--muted)}.small{font-size:13px}.chip{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid var(--line);margin:2px 4px 2px 0}
.chip.ok{color:var(--good);border-color:var(--good)}.chip.warn{color:var(--a3);border-color:var(--a3)}.chip.bad{color:var(--bad);border-color:var(--bad)}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:13px;margin:6px 0}.lg i{display:inline-block;width:14px;height:4px;border-radius:2px;margin-right:6px;vertical-align:middle}
details{background:var(--surface);border:1px solid var(--line);border-radius:12px;margin:10px 0;padding:0}summary{cursor:pointer;padding:12px 14px;font-weight:700;list-style:none}
summary::-webkit-details-marker{display:none}summary:after{content:"▾";float:right;color:var(--muted)}details[open] summary:after{content:"▴"}.body{padding:2px 14px 14px;border-top:1px solid var(--line)}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:14px}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:center}th:first-child,td:first-child{text-align:left}
th.a1{color:var(--a1);border-bottom:3px solid var(--a1)}th.a2{color:var(--a2);border-bottom:3px solid var(--a2)}th.a3{color:var(--a3);border-bottom:3px solid var(--a3)}
.up{color:var(--good);font-weight:700}.down{color:var(--bad);font-weight:700}pre.text{white-space:pre-wrap;word-wrap:break-word;font:inherit;background:var(--bg);border-radius:10px;padding:12px;margin:6px 0}
.thumbs{display:flex;flex-wrap:wrap;gap:8px}.thumbs img{max-width:220px;max-height:220px;border-radius:8px;border:1px solid var(--line)}
audio{width:100%;margin:4px 0}.bar{height:10px;background:var(--grid);border-radius:5px;overflow:hidden}.bar i{display:block;height:100%;background:var(--c-listening)}
footer{max-width:980px;margin:0 auto;padding:16px;color:var(--muted);font-size:13px}
@media print{nav{display:none}details{break-inside:avoid}details>*{display:block}}
`;

const label = k => k[0].toUpperCase() + k.slice(1);
const chip = (t, c = '') => `<span class="chip ${c}">${esc(t)}</span>`;
const delta = d => (d == null ? '—' : `<span class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${fmtDelta(d)}</span>`);

function practiceCard(rec, cfg, catLabel) {
  const s = recordSummary(rec);
  const head = `${esc(fmtDate(rec.date))} · ${esc(rec.source || 'Untitled test')}`;
  const chips = [s.finalBand != null ? chip(`Band ${fmtBand(s.finalBand)}`, 'ok') : '', chip(s.attempt2Done ? 'Attempt 2 done' : 'Attempt 2 needed', s.attempt2Done ? 'ok' : 'warn'), rec.completed ? chip('Complete', 'ok') : chip(rec.status === 'saved' ? 'In progress' : 'Draft')].join('');
  const rows = Array.from({ length: cfg.parts }, (_, p) => `<tr><td>${cfg.partWord} ${p + 1}${rec.partTitles[p] ? ' – ' + esc(rec.partTitles[p]) : ''} <span class="muted small">/${cfg.max[p]}</span></td>${[1, 2, 3].map(a => `<td>${rec.attempts[a].scores[p] ?? '—'}</td>`).join('')}<td>${delta(s.partDeltas[3][p] ?? s.partDeltas[2][p])}</td></tr>`).join('');
  const T = (f) => [0, 1, 2].map(i => `<td>${f(s.attempts[i]) ?? '—'}</td>`).join('');
  const mistakes = rec.mistakes.map((m, p) => {
    if (!m.categories.length && !m.custom) return '';
    return `<p><b>${cfg.partWord} ${p + 1}:</b> ${m.categories.map(id => { const st = REVIEW_STATES.find(r => r.id === (m.review?.[id] || 'not_assessed')); return `<span class="chip ${st.id === 'improved' ? 'ok' : st.id === 'not_improved' ? 'bad' : ''}">${st.icon} ${esc(catLabel(id))}</span>`; }).join('')}${m.custom ? ` <i>${esc(m.custom)}</i>` : ''}</p>`;
  }).join('');
  return `<details><summary>${head}<br>${chips}</summary><div class="body">
${rec.description ? `<p>${esc(rec.description)}</p>` : ''}
<table><tr><th></th><th class="a1">Attempt 1</th><th class="a2">Attempt 2</th><th class="a3">Attempt 3</th><th>Change (latest)</th></tr>${rows}
<tr><td><b>Total /40</b></td>${T(a => a.total)}<td></td></tr><tr><td>Incorrect</td>${T(a => a.incorrect)}<td></td></tr><tr><td>Estimated band</td>${T(a => (a.band == null ? null : fmtBand(a.band)))}<td></td></tr></table>
<p>Improvement: Attempt 2 vs 1 ${delta(s.improvements.a2vs1)} · Attempt 3 vs 2 ${delta(s.improvements.a3vs2)} · Attempt 3 vs 1 ${delta(s.improvements.a3vs1)}</p>
${mistakes ? `<h3>Difficulties and review</h3>${mistakes}` : ''}</div></details>`;
}

function skillChart(points, key, target, name) {
  if (!points.length) return '<p class="muted">No scored records yet.</p>';
  const series = [{ name, color: SKILL_VARS[key], points }];
  return lineChartSvg({ series, targets: target ? [{ value: target, color: SKILL_VARS[key], label: 'Target' }] : [], label: `${name} progress` }) + legendHtml(series);
}

/**
 * data: { listening, reading, writing1, writing2, speaking, media, settings }
 * opts.mediaProvider(meta) -> Promise<string|null>  data: URI to embed (null = not embedded)
 */
export async function buildHtmlReport(data, opts = {}) {
  const { listening = [], reading = [], writing1 = [], writing2 = [], speaking = [], media = [], settings = {} } = data;
  const targets = settings.targets || {}; const cats = settings.categories || {};
  const now = opts.now || new Date();
  const notes = [];
  const dash = dashboard({ listening, reading, writing1, writing2, speaking }, targets, 'all');
  const catLabel = skill => id => (cats[skill] || []).find(c => c.id === id)?.label || id;
  const name = settings.profile?.name;

  // Overview
  const sk = ['listening', 'reading', 'writing', 'speaking'];
  const series = sk.map(k => ({ name: label(k), color: SKILL_VARS[k], points: dash.skills[k].all }));
  const cards = sk.map(k => { const s = dash.skills[k].summary; return `<div class="card"><div class="muted">${label(k)}</div><div class="big" style="color:${SKILL_VARS[k]}">${fmtBand(s.latest)}</div>
<div class="small">${s.count} scored · best ${fmtBand(s.best)}${s.provisional ? ' · latest is provisional' : ''}</div><div>${chip(s.trend.label, s.trend.key === 'improving' ? 'ok' : s.trend.key === 'declining' ? 'bad' : '')}</div>
<div class="small muted">${esc(s.target.label)}${targets[k] ? ' (target ' + fmtBand(targets[k]) + ')' : ''}</div></div>`; }).join('');
  const ov = dash.overall;
  const overview = `<section id="overview"><h2>Overview</h2><div class="grid"><div class="card"><div class="muted">Overall band</div><div class="big">${fmtBand(ov.value)}</div>
<div class="small">${ov.value == null ? 'Needs scored practice' : ov.complete ? 'From all four skills' : `Incomplete estimate (${ov.count} of 4 skills)`}</div><div class="small muted">${esc(dash.overallTarget.label)}${targets.overall ? ' (target ' + fmtBand(targets.overall) + ')' : ''}</div></div>${cards}</div>
<h3>Progress over time</h3><div class="card">${series.some(s => s.points.length) ? lineChartSvg({ series, label: 'All skills progress' }) + legendHtml(series) : '<p class="muted">No scored records yet.</p>'}</div>
<h3>Records</h3><div class="card small">Listening ${listening.length} · Reading ${reading.length} · Writing Task 1 ${writing1.length} · Writing Task 2 ${writing2.length} · Speaking sessions ${speaking.length} · Recordings ${media.filter(m => m.kind === 'audio').length}</div>
<p class="small muted">Writing overall: ${esc(dash.writingBasis === 'combined' ? WRITING_SCORING.combine.label : dash.writingBasis === 'none' ? 'no scored essays yet' : 'only ' + dash.writingBasis + ' has scores so far')}. ${esc(WRITING_SCORING.label)}.</p></section>`;

  // Listening / Reading
  const practice = ['listening', 'reading'].map(kind => {
    const cfg = SKILLS[kind], recs = kind === 'listening' ? listening : reading;
    const ag = practiceAggregates(recs);
    const freq = mistakeFrequency(recs).slice(0, 6);
    const sorted = [...recs].sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1));
    return `<section id="${kind}"><h2>${cfg.label}</h2>${skillChart(dash.skills[kind].all, kind, targets[kind], cfg.label)}
<div class="card small">${ag.records} records · Attempt 2 completed in ${ag.attemptTwoDone ?? ag.attempt2Done} · Attempt 3 in ${ag.attempt3Done}${ag.avgImprovement12 != null ? ` · average gain Attempt 1→2: ${fmtDelta(ag.avgImprovement12, 1)} answers` : ''}</div>
${freq.length ? `<h3>Most frequent difficulties</h3>${freq.map(f => `<p class="small">${esc(catLabel(kind)(f.id))} <span class="muted">— ${f.count}× (✓ ${f.improved} · ✗ ${f.notImproved})</span></p>`).join('')}` : ''}
<h3>Practice records</h3>${sorted.map(r => practiceCard(r, cfg, catLabel(kind))).join('') || '<p class="muted">No records yet.</p>'}
<p class="small muted">Bands are indicative conversions of raw scores and may vary slightly between test versions.</p></section>`;
  }).join('');

  // Writing
  const wsec = [[1, writing1], [2, writing2]].map(([task, recs]) => {
    const crit = WRITING_CRITERIA(task);
    const pts = dash.skills.writing; // chart uses per-task points
    const taskPts = [...recs].sort((a, b) => (a.date < b.date ? -1 : 1)).flatMap(r => { const v = r.teacherOverall ?? calcWritingTaskBand(r.criteria); return v == null ? [] : [{ date: r.date, value: v, provisional: r.teacherOverall == null }]; });
    return `<h3>Task ${task}</h3>${skillChart(taskPts, 'writing', null, 'Task ' + task)}` +
      ([...recs].sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1)).map(r => {
        const prov = calcWritingTaskBand(r.criteria);
        return `<details><summary>${esc(fmtDate(r.date))} · ${esc(r.title || 'Untitled essay')}<br>${chip(assessmentStatus(r, 'writing').label, assessmentStatus(r, 'writing').key === 'assessed' ? 'ok' : '')}${r.teacherOverall != null ? chip('Teacher band ' + fmtBand(r.teacherOverall), 'ok') : ''}${prov != null ? chip('Provisional ' + fmtBand(prov)) : ''}</summary><div class="body">
${r.prompt ? `<h3>Question</h3><pre class="text">${esc(r.prompt)}</pre>` : ''}<h3>Essay</h3><pre class="text">${esc(r.essay) || '—'}</pre>
<h3>Teacher feedback</h3><pre class="text">${esc(r.feedback) || '—'}</pre>
<table><tr>${crit.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr><tr>${['ta', 'cc', 'lr', 'gra'].map(k => `<td>${fmtBand(r.criteria[k])}</td>`).join('')}</tr></table></div></details>`;
      }).join('') || '<p class="muted">No essays yet.</p>');
  }).join('');
  const writing = `<section id="writing"><h2>Writing</h2>${skillChart(dash.skills.writing.all, 'writing', targets.writing, 'Writing overall')}${wsec}</section>`;

  // Speaking
  let audioBudget = 0;
  const sp = [];
  for (const s of [...speaking].sort((a, b) => (a.date + a.createdAt < b.date + b.createdAt ? 1 : -1))) {
    const mine = media.filter(m => m.sessionId === s.id);
    let imgs = '', auds = '', others = '';
    for (const m of mine.filter(m => m.kind === 'image')) {
      const uri = opts.mediaProvider ? await opts.mediaProvider(m) : null;
      imgs += uri ? `<img src="${uri}" alt="${esc(m.name)}">` : `<span class="chip">${esc(m.name)} (not embedded)</span>`;
      if (!uri) notes.push(`Image not embedded: ${m.name}`);
    }
    for (const m of mine.filter(m => m.kind === 'audio')) {
      const uri = opts.mediaProvider ? await opts.mediaProvider(m) : null;
      if (uri) audioBudget += m.size || 0;
      else notes.push(`Audio not embedded: ${m.name} (${fmtBytes(m.size)})`);
      auds += `<p class="small"><b>${m.part ? 'Part ' + m.part : 'General'}</b> · ${esc(m.name)} · ${fmtDuration(m.duration)}</p>${uri ? `<audio controls preload="none" src="${uri}"></audio>` : '<p class="muted small">Audio not embedded in this report – it is in the complete backup.</p>'}`;
    }
    others = mine.filter(m => m.kind === 'file').map(m => `<span class="chip">${esc(m.originalName || m.name)}</span>`).join('');
    const st = assessmentStatus(s, 'speaking'); const prov = calcSpeakingBand(s.criteria);
    sp.push(`<details><summary>${esc(fmtDate(s.date))} · ${esc(s.title || 'Untitled session')}<br>${s.parts.map(p => chip('Part ' + p)).join('')}${chip(st.label, st.key === 'assessed' ? 'ok' : '')}${s.overall != null ? chip('Overall ' + fmtBand(s.overall), 'ok') : prov != null ? chip('Provisional ' + fmtBand(prov)) : ''}</summary><div class="body">
${s.topic ? `<p>${esc(s.topic)}</p>` : ''}${imgs ? `<h3>Question images</h3><div class="thumbs">${imgs}</div>` : ''}${auds ? `<h3>Recordings</h3>${auds}` : ''}${others ? `<h3>Other files</h3>${others}` : ''}
<table><tr>${SPEAKING_CRITERIA.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr><tr>${['fc', 'lr', 'gra', 'pr'].map(k => `<td>${fmtBand(s.criteria[k])}</td>`).join('')}</tr></table>
${s.feedback ? `<h3>Teacher feedback</h3><pre class="text">${esc(s.feedback)}</pre>` : ''}${s.notes ? `<h3>My notes</h3><pre class="text">${esc(s.notes)}</pre>` : ''}</div></details>`);
  }
  const speakingHtml = `<section id="speaking"><h2>Speaking</h2>${skillChart(dash.skills.speaking.all, 'speaking', targets.speaking, 'Speaking')}<div class="card small">${speaking.length} sessions · ${media.filter(m => m.kind === 'audio').length} recordings</div>${sp.join('') || '<p class="muted">No sessions yet.</p>'}</section>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IELTS Progress Report</title><style>${CSS}</style></head><body>
<header><img src="${logo}" alt=""><div><h1>IELTS Progress Report</h1><p>${name ? esc(name) + ' · ' : ''}Generated ${esc(now.toISOString().slice(0, 10))}</p></div></header>
<nav><a href="#overview">Overview</a><a href="#listening">Listening</a><a href="#reading">Reading</a><a href="#writing">Writing</a><a href="#speaking">Speaking</a></nav>
<main>${overview}${practice}${writing}${speakingHtml}</main>
<footer>Generated ${esc(now.toISOString())} by IELTS Tracker ${APP_VERSION}. This report is a read-only snapshot for viewing and printing; use Complete Backup to move your data to another phone.${notes.length ? `<br><b>Not embedded:</b> ${notes.map(esc).join('; ')}` : ''}</footer></body></html>`;
  return { html, notes };
}
export const htmlFileName = (d = new Date()) => `ielts_report_${d.toISOString().slice(0, 10)}.html`;
