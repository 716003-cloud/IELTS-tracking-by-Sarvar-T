# Architecture

## Choice: Capacitor + web UI
| Option | Offline | Audio/images | Cross-platform later | Testable without a device |
|---|---|---|---|---|
| Flutter + SQLite | yes | plugins | yes | needs Flutter + SDK toolchain |
| React Native | yes | plugins | yes | needs RN toolchain |
| **Capacitor (chosen)** | yes (bundled assets) | Web MediaRecorder, file inputs, Filesystem plugin | Android now, iOS/desktop (Electron/Tauri) reuse the same code | **yes** – logic and UI flows run under Node/jsdom |

Chosen because the calculation, storage, backup and export code can be exercised by automated tests, and the same code base targets iOS and desktop later. Trade-off: audio/camera depend on the Android WebView (not testable here).

## Layers
```
src/core   pure logic + storage (no UI): bands, scoring, model, stats, db, media, backup, export-xlsx, export-html
src/ui     screens (vanilla JS): shell/router, practice (Listening+Reading), writing, speaking, stats-view, settings, chart (SVG)
test       vitest: bands, model, backup/restore, exports, UI flows (jsdom)
android    Capacitor Android project (permissions, icons, signing hooks)
```
* **One lookup per skill** (`bands.js`), one provisional Writing/Speaking place (`scoring.js`).
* Derived values (totals, bands, improvements) are never stored – always recomputed from the stored scores.
* **Storage:** IndexedDB (`records`, `media`, `settings`) + media adapter (`nativeAdapter` Filesystem on Android, IndexedDB in browser, memory in tests). Restore writes files first, then commits the database changes in one transaction; on failure copied files are removed and existing data is untouched.
* **Drafts:** new records autosave as drafts (after the first real input); saved records edited in place keep an in-memory working copy so opening Statistics and returning does not lose edits.
* Every record has a UUID `id`; attachments reference `sessionId` + relative `path` (never absolute paths).

## Data model (schemaVersion 1)
* `listening|reading`: `{id,type,date,source,description,partTitles[],attempts{1,2,3:{scores[]}},mistakes[{categories[],custom,review{catId:state}}],completed,status,createdAt,updatedAt}`
* `writing1|writing2`: `{id,type,date,title,prompt,essay,feedback,criteria{ta,cc,lr,gra},teacherOverall,status,…}`
* `speaking`: `{id,type,date,title,topic,parts[],criteria{fc,lr,gra,pr},overall,feedback,notes,status,…}`
* `media`: `{id,sessionId,part,kind(audio|image|file),mime,size,duration,name,originalName,path,createdAt}`
* `settings`: `theme, targets{overall,listening,reading,writing,speaking}, categories{listening[],reading[]}, profile, lastBackupAt`
