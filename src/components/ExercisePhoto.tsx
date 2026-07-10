import type { CSSProperties } from 'react';
import { ExerciseIcon } from '../icons/ExerciseIcon';

export function ExercisePhoto({ pattern, size = 72, radius = 14, onClick }: { pattern: string; size?: number; radius?: number; onClick?: () => void }) {
  const style: CSSProperties = {
    flex: 'none', width: size, height: size, borderRadius: radius, overflow: 'hidden', position: 'relative',
    background: 'linear-gradient(160deg, oklch(0.24 0.05 35), #17140f)', border: '1px solid rgba(255,255,255,.08)',
    padding: size > 40 ? 10 : 6, color: 'oklch(0.72 0.17 35)'
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} style={{ ...style, ...(onClick ? { cursor: 'pointer' } : {}) }}>
      <ExerciseIcon pattern={pattern} />
    </Tag>
  );
}
