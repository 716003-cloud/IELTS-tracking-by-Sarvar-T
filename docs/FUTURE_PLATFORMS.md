# Adding iOS and desktop later
* **iOS:** `npx cap add ios`. Core/UI code is shared. Needed: `NSMicrophoneUsageDescription` / `NSCameraUsageDescription`; MediaRecorder on iOS records `audio/mp4` (already handled by the MIME picker and `extFor`); test the Filesystem adapter and share sheet.
* **Desktop:** wrap `dist/` with Tauri or Electron; use the browser `webAdapter` (IndexedDB) or add a Node-filesystem media adapter implementing `write/read/url/remove/exists`.
* **Data model needs no redesign:** records are UUID-keyed JSON, media are relative paths, the backup ZIP is platform-neutral. A backup made on Android restores on iOS/desktop.
