// Image helpers used only for exports (originals are never modified).
export function blobToDataUri(blob) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
}
/** Downscale to a JPEG with the longest side <= max. Returns { blob, width, height } or null if the image can't be decoded. */
export async function downscaleImage(blob, { max = 1200, quality = 0.8 } = {}) {
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
    return out ? { blob: out, width: w, height: h } : null;
  } catch { return null; }
}
