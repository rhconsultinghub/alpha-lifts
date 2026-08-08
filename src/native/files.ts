/**
 * File save/share, platform-branched. Web: the Blob + anchor-download dance that used to be
 * duplicated across backup.ts / csv.ts / planIO.ts / shareCard.ts — deduped here, byte-identical
 * behaviour. Native: anchor downloads silently do nothing in a WebView, so the file is written
 * to the app's cache directory and handed to the OS share sheet (@capacitor/filesystem +
 * @capacitor/share), which is how native apps deliver files anyway.
 */
import { isNative } from './platform';

export interface SaveFileRequest {
  filename: string;
  mime: string;
  /** File contents. Strings are treated as UTF-8 text. */
  data: Blob | string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function anchorDownload(req: SaveFileRequest): void {
  const blob = req.data instanceof Blob ? req.data : new Blob([req.data], { type: req.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = req.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Returns how the file was delivered, so callers can phrase confirmations. */
export async function saveOrShareFile(req: SaveFileRequest): Promise<'downloaded' | 'shared' | 'failed'> {
  if (!isNative()) {
    anchorDownload(req);
    return 'downloaded';
  }
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share')
    ]);
    const blob = req.data instanceof Blob ? req.data : new Blob([req.data], { type: req.mime });
    const base64 = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: req.filename,
      data: base64,
      directory: Directory.Cache
    });
    await Share.share({ title: req.filename, files: [written.uri] });
    return 'shared';
  } catch {
    // Share-sheet cancel throws on some platforms; the file still reached the sheet, but a
    // genuine failure lands here too — 'failed' keeps callers honest without overclaiming.
    return 'failed';
  }
}
