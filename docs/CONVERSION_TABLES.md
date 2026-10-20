# Listening and Academic Reading raw-score → band tables

`src/core/bands.js` (`LISTENING_TABLE`, `READING_ACADEMIC_TABLE`, 41 explicit entries each, one `bandFor()` lookup). **Indicative only** – exact marks vary between test versions. Not for General Training Reading.

## Sources and confidence
* **Official anchors (British Council "IELTS scoring in detail" page):** minimum raw score for band 5 / 6 / 7 / 8 – Listening 16 / 23 / 30 / 35; Academic Reading 15 / 23 / 30 / 35. The tables are tested against these.
* **Remaining thresholds:** the widely published tables reproduced by test-prep sites (e.g. examenglish.com, cathoven, ece.edu.vn). These are third-party; I could not find a single official page listing every threshold. Sites differ slightly at some half-band boundaries; the commonly agreed table is used.
* **Raw 0–9** (bands ≤3.5): only third-party sources; lowest confidence, rarely relevant.

## Corrections to the supplied anchor table
| Item | Supplied | Used | Reason |
|---|---|---|---|
| Reading 39 | 8.5 | **9.0** | published tables: 39–40 = 9.0 |
| Listening 15 | 5.0 | **4.5** | band 5 starts at 16 (official anchor); 13–15 = 4.5 |
| Listening 26 | 6.0–6.5 | **6.5** | 26–29 = 6.5 |
| Listening 18 | 5.0–5.5 | **5.5** | 18–22 = 5.5 |
| Raw 0–9 | missing | filled | see above |

## Tables
| Band | Listening raw | Academic Reading raw |
|---|---|---|
| 9.0 | 39–40 | 39–40 |
| 8.5 | 37–38 | 37–38 |
| 8.0 | 35–36 | 35–36 |
| 7.5 | 32–34 | 33–34 |
| 7.0 | 30–31 | 30–32 |
| 6.5 | 26–29 | 27–29 |
| 6.0 | 23–25 | 23–26 |
| 5.5 | 18–22 | 19–22 |
| 5.0 | 16–17 | 15–18 |
| 4.5 | 13–15 | 13–14 |
| 4.0 | 10–12 | 10–12 |
| 3.5 | 8–9 | 8–9 |
| 3.0 | 6–7 | 6–7 |
| 2.5 | 4–5 | 4–5 |
| 2.0 | 2–3 | 2–3 |
| 1.0 / 0 | 1 / 0 | 1 / 0 |

## Overall band
Mean of the four skill bands rounded to the nearest half band; .25 rounds up to the next half, .75 up to the next whole (integer arithmetic, no float error). Missing skills are never zero; fewer than four skills is labelled an *incomplete estimate*.
