import type { CSSProperties } from 'react';
import { ExerciseIcon } from '../icons/ExerciseIcon';
import { exercisePhotoUrl } from '../data/exercisePhotos';

export function ExercisePhoto({ id, pattern, size = 72, radius = 14, onClick }: { id?: string; pattern: string; size?: number; radius?: number; onClick?: () => void }) {
  const photoUrl = id ? exercisePhotoUrl(id) : null;
  const style: CSSProperties = {
    flex: 'none', width: size, height: size, borderRadius: radius, overflow: 'hidden', position: 'relative',
    background: 'linear-gradient(160deg, oklch(0.24 0.05 35), #17140f)', border: '1px solid rgba(255,255,255,.08)',
    padding: photoUrl ? 0 : (size > 40 ? 10 : 6), color: 'oklch(0.72 0.17 35)'
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} style={{ ...style, ...(onClick ? { cursor: 'pointer' } : {}) }}>
      {photoUrl
        ? <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <ExerciseIcon pattern={pattern} />}
    </Tag>
  );
}
