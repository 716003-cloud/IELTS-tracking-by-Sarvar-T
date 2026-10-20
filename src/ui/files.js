// File picking and delivering files to the user (Android share sheet / browser download).
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { writeChunked } from '../core/media.js';

/** Open the system file chooser. `capture` ('environment') asks for the camera where supported. */
export function pickFiles(accept, { multiple = false, capture = null } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.multiple = multiple;
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    let settled = false;
    const done = files => { if (!settled) { settled = true; input.remove(); resolve(files); } };
    input.addEventListener('change', () => done([...input.files]));
    input.addEventListener('cancel', () => done([]));
    document.body.append(input);
    input.click();
  });
}

/** Android: write to app cache and open the share sheet (Save to Drive/Files, send, etc.). Browser: download. */
export async function deliverFile(blob, filename, { dialogTitle = 'Save or share' } = {}) {
  if (Capacitor.isNativePlatform()) {
    try { await Filesystem.rmdir({ path: 'exports', directory: Directory.Cache, recursive: true }); } catch { /* none yet */ }
    const path = `exports/${filename}`;
    await writeChunked(path, blob, Directory.Cache);
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    await Share.share({ title: filename, url: uri, dialogTitle });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}
