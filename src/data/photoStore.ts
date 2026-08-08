// Progress photos, stored locally in IndexedDB — deliberately OUTSIDE the AppState blob and the
// cloud sync layer. Photos are megabytes each; putting them in localStorage would blow the ~5 MB
// quota the whole app lives in, and syncing them would multiply the state PUT payload by orders
// of magnitude (the Worker caps state bodies at 4 MB). The honest trade, stated in the UI: photos
// stay on this device and are not part of backups or account sync.

export interface ProgressPhoto {
  id: number;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  blob: Blob;
}

const DB_NAME = 'alpha-lifts-photos';
const STORE = 'photos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

// Downscale before storing: a phone camera shot is 3-12 MB and 4000px; the compare view renders
// at screen width. 1280px JPEG q0.85 keeps visible detail at ~150-400 KB per photo.
const MAX_DIM = 1280;
async function downscale(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && file.type === 'image/jpeg') { bmp.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    return out || file;
  } catch {
    // Unsupported format or bitmap failure — store the original rather than losing the photo.
    return file;
  }
}

export async function addPhoto(file: Blob): Promise<void> {
  const blob = await downscale(file);
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await tx('readwrite', store => store.add({ date, blob } as Omit<ProgressPhoto, 'id'>) as IDBRequest<IDBValidKey>);
}

export async function listPhotos(): Promise<ProgressPhoto[]> {
  const all = await tx<ProgressPhoto[]>('readonly', store => store.getAll() as IDBRequest<ProgressPhoto[]>);
  // newest first
  return all.sort((a, b) => b.id - a.id);
}

export async function deletePhoto(id: number): Promise<void> {
  await tx('readwrite', store => store.delete(id) as IDBRequest<undefined>);
}
