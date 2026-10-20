# Complete backup (ZIP) – format version 1
```
ielts_backup_YYYY-MM-DD_HHMM.zip
├─ manifest.json        format, formatVersion, schemaVersion, appVersion, createdAt, counts, inventory[{path,size,sha256,kind}]
├─ README.txt
├─ data/ profile.json listening.json reading.json writing_task1.json writing_task2.json speaking.json goals.json settings.json
└─ media/ speaking_audio/ question_images/ other_attachments/
```
* `speaking.json` = `{ sessions:[…], media:[…] }`; each media row links to its session by `sessionId` and to its file by relative `path`.
* Creation fails (and says so) if any attachment cannot be read; the finished ZIP is re-opened and verified before success is reported.
* **Validation before restore:** valid ZIP → manifest present → format name/version supported → schemaVersion not newer than the app → every data file present, valid JSON, SHA-256 matches inventory → records sanitised (invalid values dropped with warnings) → attachments checked (missing/damaged ones are skipped with a warning, the rest restores).
* **Restore strategies:** (1) add missing, keep mine; (2) add missing, newest `updatedAt` wins; (3) replace everything (explicit confirmation). Attachment file-name collisions are renamed (`…_restored1.ext`), never overwritten.
* Future schema changes: add `MIGRATIONS[n]` in `src/core/backup.js`; older backups are upgraded on read, newer ones are refused with a clear message.
