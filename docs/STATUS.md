# Status: what is implemented, what is verified, what is not

## Implemented (all in source)
* Five sections with bottom navigation; settings/overflow for theme, targets, categories, Excel, HTML, backup/restore, data management.
* **Listening / Reading:** multiple records per day, free-text source name, part/passage titles, 3 attempts (green/red/orange, labelled, not colour-only), cumulative scores, validation (10/10/10/10, 13/13/14), totals, incorrect count, band, per-part and total improvement incl. negative, required Attempt 2 rule for "complete", drafts, edit/view mode, search and filters, configurable mistake categories + custom text, Improved / Not improved / Not assessed indicators (neutral by default), statistics (trend, first vs final attempt, attempt completion, weakest part, most common difficulties).
* **Writing:** Task 1 and Task 2 separate (own lists, labels, statistics), essay/prompt/feedback, four criteria + teacher overall kept separate from the provisional calculation (clearly labelled), explicit view/edit/save/cancel/delete, task and combined statistics.
* **Speaking:** sessions with any combination of parts, question images (gallery/camera) copied to app storage, real MediaRecorder audio recording with permission explanation and denial handling, playback, durations, unique file names, assessment fields (partial assessment allowed and labelled), statistics.
* **General Statistics:** overall band (IELTS rounding, incomplete estimate clearly labelled), per-skill latest/best/trend/target gap, combined chart with target lines, date ranges, attempt completion, recent activity.
* **Exports:** `.xlsx` (ExcelJS, 9 sheets, formatted, filters, optional embedded images), self-contained HTML report (inline CSS/SVG/fonts, images and optional audio as data URIs), complete ZIP backup with SHA-256 inventory, validated restore with three conflict strategies.
* Light / dark / system theme; local-only privacy (cloud backup disabled).

## Automated tests: 50 passing (`npm test`)
`bands` (tables, official anchors, rounding), `model` (spec examples 26→31→35, negative change, limits, completion rule), `backup` (round trip, tamper/truncate/newer-version/missing-file/damaged-attachment cases, failed restore leaves data untouched, merge strategies, no overwrite of same-named files, safe media deletion), `export` (xlsx read back, HTML self-containment and escaping), `ui` (jsdom: full Listening workflow, validation, Reading limits, Writing save/view/edit, unsaved-edit survival, Speaking session UI, all statistics/settings pages render, targets and theme persist).

## Your 23 test scenarios
| # | Scenario | Status |
|---|---|---|
| 1–5, 7 | Listening/Reading entry, totals, bands, improvement, optional attempt 3, lower score, invalid scores | **Automated** |
| 6 | Reading limits | **Automated** |
| 8 | Save/edit without losing other data | Covered in UI test (scores, mistakes survive edits) |
| 9 | Task 1 / Task 2 independent | **Automated** |
| 10 | Paste, save, close, reopen | Save + reopen automated; **a real app restart was not tested** |
| 11 | Speaking session with question image | Storage path automated; **gallery/camera picker not tested on a device** |
| 12 | Record, save, play, reopen audio | **NOT tested** (needs a device/emulator with a microphone) |
| 13–14 | Statistics, targets on dashboard | **Automated** (render + values); charts not visually inspected |
| 15 | Excel export | Generated and read back with ExcelJS; **not opened in Excel itself** |
| 16 | HTML report offline | Verified structurally (no scripts/external URLs); **not opened in a browser** |
| 17–19 | ZIP backup, restore on clean install, relationships survive | **Automated** with an in-memory media adapter; the Android Filesystem adapter is untested |
| 20 | Validation / failure handling | **Automated** |
| 21 | Light/dark | Switching + persistence automated; **appearance not visually inspected** |
| 22 | Restart persistence | **NOT tested** on a device |
| 23 | Different screen sizes | **NOT tested** (responsive CSS only) |

## Not done / limitations
* **No APK built, nothing run on a device or emulator.** The sandbox could not reach dl.google.com / Gradle / Maven. The Android project (Capacitor 7, compileSdk 35, JDK 21, Gradle 8.11) is generated and XML-validated but **unbuilt**; the first build may need small fixes. CI workflow included.
* No screenshots/visual QA were possible; layout and contrast were designed from tokens, not seen.
* Excel export contains no charts (ExcelJS cannot create them); a score-history table is included for plotting. Audio is never embedded in Excel (only referenced).
* The ZIP backup is assembled in memory: very large audio libraries may exhaust phone memory. Not tested at scale.
* Recording stops if Android suspends the app; leaving the screen mid-recording saves what was captured. Format is WebM/Opus (Chrome/Edge/Firefox play it; Safari not verified).
* Question images are stored as originals (no compression), so backups can be large.
* Writing formula is **provisional** (mean of four criteria, half-band rounding); Task 1/Task 2 combination uses 1:2 weights. Both are isolated in `src/core/scoring.js`.
* Raw scores 0–9 and several half-band boundaries come from third-party tables (see `CONVERSION_TABLES.md`).
* The `INTERNET` permission remains from the Capacitor template; the app makes no network requests. It can be removed once you have verified the app loads without it on a device.
* Fonts (Anton, Mulish) were matched by eye from your images.
* The app id `app.ieltstracker.student` is a placeholder; change it in `capacitor.config.json` and `android/app/build.gradle` before publishing anywhere.
