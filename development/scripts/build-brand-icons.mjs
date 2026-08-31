/**
 * `node development/scripts/build-brand-icons.mjs` — regenerate the full multi-platform icon
 * set under `content/brand/icons/` from `content/brand/logo/tovu-logo.png`.
 *
 * Mirrors the stance of Tovu-Runner's `development/scripts/build-icon.mjs`: this is a
 * repeatable, committed script that a human re-runs when the brand art changes, not a step
 * wired into any build. Its outputs are committed binary artifacts; regenerating them rewrites
 * a few megabytes of PNG/ICO/ICNS for a result that is byte-identical until the source render
 * changes.
 *
 * THE SOURCE IS NOT AN ICON YET. `tovu-logo.png` is a 1254x1254 opaque PNG (`hasAlpha: no`) of
 * an already-rounded dark tile photographed against a near-black backdrop with a soft drop
 * shadow baked in. An app icon needs the opposite: a transparent canvas with the tile as the
 * only opaque object, so each OS can draw its own shadow and its own selection/hover effect.
 * So the tile is located by measurement (never hardcoded — see `measureTile`), a square is cut
 * from inside its bevel, and a fresh rounded-rect mask is applied on a transparent canvas.
 *
 * Two things differ from the Runner script, both because this source's composition differs
 * from Runner's off-center running figure:
 *
 * 1. CENTERING. Runner's figure sits off-center in its own tile (an artifact of its pose), so
 *    Runner centers the crop on the figure's bounding box. This logo's browser-window-frame +
 *    "T" composition is already designed to fill the tile symmetrically, and its one asymmetric
 *    element — a sparkle accent overflowing the frame's bottom-right corner — is a deliberate
 *    flourish, not something a centering algorithm should chase (doing so would drag the whole
 *    composition off-center to accommodate a corner decoration). So the crop here is centered on
 *    the TILE's own measured center, sized to the largest square the safe area allows, with a
 *    fail-loud check that the full artwork (frame + letter + sparkle) still fits inside it.
 *
 * 2. THE SMALL-SIZE CANDIDATE is produced by measured pixel surgery, not a redraw. The gold
 *    pixels split into disconnected components (frame+dots, the "T", the sparkle —
 *    see `findGoldComponents`); the simplified candidate keeps only the letter component and
 *    repaints the rest of the tile's interior color over the frame and sparkle. Same tile, same
 *    colors, nothing invented — see `selectLetterComponent` for the heuristic and its failure
 *    mode.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceFile = path.join(repoRoot, 'content', 'brand', 'logo', 'tovu-logo.png');
const outDir = path.join(repoRoot, 'content', 'brand', 'icons');

function fail(message) {
  process.stderr.write(`build-brand-icons: ${message}\n`);
  process.exit(1);
}
function log(message) {
  process.stdout.write(`  ${message}\n`);
}

/**
 * Apple's macOS Big Sur+ icon grid: a 1024x1024 canvas whose artwork occupies a centered
 * 824x824 rounded square with a corner radius of 185.4. The ~100px margin is not padding to
 * reclaim — it is where the system draws the icon's drop shadow and hover highlight; an icon
 * that fills the canvas reads as oversized next to stock apps. Verified against this source:
 * `tovu-logo.png`'s own tile fits a circular arc of radius ~210 across a ~1010-1027px tile
 * (ratio 0.206), against Apple's 185.4/824 = 0.225 — within ~8%, so a circular-arc mask (not a
 * squircle) is the right primitive here too, and Apple's fixed grid values are used as-is
 * because platform conformance, not native-radius fidelity, is the point of this canvas.
 */
const CANVAS_PX = 1024;
const TILE_PX = 824;
const CORNER_RADIUS = 185.4;

/**
 * How far inside the detected tile edge the crop is allowed to start.
 *
 * Measured directly against this source (not assumed from Runner's render): the tile's bright
 * inner bevel decays from its peak to the interior baseline luminance over 7-8px on every edge
 * checked (left, top, right). Eight pixels clears that band with a little room for antialiasing,
 * matching Runner's constant for a different render for the same underlying reason.
 */
const TILE_SAFE_INSET = 8;

/**
 * Where the search for the tile's edges happens: the outer 18% of the canvas on each side.
 *
 * Verified against this source: all three edge-scanlines (0.4/0.5/0.6 of each axis) agree to
 * 0px spread on every side, and the gold sparkle's bounding box (x up to 1045, inside the 1028
 * start of the right-edge search band) never intersects any of the three scanline rows — the
 * sparkle sits at y:789-1008, all below the lowest scan row (752). Same fraction as Runner's
 * script, empirically confirmed rather than assumed to transfer.
 */
const EDGE_SEARCH_FRACTION = 0.18;

/** The ten images `iconutil` requires; several sizes appear twice under different slot names. */
const ICNS_SLOTS = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const FAVICON_ICO_SIZES = [16, 32, 48];
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const PWA_SIZES = [192, 512];
const COMPARISON_SIZES = [16, 24, 32, 48];

/** Decode to raw RGBA once and hand back sample accessors over it. */
async function loadPixels(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  return {
    width,
    height,
    data,
    channels,
    at: (x, y) => data.subarray((y * width + x) * channels, (y * width + x) * channels + 4),
    luma: (x, y) => {
      const i = (y * width + x) * channels;
      return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    },
  };
}

/**
 * Index of the steepest single-pixel change along `sample` within `[from, to)`.
 * `rising` picks the steepest increase (backdrop -> tile), otherwise the steepest decrease.
 */
function steepestStep(sample, from, to, rising) {
  let bestAt = from;
  let bestDelta = Number.NEGATIVE_INFINITY;
  for (let i = from + 1; i < to; i++) {
    const delta = rising ? sample(i) - sample(i - 1) : sample(i - 1) - sample(i);
    if (delta > bestDelta) {
      bestDelta = delta;
      bestAt = i;
    }
  }
  return bestAt;
}

/** Median of an odd-length sample, used to reject a scanline that happens to graze a corner. */
function median(values) {
  return [...values].sort((a, b) => a - b)[values.length >> 1];
}

/**
 * Locate the render's baked-in tile as `{ x0, y0, x1, y1 }` inclusive.
 *
 * Three scanlines per axis, taken across the middle 20% of the canvas so none of them crosses a
 * rounded corner (where the tile's true edge is legitimately dozens of pixels further in). They
 * must agree to within `tolerance` or the render is not shaped the way this script assumes, and
 * it says so rather than producing a quietly mis-cropped icon.
 */
function measureTile(px, { tolerance = 4 } = {}) {
  const lines = [0.4, 0.5, 0.6];
  const near = Math.round(px.width * EDGE_SEARCH_FRACTION);
  const far = px.width - near;

  const agree = (label, samples) => {
    const spread = Math.max(...samples) - Math.min(...samples);
    if (spread > tolerance) {
      fail(
        `could not agree on the tile's ${label} edge across three scanlines (${samples.join(', ')}; ` +
          `spread ${spread}px > ${tolerance}px). The source is not a rounded tile on a dark backdrop.`,
      );
    }
    return median(samples);
  };

  const rows = lines.map((f) => Math.round(px.height * f));
  const cols = lines.map((f) => Math.round(px.width * f));
  return {
    x0: agree('left', rows.map((y) => steepestStep((x) => px.luma(x, y), 0, near, true))),
    x1: agree('right', rows.map((y) => steepestStep((x) => px.luma(x, y), far, px.width, false) - 1)),
    y0: agree('top', cols.map((x) => steepestStep((y) => px.luma(x, y), 0, near, true))),
    y1: agree('bottom', cols.map((x) => steepestStep((y) => px.luma(x, y), far, px.height, false) - 1)),
  };
}

/** "Gold" is bright and warm: red well above blue, and red at least as high as green. */
function isGold(r, g, b) {
  return r > 90 && r - b > 45 && r >= g && g > b;
}

/** Bounding box of every gold pixel inside `tile`, used only for the fits-inside-crop check. */
function measureFullFigure(px, tile) {
  const box = { x0: px.width, y0: px.height, x1: -1, y1: -1 };
  for (let y = tile.y0; y <= tile.y1; y++) {
    for (let x = tile.x0; x <= tile.x1; x++) {
      const [r, g, b] = px.at(x, y);
      if (isGold(r, g, b)) {
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, y);
        box.x1 = Math.max(box.x1, x);
        box.y1 = Math.max(box.y1, y);
      }
    }
  }
  if (box.x1 < 0) fail('found no gold pixels inside the detected tile.');
  return box;
}

/** Whether (x, y) falls inside `tile`'s inclusive bounds. */
function insideTile(tile, x, y) {
  return x >= tile.x0 && x <= tile.x1 && y >= tile.y0 && y <= tile.y1;
}

/**
 * BFS flood fill of one gold component starting at the seed pixel, marking `label` in place.
 *
 * @complexity O(component area) time and space.
 */
function floodFillComponent(px, tile, label, id, seedX, seedY) {
  const stack = [[seedX, seedY]];
  label[seedY * px.width + seedX] = id;
  const box = { x0: seedX, y0: seedY, x1: seedX, y1: seedY };
  let count = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    count++;
    box.x0 = Math.min(box.x0, cx);
    box.x1 = Math.max(box.x1, cx);
    box.y0 = Math.min(box.y0, cy);
    box.y1 = Math.max(box.y1, cy);
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (!insideTile(tile, nx, ny)) continue;
      const nidx = ny * px.width + nx;
      if (label[nidx] !== -1) continue;
      const [r, g, b] = px.at(nx, ny);
      if (!isGold(r, g, b)) continue;
      label[nidx] = id;
      stack.push([nx, ny]);
    }
  }
  return { count, box };
}

/**
 * Flood-fills the gold pixels inside `tile` into 4-connected components.
 *
 * @complexity O(tile area) time and space — one label per pixel, one BFS pass overall.
 */
function findGoldComponents(px, tile) {
  const label = new Int32Array(px.width * px.height).fill(-1);
  const components = [];
  for (let y = tile.y0; y <= tile.y1; y++) {
    for (let x = tile.x0; x <= tile.x1; x++) {
      const idx = y * px.width + x;
      if (label[idx] !== -1) continue;
      const [r, g, b] = px.at(x, y);
      if (!isGold(r, g, b)) continue;
      const id = components.length;
      const { count, box } = floodFillComponent(px, tile, label, id, x, y);
      components.push({ id, count, box });
    }
  }
  return { label, components };
}

/**
 * Picks the connected gold component that is the letterform, out of a frame/letter/accent
 * composition like this logo's browser-window frame + "T" + sparkle.
 *
 * Heuristic: the single largest component (by pixel count) is assumed to be the frame — an
 * outline stroke, so it has a low bounding-box fill ratio. Among the rest, a solid letterform
 * fills a much larger fraction of its own bounding box than a thin stroke or a sparse accent
 * does, so the remaining component with the highest fill ratio is picked as the letter — but
 * only if it clears the runner-up by a wide enough margin to be unambiguous; ties fail loudly
 * rather than silently guessing.
 */
function selectLetterComponent(components) {
  const bySize = [...components].sort((a, b) => b.count - a.count);
  const [frame, ...rest] = bySize;
  if (!frame || rest.length === 0) {
    fail(`found only ${bySize.length} significant gold component(s); expected a frame plus a separate letter.`);
  }
  const significant = rest.filter((c) => c.count > frame.count * 0.02);
  const fillRatio = (c) => c.count / ((c.box.x1 - c.box.x0 + 1) * (c.box.y1 - c.box.y0 + 1));
  const byFill = [...significant].sort((a, b) => fillRatio(b) - fillRatio(a));
  const [letter, runnerUp] = byFill;
  if (!letter) fail('found a frame component but no candidate letter component beneath it.');
  if (runnerUp && fillRatio(letter) - fillRatio(runnerUp) < 0.1) {
    fail(
      `letter-component fill ratio (${fillRatio(letter).toFixed(2)}) too close to the runner-up ` +
        `(${fillRatio(runnerUp).toFixed(2)}) to pick one reliably.`,
    );
  }
  return letter;
}

/** Average color of a handful of interior tile pixels, used to repaint over removed elements. */
function sampleInteriorColor(px, tile, componentLabel, excludeLabel) {
  const samples = [];
  const midX = Math.round((tile.x0 + tile.x1) / 2);
  const probeYs = [tile.y0 + 40, tile.y1 - 40];
  const probeXs = [tile.x0 + 40, tile.x1 - 40, midX];
  for (const y of probeYs) {
    for (const x of probeXs) {
      const idx = y * px.width + x;
      if (componentLabel[idx] === excludeLabel) continue;
      samples.push(px.at(x, y));
    }
  }
  if (samples.length === 0) fail('could not find a non-gold interior sample to repaint with.');
  const avg = (i) => Math.round(samples.reduce((sum, s) => sum + s[i], 0) / samples.length);
  return { r: avg(0), g: avg(1), b: avg(2) };
}

/**
 * How far the "remove this element" mask is grown past the strictly-gold pixels before
 * repainting, in `buildSimplifiedSource`.
 *
 * Found by visual QA, not assumed: repainting only the strictly-gold pixels of the frame and
 * sparkle left a thin colored ghost outline — the antialiased blend pixels between gold and the
 * black tile are warm-tinted but fall just under the `isGold` threshold, so they survived the
 * first pass untouched and traced the removed shapes at 1-2px width. Growing the removal mask
 * by 3px (4-connected dilation) swallows that halo; the letter component sits ~90px+ away from
 * the frame at its closest, so this radius has no chance of eroding the letter itself.
 */
const GHOST_HALO_RADIUS = 3;

/** Grows `mask` outward by one 4-connected pixel per iteration, `radius` times, within `tile`. */
function dilateMask(mask, tile, width, radius) {
  let current = mask;
  for (let iter = 0; iter < radius; iter++) {
    const next = new Uint8Array(current.length);
    for (let y = tile.y0; y <= tile.y1; y++) {
      for (let x = tile.x0; x <= tile.x1; x++) {
        const idx = y * width + x;
        if (current[idx]) {
          next[idx] = 1;
          continue;
        }
        const touchesMarked = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(
          ([nx, ny]) => insideTile(tile, nx, ny) && current[ny * width + nx],
        );
        next[idx] = touchesMarked ? 1 : 0;
      }
    }
    current = next;
  }
  return current;
}

/**
 * Builds the simplified small-size candidate: the original 1254px canvas with every gold pixel
 * that is NOT part of the letter component — plus a small halo around them (`GHOST_HALO_RADIUS`)
 * to catch antialiasing — repainted with the tile's own interior color. The tile edges, backdrop,
 * and the letter's own pixels are untouched — same tile, same colors, nothing invented.
 */
function buildSimplifiedSource(px, componentLabel, letterId, tile, fillColor) {
  const toRemove = new Uint8Array(px.width * px.height);
  for (let y = tile.y0; y <= tile.y1; y++) {
    for (let x = tile.x0; x <= tile.x1; x++) {
      const idx = y * px.width + x;
      if (componentLabel[idx] !== -1 && componentLabel[idx] !== letterId) toRemove[idx] = 1;
    }
  }
  const mask = dilateMask(toRemove, tile, px.width, GHOST_HALO_RADIUS);

  const out = Buffer.from(px.data);
  for (let y = tile.y0; y <= tile.y1; y++) {
    for (let x = tile.x0; x <= tile.x1; x++) {
      const idx = y * px.width + x;
      if (!mask[idx]) continue;
      const i = idx * px.channels;
      out[i] = fillColor.r;
      out[i + 1] = fillColor.g;
      out[i + 2] = fillColor.b;
    }
  }
  return sharp(out, { raw: { width: px.width, height: px.height, channels: px.channels } }).png().toBuffer();
}

/**
 * The largest square, centered on the tile's own measured center, that fits inside the tile's
 * safe area (inset by `TILE_SAFE_INSET`). Unlike a figure-centered crop, this does not chase an
 * off-center decorative element — see the module doc for why that is correct for this logo.
 */
function centeredTileCrop(tile) {
  const safe = {
    x0: tile.x0 + TILE_SAFE_INSET,
    y0: tile.y0 + TILE_SAFE_INSET,
    x1: tile.x1 - TILE_SAFE_INSET,
    y1: tile.y1 - TILE_SAFE_INSET,
  };
  const cx = (tile.x0 + tile.x1) / 2;
  const cy = (tile.y0 + tile.y1) / 2;
  const size = Math.floor(
    Math.min(2 * Math.min(cx - safe.x0, safe.x1 - cx) + 1, 2 * Math.min(cy - safe.y0, safe.y1 - cy) + 1),
  );
  return { left: Math.round(cx - (size - 1) / 2), top: Math.round(cy - (size - 1) / 2), size };
}

/** Fails loudly if `figure` would be clipped by `crop`, instead of silently shipping a cut logo. */
function assertFigureFitsCrop(figure, crop, label) {
  const x1 = crop.left + crop.size - 1;
  const y1 = crop.top + crop.size - 1;
  if (figure.x0 < crop.left || figure.x1 > x1 || figure.y0 < crop.top || figure.y1 > y1) {
    fail(
      `${label} artwork (${figure.x0},${figure.y0})-(${figure.x1},${figure.y1}) is not fully inside ` +
        `the ${crop.size}px crop at (${crop.left},${crop.top}); it would be clipped.`,
    );
  }
}

/** A white rounded square at `TILE_PX`, used as `dest-in` to punch the tile out of resized artwork. */
function roundedMask() {
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_PX}" height="${TILE_PX}">` +
        `<rect width="${TILE_PX}" height="${TILE_PX}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="#fff"/>` +
        '</svg>',
    ),
  ).png().toBuffer();
}

/** Crop -> resize to `TILE_PX` -> round the corners -> return the standalone rounded tile PNG. */
async function extractRoundedTile(source, crop) {
  return sharp(source)
    .extract({ left: crop.left, top: crop.top, width: crop.size, height: crop.size })
    // `fill` rather than `cover`: the crop is already square, so this only ever rescales.
    .resize(TILE_PX, TILE_PX, { fit: 'fill', kernel: 'lanczos3' })
    .ensureAlpha()
    .composite([{ input: await roundedMask(), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** Centers `art` on a transparent `canvasPx` square — the Apple-grid master used for macOS/PWA/Linux. */
async function composeOnTransparentCanvas(art, canvasPx, tilePx) {
  const margin = Math.round((canvasPx - tilePx) / 2);
  return sharp({ create: { width: canvasPx, height: canvasPx, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, left: margin, top: margin }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Full-bleed, opaque composite for iOS's apple-touch-icon: the rounded tile scaled to fill the
 * entire canvas (no Apple-desktop-grid margin — iOS applies its own corner mask on top) and
 * flattened onto `background` so no alpha reaches the file. A transparent apple-touch-icon is a
 * known iOS bug (older iOS versions render transparency as black instead of the home-screen
 * background), which is why this path exists separately from `composeOnTransparentCanvas`.
 */
async function composeFullBleedOpaque(art, canvasPx, background) {
  const resized = await sharp(art).resize(canvasPx, canvasPx, { kernel: 'lanczos3' }).toBuffer();
  return sharp(resized).flatten({ background }).png().toBuffer();
}

/**
 * Android adaptive/maskable icon: the OS can clip anything outside a centered safe-zone circle
 * whose diameter is 80% of the canvas (stricter than Apple's ~90%-diameter desktop grid — see
 * module doc for why the two must not share a constant). The largest square that stays fully
 * inside that circle has side = 0.8*canvas/sqrt(2); the canvas itself is filled edge-to-edge
 * with the tile's own interior color rather than left transparent, because a maskable icon's
 * background is guaranteed to show through whatever shape the OS masks it into.
 */
async function composeMaskable(art, canvasPx, background) {
  const tileSize = Math.round((0.8 * canvasPx) / Math.SQRT2);
  const margin = Math.round((canvasPx - tileSize) / 2);
  const resized = await sharp(art).resize(tileSize, tileSize, { kernel: 'lanczos3' }).toBuffer();
  return sharp({ create: { width: canvasPx, height: canvasPx, channels: 4, background: { ...background, alpha: 1 } } })
    .composite([{ input: resized, left: margin, top: margin }])
    .png()
    .toBuffer();
}

/**
 * Encodes an ICO container whose frames are PNG-compressed (not legacy BMP DIB) images —
 * supported for every size since Windows Vista, which is every Windows version still relevant
 * today. This avoids hand-rolling a 32bpp BGRA-plus-AND-mask BMP encoder for a format no
 * current target needs, and no `to-ico`/`png-to-ico`-style dependency was available in
 * `node_modules` (verified before writing this), so it is implemented directly here rather than
 * adding one.
 *
 * @complexity O(number of frames); each frame is a plain byte copy.
 */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + 16 * frames.length;
  const entries = [];
  for (const { size, buffer } of frames) {
    const entry = Buffer.alloc(16);
    const dim = size === 256 ? 0 : size; // a byte can't hold 256; 0 means "256" by convention
    entry.writeUInt8(dim, 0);
    entry.writeUInt8(dim, 1);
    entry.writeUInt8(0, 2); // no color palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buffer.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...frames.map((f) => f.buffer)]);
}

/** Resizes `master` (a transparent square PNG) down to each of `sizes`, in parallel. */
async function renderSizes(master, sizes) {
  const buffers = await Promise.all(
    sizes.map((size) => sharp(master).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer()),
  );
  return sizes.map((size, i) => ({ size, buffer: buffers[i] }));
}

/** One magnified, nearest-neighbor swatch of an icon plus its caption, for the comparison sheet. */
async function swatchCell(buffer, caption, cellPx) {
  const zoomed = await sharp(buffer).resize(cellPx, cellPx, { kernel: 'nearest' }).png().toBuffer();
  const canvas = await sharp({
    create: { width: cellPx, height: cellPx + 24, channels: 4, background: { r: 235, g: 235, b: 235, alpha: 1 } },
  })
    .composite([{ input: zoomed, left: 0, top: 0 }])
    .png()
    .toBuffer();
  const label = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cellPx}" height="24">` +
      `<text x="${cellPx / 2}" y="16" font-family="sans-serif" font-size="13" fill="#222" text-anchor="middle">${caption}</text>` +
      '</svg>',
  );
  return sharp(canvas).composite([{ input: label, left: 0, top: cellPx }]).png().toBuffer();
}

/** Builds the full-vs-simplified comparison sheet at the given sizes, one row per variant. */
async function buildComparisonSheet(fullBySize, simplifiedBySize, sizes) {
  const cellPx = 160;
  const gap = 12;
  const rowH = cellPx + 24;
  const cols = sizes.length;
  const width = cols * cellPx + (cols + 1) * gap;
  const height = 2 * rowH + 3 * gap + 30;

  const cells = [];
  for (const [rowIndex, bySize] of [fullBySize, simplifiedBySize].entries()) {
    for (const [col, size] of sizes.entries()) {
      const entry = bySize.find((e) => e.size === size);
      const caption = `${rowIndex === 0 ? 'full logo' : 'simplified'} @ ${size}px`;
      // Sequential composition keeps memory bounded; the sheet is tiny (8 cells).
      const cell = await swatchCell(entry.buffer, caption, cellPx);
      cells.push({ input: cell, left: gap + col * (cellPx + gap), top: 30 + gap + rowIndex * (rowH + gap) });
    }
  }
  const title = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="30">` +
      '<text x="12" y="20" font-family="sans-serif" font-size="16" fill="#111">Tovu icon — full logo vs. simplified candidate</text>' +
      '</svg>',
  );
  return sharp({ create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: title, left: 0, top: 0 }, ...cells])
    .png()
    .toFile(path.join(outDir, 'candidates', 'comparison-sheet.png'));
}

// ---------------------------------------------------------------------------------------------

process.stdout.write('\n\x1b[1m=== build-brand-icons ===\x1b[0m\n');

const meta = await sharp(sourceFile).metadata();
log(`source: ${sourceFile} (${meta.width}x${meta.height}, hasAlpha=${meta.hasAlpha})`);

const px = await loadPixels(sourceFile);
const tile = measureTile(px);
log(`measured tile: ${tile.x1 - tile.x0 + 1}x${tile.y1 - tile.y0 + 1} at (${tile.x0},${tile.y0})-(${tile.x1},${tile.y1})`);

const fullFigure = measureFullFigure(px, tile);
const crop = centeredTileCrop(tile);
log(`crop: ${crop.size}px at (${crop.left},${crop.top}), centered on the tile (not the figure)`);
assertFigureFitsCrop(fullFigure, crop, 'full-logo');

const { label: componentLabel, components } = findGoldComponents(px, tile);
log(`gold components: ${components.length} (sizes: ${components.map((c) => c.count).sort((a, b) => b - a).join(', ')})`);
const letter = selectLetterComponent(components);
log(`letter component: id=${letter.id} count=${letter.count} box=(${letter.box.x0},${letter.box.y0})-(${letter.box.x1},${letter.box.y1})`);
const fillColor = sampleInteriorColor(px, tile, componentLabel, letter.id);
log(`interior repaint color: rgb(${fillColor.r},${fillColor.g},${fillColor.b})`);

const simplifiedSourceBuffer = await buildSimplifiedSource(px, componentLabel, letter.id, tile, fillColor);
assertFigureFitsCrop(letter.box, crop, 'simplified');

mkdirSync(path.join(outDir, 'master'), { recursive: true });
mkdirSync(path.join(outDir, 'macos', 'icon.iconset'), { recursive: true });
mkdirSync(path.join(outDir, 'windows'), { recursive: true });
mkdirSync(path.join(outDir, 'linux'), { recursive: true });
mkdirSync(path.join(outDir, 'web'), { recursive: true });
mkdirSync(path.join(outDir, 'pwa'), { recursive: true });
mkdirSync(path.join(outDir, 'candidates'), { recursive: true });

const fullTile = await extractRoundedTile(sourceFile, crop);
const simplifiedTile = await extractRoundedTile(simplifiedSourceBuffer, crop);

const fullMaster = await composeOnTransparentCanvas(fullTile, CANVAS_PX, TILE_PX);
const simplifiedMaster = await composeOnTransparentCanvas(simplifiedTile, CANVAS_PX, TILE_PX);
writeFileSync(path.join(outDir, 'master', 'logo-1024.png'), fullMaster);
writeFileSync(path.join(outDir, 'master', 'logo-simplified-1024.png'), simplifiedMaster);
log(`wrote master/logo-1024.png and master/logo-simplified-1024.png (${CANVAS_PX}x${CANVAS_PX}, transparent)`);

// --- macOS .icns --------------------------------------------------------------------------
for (const [slot, size] of ICNS_SLOTS) {
  // Fixed 10-item list; sequential keeps iconutil's input directory deterministic.
  await sharp(fullMaster).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(path.join(outDir, 'macos', 'icon.iconset', slot));
}
if (process.platform === 'darwin') {
  execFileSync('iconutil', ['-c', 'icns', path.join(outDir, 'macos', 'icon.iconset'), '-o', path.join(outDir, 'macos', 'icon.icns')]);
  log(`wrote macos/icon.icns from ${ICNS_SLOTS.length} iconset slots`);
} else {
  log('skipped icon.icns: iconutil is macOS-only (iconset PNGs were still written)');
}

// --- Windows .ico --------------------------------------------------------------------------
const icoFrames = await renderSizes(fullMaster, ICO_SIZES);
writeFileSync(path.join(outDir, 'windows', 'icon.ico'), buildIco(icoFrames));
log(`wrote windows/icon.ico (sizes: ${ICO_SIZES.join(', ')})`);

// --- Linux PNG set -------------------------------------------------------------------------
const linuxFrames = await renderSizes(fullMaster, LINUX_SIZES);
await Promise.all(linuxFrames.map(({ size, buffer }) => sharp(buffer).toFile(path.join(outDir, 'linux', `icon-${size}.png`))));
log(`wrote linux/icon-{${LINUX_SIZES.join(',')}}.png`);

// --- Web: favicon.ico + apple-touch-icon.png ------------------------------------------------
const faviconFrames = await renderSizes(fullMaster, FAVICON_ICO_SIZES);
writeFileSync(path.join(outDir, 'web', 'favicon.ico'), buildIco(faviconFrames));
const appleTouchIcon = await composeFullBleedOpaque(fullTile, 180, { r: 255, g: 255, b: 255 });
writeFileSync(path.join(outDir, 'web', 'apple-touch-icon.png'), appleTouchIcon);
log(`wrote web/favicon.ico (${FAVICON_ICO_SIZES.join('/')}) and web/apple-touch-icon.png (180, opaque white flatten)`);

// --- PWA: any + maskable ---------------------------------------------------------------------
const pwaFrames = await renderSizes(fullMaster, PWA_SIZES);
await Promise.all(pwaFrames.map(({ size, buffer }) => sharp(buffer).toFile(path.join(outDir, 'pwa', `icon-${size}.png`))));
for (const size of PWA_SIZES) {
  // Two sizes only; each depends on the shared fullTile input.
  const maskable = await composeMaskable(fullTile, size, fillColor);
  writeFileSync(path.join(outDir, 'pwa', `maskable-icon-${size}.png`), maskable);
}
log(`wrote pwa/icon-{${PWA_SIZES.join(',')}}.png and pwa/maskable-icon-{${PWA_SIZES.join(',')}}.png`);

// --- Small-size legibility candidate + comparison sheet ---------------------------------------
const simplifiedFrames = await renderSizes(simplifiedMaster, COMPARISON_SIZES);
await Promise.all(simplifiedFrames.map(({ size, buffer }) => sharp(buffer).toFile(path.join(outDir, 'candidates', `simplified-${size}.png`))));
const fullComparisonFrames = LINUX_SIZES.includes(16) ? await renderSizes(fullMaster, COMPARISON_SIZES) : [];
await buildComparisonSheet(fullComparisonFrames, simplifiedFrames, COMPARISON_SIZES);
log(`wrote candidates/simplified-{${COMPARISON_SIZES.join(',')}}.png and candidates/comparison-sheet.png`);

process.stdout.write('  done.\n\n');
