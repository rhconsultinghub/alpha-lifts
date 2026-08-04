// Generates the per-muscle shading masks (public/muscle-masks/*.png) from the body reference
// art itself (public/body-front.png / body-back.png). Run after any change to those images:
//
//   npm install --no-save sharp
//   node scripts/make-muscle-masks.mjs            # writes masks + .verify/ debug composites
//   node scripts/make-muscle-masks.mjs --view front
//
// How it works: the art is white line-drawn muscle compartments on near-black. We threshold
// into line vs interior pixels, connected-component label the interiors (each closed
// compartment = one component), and assign each component to a muscle by majority overlap
// with the hand-traced hint polygons below (migrated from BodyDiagram.tsx — they only need
// to be ~90% right; the mask edges come from the artwork's own lines, which is the whole
// point: a fill can no longer cross a drawn line because the mask stops at it).
// Ambiguous/unassigned components are printed in the report; fix them with `seeds`
// (force-assign the component containing a point) or `patchLines` (draw a short segment into
// the line mask to seal a gap in the art) rather than by editing the hint polygons.
//
// Masks are emitted as grey+alpha PNGs (alpha carries the mask — CSS mask-mode defaults to
// alpha for raster images) at the source image's native dimensions, so the runtime's
// `mask-size: contain` letterboxes identically to the <img>'s objectFit: contain.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Hint polygons — migrated verbatim from BodyDiagram.tsx (phase-21/32 traces).
// Assignment hints only: each closed compartment in the art is assigned to the
// muscle whose polygon covers most of it. Left side only; mirrored: true adds
// the right-side copy around the image centerline.
// ---------------------------------------------------------------------------
const FRONT_DEFS = [
  { muscle: 'Shoulders', mirrored: true, d: 'M118,157 Q100,165 91,190 Q85,218 92,242 Q99,254 108,256 Q121,248 132,232 Q140,204 150,172 Q135,155 118,157 Z' },
  { muscle: 'Chest', mirrored: true, d: 'M235,176 Q192,168 156,172 Q136,204 139,234 Q147,262 176,272 Q212,277 235,271 Z' },
  { muscle: 'Biceps', mirrored: true, d: 'M102,252 Q119,255 124,274 Q128,306 120,338 Q114,354 104,360 Q93,352 88,330 Q84,296 90,264 Q95,253 102,252 Z' },
  { muscle: 'Forearms', mirrored: true, d: 'M63,357 Q94,349 98,362 Q91,406 76,440 Q66,461 56,467 Q46,460 44,437 Q49,392 63,357 Z' },
  { muscle: 'Core', mirrored: false, d: 'M173,277 Q241,286 309,277 Q317,330 307,380 Q288,436 241,458 Q194,436 175,380 Q165,330 173,277 Z' },
  { muscle: 'Quads', mirrored: true, d: 'M158,412 Q142,440 138,500 Q136,570 146,625 Q152,662 168,675 Q186,679 197,658 Q207,625 209,565 Q210,510 200,472 Q185,435 158,412 Z' },
  { muscle: 'Calves', mirrored: true, d: 'M165,694 Q189,687 204,697 Q214,731 208,771 Q200,798 184,804 Q167,796 159,761 Q153,724 165,694 Z' },
];

const BACK_DEFS = [
  { muscle: 'Rear Delts', mirrored: true, d: 'M116,160 Q98,168 92,194 Q88,222 96,248 Q104,266 114,272 Q126,260 136,232 Q144,200 152,168 Q134,154 116,160 Z' },
  { muscle: 'Back', mirrored: false, d: 'M235,70 Q205,92 158,164 Q192,180 216,220 Q231,262 235,338 Q239,262 254,220 Q278,180 312,164 Q265,92 235,70 Z' },
  { muscle: 'Back', mirrored: true, d: 'M146,258 Q170,238 190,236 Q212,250 222,290 Q228,340 227,394 Q204,410 182,403 Q159,384 152,338 Q147,296 146,258 Z' },
  { muscle: 'Back', mirrored: false, d: 'M220,300 Q214,350 219,396 Q227,410 235,408 Q243,410 251,396 Q256,350 250,300 Q235,290 220,300 Z' },
  { muscle: 'Triceps', mirrored: true, d: 'M103,264 Q122,272 126,295 Q126,324 116,346 Q106,359 95,362 Q81,353 76,328 Q74,300 84,275 Q93,262 103,264 Z' },
  { muscle: 'Forearms', mirrored: true, d: 'M57,358 Q87,350 93,364 Q88,410 74,443 Q63,465 52,470 Q42,463 40,440 Q44,396 57,358 Z' },
  { muscle: 'Glutes', mirrored: true, d: 'M183,414 Q161,420 154,458 Q151,502 165,528 Q182,542 202,536 Q220,528 227,499 Q230,462 221,432 Q206,410 183,414 Z' },
  { muscle: 'Hamstrings', mirrored: true, d: 'M150,546 Q172,536 200,545 Q209,578 206,622 Q200,664 178,676 Q156,664 146,626 Q140,584 150,546 Z' },
  { muscle: 'Calves', mirrored: true, d: 'M145,702 Q170,689 189,701 Q198,742 194,786 Q187,813 170,818 Q150,809 141,774 Q136,734 145,702 Z' },
];

function mirrorPath(d, width) {
  return d.replace(/([MLQ])\s*([^MLQZ]+)/gi, (_m, cmd, coords) => {
    const nums = coords.trim().split(/[\s,]+/).map(Number);
    const out = [];
    for (let i = 0; i < nums.length; i += 2) out.push((width - nums[i]).toFixed(0) + ',' + nums[i + 1]);
    return cmd + out.join(' ');
  });
}

// ---------------------------------------------------------------------------
// Per-view config. `seeds` force-assign the component containing a point
// (muscle: null force-unassigns); `patchLines` draw 2px segments into the line
// mask to seal gaps in the drawn art. Both are the intended fix for anything
// the report flags — tune these, not the hint polygons.
// ---------------------------------------------------------------------------
const VIEWS = {
  front: {
    file: 'public/body-front.png',
    threshold: 56,
    patchLines: [
      { from: [220, 197], to: [262, 197] },   // sternal notch: seal neck V off the chest/sternum strip
      { from: [54, 356], to: [102, 356] },    // L outer elbow: biceps compartment leaks down the brachioradialis strip
      { from: [380, 356], to: [428, 356] },   // R mirror
      { from: [22, 470], to: [84, 444] },     // L wrist: forearm compartments run into the hand; diagonal follows the drawn wrist band
      { from: [398, 444], to: [460, 470] },   // R mirror
      { from: [128, 694], to: [218, 694] },   // L knee: central thigh mass runs through the knee into the shin
      { from: [264, 694], to: [354, 694] },   // R mirror
      { from: [148, 808], to: [218, 808] },   // L ankle: shin muscle mass runs down into the ankle/tendon area
      { from: [264, 808], to: [334, 808] },   // R mirror
    ],
    seeds: [
      // tibialis/peroneal strips + shin mass, plus the taper compartments above/below the knee
      // and ankle cuts so the shading ends on drawn contours rather than the flat cut lines,
      // plus the outer-shin sliver
      { muscle: 'Calves', points: [
        [192, 691], [288, 690], [189, 801], [291, 800], [170, 750], [311, 750],
        [148, 754], [332, 754], [194, 684], [286, 684], [156, 675], [324, 675],
        [188, 702], [294, 702], [170, 843], [310, 842], [191, 818], [288, 819], [188, 837], [292, 836],
      ] },
      // upper forearm strips + brachioradialis origin above the elbow + medial pronator/flexor
      // origin block + small edge slivers + strip tips near the wrist
      { muscle: 'Forearms', points: [
        [94, 396], [385, 394], [78, 343], [403, 343],
        // NOTE: no right-side twin for [93,362] — the art is asymmetric there and the mirror
        // point lands inside the biceps compartment (a seed would steal the whole biceps)
        [55, 423], [426, 425], [93, 362],
        [86, 436], [395, 438], [81, 433], [401, 433],
      ] },
      // vastus medialis inner strips + the adductor strips of the inner thigh — the app has no
      // Adductors group; squats/lunges load them, so Quads is their honest home
      { muscle: 'Quads', points: [[206, 489], [275, 488], [215, 523], [266, 523], [225, 551], [256, 551]] },
      // serratus digitations / outer-lower pec edge slivers
      { muscle: 'Chest', points: [[150, 277], [330, 278], [161, 272], [319, 272], [162, 289], [319, 289], [161, 305], [321, 305]] },
      // inguinal/hip-flexor pockets between the abs V and the quad tops
      { muscle: 'Core', points: [[180, 394], [301, 394]] },
    ],
    defs: FRONT_DEFS,
    muscles: ['Shoulders', 'Chest', 'Biceps', 'Forearms', 'Core', 'Quads', 'Calves'],
  },
  back: {
    file: 'public/body-back.png',
    threshold: 56,
    patchLines: [
      // The art has no closed skull-base line — the skull interior flows into the neck across its
      // full width and around the ears into the trap slopes, so a full-width cut is the only seal.
      { from: [0, 148], to: [469, 148] },
      { from: [152, 398], to: [178, 418] },   // L iliac crest: low-back band wraps around the glute onto the hip
      { from: [292, 418], to: [318, 398] },   // R mirror
      { from: [18, 474], to: [82, 448] },     // L wrist: forearm compartments run into the hand; diagonal follows the drawn wrist band
      { from: [388, 448], to: [452, 474] },   // R mirror
      { from: [58, 362], to: [98, 362] },     // L outer elbow: outer arm strip spans triceps → forearm across the joint
      { from: [372, 362], to: [412, 362] },   // R mirror
      { from: [296, 558], to: [338, 558] },   // R gluteal fold: glute-edge band is fused to the hamstring (left side is naturally separate)
    ],
    seeds: [
      { muscle: 'Hamstrings', points: [[290, 590]] },                    // R lateral hamstring, 48% vs the 50% bar
      // brachioradialis origin slivers above the elbow + the olecranon/anconeus notch below it
      { muscle: 'Forearms', points: [[66, 348], [404, 346], [99, 380], [371, 380], [99, 399], [371, 399]] },
      // scapula pockets (infraspinatus/teres/supraspinatus) + lat bottom tips — Back in this app's taxonomy
      { muscle: 'Back', points: [[168, 229], [292, 221], [319, 220], [316, 245], [216, 383], [168, 387], [303, 387], [176, 183], [296, 183], [292, 190]] },
      { muscle: 'Rear Delts', points: [[119, 259], [352, 259]] },        // armpit pocket below the delt cap (symmetric w/ auto-assigned R side)
      // glute medius / lateral hip bands hugging the glute domes, plus the small trochanter pockets
      // (the bands are crescents — their centroids fall inside the glute dome, so use edge points)
      { muscle: 'Glutes', points: [[143, 460], [327, 460], [139, 491], [330, 492]] },
      // adductor magnus wedge below the glute fold — hip-hinge muscle, Hamstrings is its home here
      { muscle: 'Hamstrings', points: [[217, 561], [251, 559]] },
    ],
    defs: BACK_DEFS,
    muscles: ['Back', 'Rear Delts', 'Triceps', 'Forearms', 'Glutes', 'Hamstrings', 'Calves'],
  },
};

const slug = (m) => m.toLowerCase().replace(/\s+/g, '-');

const DEBUG_COLORS = {
  Shoulders: [255, 99, 71], Chest: [65, 105, 225], Biceps: [50, 205, 50], Forearms: [255, 215, 0],
  Core: [186, 85, 211], Quads: [0, 206, 209], Calves: [255, 140, 0],
  Back: [65, 105, 225], 'Rear Delts': [255, 99, 71], Triceps: [50, 205, 50],
  Glutes: [186, 85, 211], Hamstrings: [0, 206, 209],
};

function drawLine(lineMask, w, h, [x0, y0], [x1, y1]) {
  // 2px-thick Bresenham segment stamped into the line mask
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    for (let oy = 0; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) {
      const px = x + ox, py = y + oy;
      if (px >= 0 && px < w && py >= 0 && py < h) lineMask[py * w + px] = 1;
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

async function rasterizeHints(defs, muscles, w, h) {
  const polyMasks = {};
  for (const muscle of muscles) {
    const ds = [];
    for (const def of defs) {
      if (def.muscle !== muscle) continue;
      ds.push(def.d);
      if (def.mirrored) ds.push(mirrorPath(def.d, w));
    }
    const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/><path d="${ds.join(' ')}" fill="white"/></svg>`;
    const raw = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer();
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = raw[i] > 127 ? 1 : 0;
    polyMasks[muscle] = mask;
  }
  return polyMasks;
}

async function processView(viewName, cfg) {
  const { data, info } = await sharp(join(ROOT, cfg.file)).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, N = w * h;
  console.log(`\n=== ${viewName} (${w}x${h}, threshold ${cfg.threshold}) ===`);

  // 1. line mask
  const line = new Uint8Array(N);
  for (let i = 0; i < N; i++) line[i] = data[i] >= cfg.threshold ? 1 : 0;
  for (const p of cfg.patchLines) drawLine(line, w, h, p.from, p.to);

  // 2. connected components on interior (non-line) pixels, 4-connectivity
  const labels = new Int32Array(N); // 0 = unlabeled/line
  let nextLabel = 0;
  const stack = new Int32Array(N);
  const compSize = [0]; // index by label
  for (let i = 0; i < N; i++) {
    if (line[i] || labels[i]) continue;
    const label = ++nextLabel;
    let size = 0, top = 0;
    stack[top++] = i;
    labels[i] = label;
    while (top > 0) {
      const p = stack[--top];
      size++;
      const x = p % w;
      if (x > 0 && !line[p - 1] && !labels[p - 1]) { labels[p - 1] = label; stack[top++] = p - 1; }
      if (x < w - 1 && !line[p + 1] && !labels[p + 1]) { labels[p + 1] = label; stack[top++] = p + 1; }
      if (p >= w && !line[p - w] && !labels[p - w]) { labels[p - w] = label; stack[top++] = p - w; }
      if (p < N - w && !line[p + w] && !labels[p + w]) { labels[p + w] = label; stack[top++] = p + w; }
    }
    compSize[label] = size;
  }

  // 3. background = any component touching the image border
  const background = new Set();
  for (let x = 0; x < w; x++) {
    if (labels[x]) background.add(labels[x]);
    if (labels[(h - 1) * w + x]) background.add(labels[(h - 1) * w + x]);
  }
  for (let y = 0; y < h; y++) {
    if (labels[y * w]) background.add(labels[y * w]);
    if (labels[y * w + w - 1]) background.add(labels[y * w + w - 1]);
  }

  // 4. rasterize hint polygons + accumulate per-component overlap counts
  const polyMasks = await rasterizeHints(cfg.defs, cfg.muscles, w, h);
  const nm = cfg.muscles.length;
  const counts = new Uint32Array((nextLabel + 1) * nm);
  const sumX = new Float64Array(nextLabel + 1), sumY = new Float64Array(nextLabel + 1);
  for (let i = 0; i < N; i++) {
    const label = labels[i];
    if (!label || background.has(label)) continue;
    sumX[label] += i % w; sumY[label] += (i / w) | 0;
    for (let m = 0; m < nm; m++) if (polyMasks[cfg.muscles[m]][i]) counts[label * nm + m]++;
  }

  // 5. assign
  const assignment = new Int32Array(nextLabel + 1).fill(-1);
  for (let label = 1; label <= nextLabel; label++) {
    if (background.has(label) || !compSize[label]) continue;
    let best = -1, bestC = 0, second = -1, secondC = 0;
    for (let m = 0; m < nm; m++) {
      const c = counts[label * nm + m];
      if (c > bestC) { second = best; secondC = bestC; best = m; bestC = c; }
      else if (c > secondC) { second = m; secondC = c; }
    }
    const frac = bestC / compSize[label];
    if (best >= 0 && frac >= 0.5) assignment[label] = best;
    // report rows for anything notable
    if (compSize[label] >= 100) {
      const cx = Math.round(sumX[label] / compSize[label]), cy = Math.round(sumY[label] / compSize[label]);
      const bestName = best >= 0 ? cfg.muscles[best] : '(none)';
      const secondFrac = secondC / compSize[label];
      const flags = [];
      if (frac < 0.5) flags.push('UNASSIGNED');
      if (secondFrac >= 0.2) flags.push(`AMBIGUOUS(runner-up ${second >= 0 ? cfg.muscles[second] : '?'} ${(secondFrac * 100).toFixed(0)}%)`);
      if (flags.length) {
        console.log(`  comp ${label}: ${compSize[label]}px centroid (${cx},${cy}) best ${bestName} ${(frac * 100).toFixed(0)}%  ${flags.join(' ')}`);
      }
    }
  }

  // 6. seeds override
  for (const seed of cfg.seeds) {
    const mIdx = seed.muscle === null ? -1 : cfg.muscles.indexOf(seed.muscle);
    if (seed.muscle !== null && mIdx < 0) throw new Error(`seed muscle ${seed.muscle} not in ${viewName} view`);
    for (const [x, y] of seed.points) {
      const label = labels[y * w + x];
      if (!label) { console.log(`  WARN seed (${x},${y}) landed on a line pixel — no-op`); continue; }
      if (background.has(label)) { console.log(`  WARN seed (${x},${y}) is background — refusing`); continue; }
      assignment[label] = mIdx;
    }
  }

  // 7. per-muscle area sanity vs hint area
  const assignedArea = new Uint32Array(nm);
  for (let label = 1; label <= nextLabel; label++) if (assignment[label] >= 0) assignedArea[assignment[label]] += compSize[label];
  for (let m = 0; m < nm; m++) {
    let hintArea = 0;
    const pm = polyMasks[cfg.muscles[m]];
    for (let i = 0; i < N; i++) hintArea += pm[i];
    const ratio = hintArea ? assignedArea[m] / hintArea : 0;
    const flag = ratio > 1.4 ? '  <-- CHECK (swallowed a neighbor?)' : ratio < 0.5 ? '  <-- CHECK (mostly missing?)' : '';
    console.log(`  ${cfg.muscles[m]}: assigned ${assignedArea[m]}px vs hint ${hintArea}px (x${ratio.toFixed(2)})${flag}`);
  }

  // 8. emit masks: per muscle, union of assigned components, dilated 1px clipped to own∪line
  mkdirSync(join(ROOT, 'public', 'muscle-masks'), { recursive: true });
  mkdirSync(join(ROOT, '.verify'), { recursive: true });
  const perMuscle = {};
  for (let m = 0; m < nm; m++) {
    const own = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const l = labels[i]; if (l && assignment[l] === m) own[i] = 1; }
    // 1px 8-conn dilation, only onto line pixels (never into a neighbor's interior or background)
    const out = new Uint8Array(own);
    for (let i = 0; i < N; i++) {
      if (own[i] || !line[i]) continue;
      const x = i % w, y = (i / w) | 0;
      let hit = 0;
      for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && own[ny * w + nx]) { hit = 1; break; }
      }
      if (hit) out[i] = 1;
    }
    perMuscle[cfg.muscles[m]] = out;
    const ga = Buffer.alloc(N * 2);
    for (let i = 0; i < N; i++) { if (out[i]) { ga[i * 2] = 255; ga[i * 2 + 1] = 255; } }
    const file = join(ROOT, 'public', 'muscle-masks', `${viewName}-${slug(cfg.muscles[m])}.png`);
    await sharp(ga, { raw: { width: w, height: h, channels: 2 } }).png({ compressionLevel: 9 }).toFile(file);
  }

  // 9. debug composite: all masks tinted distinct colors over the source art
  const overlay = Buffer.alloc(N * 4);
  for (let m = 0; m < nm; m++) {
    const [r, g, b] = DEBUG_COLORS[cfg.muscles[m]];
    const mask = perMuscle[cfg.muscles[m]];
    for (let i = 0; i < N; i++) {
      if (!mask[i]) continue;
      overlay[i * 4] = r; overlay[i * 4 + 1] = g; overlay[i * 4 + 2] = b; overlay[i * 4 + 3] = 115;
    }
  }
  const overlayPng = await sharp(overlay, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  await sharp(join(ROOT, cfg.file)).composite([{ input: overlayPng }]).png()
    .toFile(join(ROOT, '.verify', `${viewName}-composite.png`));
  console.log(`  wrote ${nm} masks + .verify/${viewName}-composite.png`);
}

const only = process.argv.includes('--view') ? process.argv[process.argv.indexOf('--view') + 1] : null;
for (const [name, cfg] of Object.entries(VIEWS)) {
  if (only && name !== only) continue;
  await processView(name, cfg);
}
