// Anatomical body map — renders the reference anatomy line art (public/body-front.png /
// body-back.png, light line art on a dark background) with per-muscle tint layers on top.
// Opacity per muscle = how much that muscle is worked.
//
// The tint layers are CSS-masked by per-muscle alpha masks (public/muscle-masks/{view}-{slug}.png)
// that were derived FROM THE ARTWORK ITSELF: scripts/make-muscle-masks.mjs thresholds the line
// art, connected-component labels the closed muscle compartments, and assigns each compartment
// to a muscle. A fill therefore *cannot* cross a drawn line — containment is exact by
// construction, which is what six hand-recalibration passes of the previous SVG-polygon overlay
// never achieved. If the reference images ever change, re-run that script (see its header).
//
// Alignment: masks are emitted at each image's native pixel dimensions, so `mask-size: contain`
// + `mask-position: center` letterboxes identically to the <img>'s objectFit: 'contain' at any
// render size. The CSS.supports guard matters: without mask support the tint div would paint as
// a solid unmasked rectangle, so unsupported browsers must render no highlight instead.
import { accentAlpha } from '../theme';

const FRONT_MUSCLES = ['Shoulders', 'Chest', 'Biceps', 'Forearms', 'Core', 'Quads', 'Calves'];
const BACK_MUSCLES = ['Back', 'Rear Delts', 'Triceps', 'Forearms', 'Glutes', 'Hamstrings', 'Calves'];

const slug = (m: string) => m.toLowerCase().replace(/\s+/g, '-');

const MASKS_SUPPORTED = typeof CSS !== 'undefined' &&
  (CSS.supports('mask-image', 'url(#m)') || CSS.supports('-webkit-mask-image', 'url(#m)'));

export function fillForMuscle(muscle: string | null, ranks: Record<string, number>): string {
  if (!muscle || !(muscle in ranks)) return 'transparent';
  const opacity = 0.28 + 0.6 * (ranks[muscle] || 0);
  return accentAlpha(opacity);
}

export function BodyDiagram({ view, ranks, width = 34, height = 63 }: {
  view: 'front' | 'back';
  ranks: Record<string, number>;
  width?: number;
  height?: number;
}) {
  const isFront = view === 'front';
  const src = `${import.meta.env.BASE_URL}${isFront ? 'body-front.png' : 'body-back.png'}`;
  const muscles = isFront ? FRONT_MUSCLES : BACK_MUSCLES;
  return (
    <div style={{ width, height, position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#0a0908', flex: 'none' }}>
      <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
      {MASKS_SUPPORTED && muscles.filter(m => m in ranks).map(m => {
        const url = `url(${import.meta.env.BASE_URL}muscle-masks/${view}-${slug(m)}.png)`;
        return (
          <div key={m} style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: fillForMuscle(m, ranks),
            WebkitMaskImage: url, maskImage: url,
            WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
            WebkitMaskSize: 'contain', maskSize: 'contain',
            WebkitMaskPosition: 'center', maskPosition: 'center',
          }} />
        );
      })}
    </div>
  );
}
