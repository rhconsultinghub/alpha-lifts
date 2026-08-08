import { useEffect, useRef, useState } from 'react';
import { addPhoto, deletePhoto, listPhotos, type ProgressPhoto } from '../data/photoStore';

// Self-contained on purpose — the one deliberate exception to the "components only read vm.foo"
// rule. Photos live in IndexedDB (see photoStore.ts for why they can't be AppState), and IDB is
// async, so this card owns its own load/refresh cycle instead of threading async blobs through
// the synchronous view model.
export function ProgressPhotosCard() {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    listPhotos().then(list => {
      setPhotos(list);
      setUrls(prev => {
        const next: Record<number, string> = {};
        list.forEach(p => { next[p.id] = prev[p.id] || URL.createObjectURL(p.blob); });
        // revoke URLs for photos that no longer exist
        Object.entries(prev).forEach(([id, url]) => { if (!next[Number(id)]) URL.revokeObjectURL(url); });
        return next;
      });
    }).catch(() => setPhotos([]));
  };

  useEffect(() => {
    refresh();
    // revoke everything on unmount
    return () => { setUrls(prev => { Object.values(prev).forEach(URL.revokeObjectURL); return {}; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { await addPhoto(file); refresh(); } finally { setBusy(false); }
  };

  const viewing = viewingId != null ? photos.find(p => p.id === viewingId) : null;

  return (
    <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 14, padding: 14, marginBottom: 26 }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ width: '100%', font: "700 12px 'Inter'", padding: 12, borderRadius: 12, border: '1px dashed rgba(255,255,255,.25)', background: 'none', color: 'rgba(245,240,234,.7)' }}>
        {busy ? 'Saving…' : '📷 Add Progress Photo'}
      </button>
      <div style={{ font: "400 10px/1.4 'Inter'", color: 'rgba(245,240,234,.35)', textAlign: 'center', marginTop: 6, marginBottom: photos.length ? 12 : 0 }}>
        Photos stay on this device only — they're not part of backups or account sync.
      </div>

      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {photos.map(p => (
            <button key={p.id} onClick={() => setViewingId(p.id)} style={{ position: 'relative', border: 'none', background: 'rgba(255,255,255,.05)', borderRadius: 10, padding: 0, overflow: 'hidden', aspectRatio: '3 / 4' }}>
              {urls[p.id] && <img src={urls[p.id]} alt={'Progress photo ' + p.date} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, font: "600 9px 'Inter'", color: '#f5f0ea', background: 'rgba(0,0,0,.55)', padding: '3px 0', textAlign: 'center' }}>{p.date}</span>
            </button>
          ))}
        </div>
      )}

      {viewing && urls[viewing.id] && (
        <div onClick={() => { setViewingId(null); setConfirmDeleteId(null); }} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(0,0,0,.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <img src={urls[viewing.id]} alt={'Progress photo ' + viewing.date} style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 12 }} onClick={e => e.stopPropagation()} />
          <div style={{ font: "600 13px 'Inter'", color: '#f5f0ea', marginTop: 12 }}>{viewing.date}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => {
                if (confirmDeleteId === viewing.id) {
                  deletePhoto(viewing.id).then(() => { setViewingId(null); setConfirmDeleteId(null); refresh(); });
                } else setConfirmDeleteId(viewing.id);
              }}
              style={{ font: "600 12px 'Inter'", padding: '10px 18px', borderRadius: 10, border: '1px solid oklch(0.65 0.19 35 / 0.6)', background: confirmDeleteId === viewing.id ? 'oklch(0.65 0.19 35)' : 'none', color: confirmDeleteId === viewing.id ? '#0d0c0b' : 'oklch(0.72 0.17 35)' }}
            >{confirmDeleteId === viewing.id ? 'Confirm delete' : 'Delete'}</button>
            <button onClick={() => { setViewingId(null); setConfirmDeleteId(null); }} style={{ font: "600 12px 'Inter'", padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,.25)', background: 'none', color: 'rgba(245,240,234,.8)' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
