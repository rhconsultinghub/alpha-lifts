// Workout summary share card — a canvas-rendered PNG in the app's own look, handed to the Web
// Share API (falling back to a plain download where share-with-files isn't supported). Pure
// client-side: nothing is uploaded anywhere; "sharing" is the OS share sheet.
import { isNative } from '../native/platform';
import { saveOrShareFile } from '../native/files';

export interface ShareCardData {
  dayLabel: string;
  dateText: string;
  userName?: string;
  volumeText: string;
  durationText: string;
  prCount: number;
  exercises: { name: string; resultText: string; isPR?: boolean }[];
}

const W = 1080;
const ACCENT = '#f0752f';
const CREAM = '#f5f0ea';

export function renderShareCard(data: ShareCardData): Promise<Blob | null> {
  const rows = data.exercises.slice(0, 10);
  const extra = data.exercises.length - rows.length;
  const listH = rows.length * 74 + (extra > 0 ? 60 : 0);
  const H = 560 + listH + 120;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#241d15');
  bg.addColorStop(1, '#120f0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // header
  ctx.fillStyle = ACCENT;
  ctx.font = "700 34px 'Space Grotesk', 'Inter', sans-serif";
  ctx.fillText('🏋️ ALPHA LIFTS', 72, 104);
  ctx.fillStyle = 'rgba(245,240,234,.45)';
  ctx.font = "500 30px 'Inter', sans-serif";
  ctx.textAlign = 'right';
  ctx.fillText(data.dateText, W - 72, 104);
  ctx.textAlign = 'left';

  // title
  ctx.fillStyle = CREAM;
  ctx.font = "700 76px 'Space Grotesk', 'Inter', sans-serif";
  ctx.fillText(data.dayLabel, 72, 220);
  ctx.fillStyle = 'rgba(245,240,234,.55)';
  ctx.font = "400 32px 'Inter', sans-serif";
  ctx.fillText(data.userName ? `${data.userName} put the work in.` : 'Workout complete.', 72, 274);

  // stat tiles
  const stats: [string, string][] = [
    ['VOLUME', data.volumeText],
    ['DURATION', data.durationText],
    ['PRs', String(data.prCount)]
  ];
  const tileW = (W - 72 * 2 - 24 * 2) / 3;
  stats.forEach(([label, value], i) => {
    const x = 72 + i * (tileW + 24);
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    roundRect(ctx, x, 320, tileW, 150, 22);
    ctx.fill();
    ctx.fillStyle = 'rgba(245,240,234,.4)';
    ctx.font = "600 24px 'Inter', sans-serif";
    ctx.fillText(label, x + 28, 372);
    ctx.fillStyle = i === 2 && data.prCount > 0 ? '#e8c25a' : CREAM;
    ctx.font = "700 46px 'Space Grotesk', 'Inter', sans-serif";
    ctx.fillText(value, x + 28, 434);
  });

  // exercise list
  let y = 540;
  rows.forEach(exRow => {
    ctx.fillStyle = exRow.isPR ? 'rgba(232,194,90,.09)' : 'rgba(255,255,255,.04)';
    roundRect(ctx, 72, y, W - 144, 60, 16);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.font = "600 28px 'Inter', sans-serif";
    ctx.fillText(truncate(ctx, (exRow.isPR ? '🏆 ' : '') + exRow.name, 560), 96, y + 40);
    ctx.fillStyle = 'rgba(245,240,234,.5)';
    ctx.font = "500 26px 'Inter', sans-serif";
    ctx.textAlign = 'right';
    ctx.fillText(truncate(ctx, exRow.resultText, 340), W - 96, y + 40);
    ctx.textAlign = 'left';
    y += 74;
  });
  if (extra > 0) {
    ctx.fillStyle = 'rgba(245,240,234,.4)';
    ctx.font = "500 26px 'Inter', sans-serif";
    ctx.fillText(`+ ${extra} more`, 96, y + 34);
    y += 60;
  }

  // footer
  ctx.fillStyle = 'rgba(245,240,234,.3)';
  ctx.font = "500 24px 'Inter', sans-serif";
  ctx.fillText('Tracked with Alpha Lifts', 72, H - 52);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

/** Share via the OS sheet where files are supported; otherwise download the PNG. Returns how it
 *  was delivered so the UI can phrase the confirmation. Native goes straight to the Capacitor
 *  share sheet (a WebView's navigator.canShare is unreliable and anchor downloads are dead). */
export async function shareWorkoutCard(data: ShareCardData): Promise<'shared' | 'downloaded' | 'failed'> {
  const blob = await renderShareCard(data);
  if (!blob) return 'failed';
  if (isNative()) {
    const result = await saveOrShareFile({ filename: 'alpha-lifts-workout.png', mime: 'image/png', data: blob });
    return result === 'failed' ? 'failed' : 'shared';
  }
  const file = new File([blob], 'alpha-lifts-workout.png', { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Workout complete' });
      return 'shared';
    } catch {
      // user cancelled the sheet — treat as done, not an error
      return 'shared';
    }
  }
  await saveOrShareFile({ filename: 'alpha-lifts-workout.png', mime: 'image/png', data: blob });
  return 'downloaded';
}
