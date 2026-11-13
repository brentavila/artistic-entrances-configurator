/**
 * Door photo recoloring for the designer preview.
 *
 * Pure and DOM free on purpose: no imports and only erasable TypeScript, so
 * Node can import this file directly (build scripts, contact sheets) and the
 * browser can run it on canvas pixels.
 *
 * analyzeDoor() crops a catalog photo to the door unit and splits every pixel
 * into background, iron and glass (with soft coverage where they meet).
 * renderDoor() repaints the iron in a finish and the glass in a glass type.
 */

export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

export type CropBox = { x: number; y: number; width: number; height: number };

export type DoorScene = "studio" | "exterior";

export type GlassInput = { id: string; texture?: Rgba | null } | null;

export type FinishInput = { hex: string; textureMean?: [number, number, number] | null } | null;

export type RenderOptions = {
  glass: GlassInput;
  finish: FinishInput;
  scene?: DoorScene;
};

export type IronStats = {
  /** Median luminance of the frame iron, 0 to 255. */
  median: number;
  /** 10th and 90th percentile luminance of all iron pixels. */
  low: number;
  high: number;
  /** Average photo color of the frame iron. */
  color: [number, number, number];
};

export type DoorAnalysis = {
  /** Size of the source photo. */
  sourceWidth: number;
  sourceHeight: number;
  /** Door unit inside the source photo. Every other array is in crop space. */
  box: CropBox;
  width: number;
  height: number;
  /** Cropped photo, RGBA. */
  pixels: Uint8ClampedArray;
  /** Door unit coverage, 0 = studio background (transparent), 255 = door. */
  coverage: Uint8Array;
  /** Glass coverage, 0 = iron, 255 = glass, in between along edges. */
  glass: Uint8Array;
  /** Iron color behind each pixel (RGB). Equals the photo away from glass edges. */
  ironRgb: Uint8ClampedArray;
  /** Glass color behind each pixel (RGB). Equals the photo away from iron edges. */
  glassRgb: Uint8ClampedArray;
  /** True when the glass was found reliably enough to repaint it. */
  hasGlass: boolean;
  /** Share of the door unit covered by glass, 0 to 1. */
  glassShare: number;
  /** Why hasGlass is false ("" when it is true). */
  reason: string;
  iron: IronStats;
  /** How much of the finish each pixel takes, 0 to 255. */
  finishWeight: Uint8Array;
  /** False when the iron could not be told apart well enough to recolor. */
  finishable: boolean;
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Histogram percentile for 0..255 values. */
function histPercentile(hist: Uint32Array, total: number, p: number) {
  if (total === 0) return 0;
  const target = total * p;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) {
    sum += hist[i];
    if (sum >= target) return i;
  }
  return 255;
}

export function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return [20, 20, 20];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/* ------------------------------------------------------------------ */
/* Analysis                                                             */
/* ------------------------------------------------------------------ */

const STUDIO_MIN = 214;
const STUDIO_CHROMA = 28;

function studioPixel(data: Uint8ClampedArray, index: number) {
  if (data[index + 3] < 20) return true;
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  return max > STUDIO_MIN && max - min < STUDIO_CHROMA;
}

/**
 * Crops the photo to the door unit and classifies every pixel. Returns null
 * when the photo is not a door on a studio white background.
 */
export function analyzeDoor(image: Rgba): DoorAnalysis | null {
  const { data, width: W, height: H } = image;
  if (W < 32 || H < 32 || data.length < W * H * 4) return null;
  const N = W * H;

  // 1. Studio background: white pixels reachable from the photo border.
  let borderWhite = 0;
  let borderTotal = 0;
  for (let x = 0; x < W; x += 1) {
    borderTotal += 2;
    if (studioPixel(data, x * 4)) borderWhite += 1;
    if (studioPixel(data, ((H - 1) * W + x) * 4)) borderWhite += 1;
  }
  for (let y = 0; y < H; y += 1) {
    borderTotal += 2;
    if (studioPixel(data, y * W * 4)) borderWhite += 1;
    if (studioPixel(data, (y * W + W - 1) * 4)) borderWhite += 1;
  }
  if (borderWhite / borderTotal < 0.6) return null;

  const outside = new Uint8Array(N);
  const stack = new Int32Array(N);
  let top = 0;
  const seed = (pixel: number) => {
    if (outside[pixel] || !studioPixel(data, pixel * 4)) return;
    outside[pixel] = 1;
    stack[top++] = pixel;
  };
  for (let x = 0; x < W; x += 1) {
    seed(x);
    seed((H - 1) * W + x);
  }
  for (let y = 0; y < H; y += 1) {
    seed(y * W);
    seed(y * W + W - 1);
  }
  while (top > 0) {
    const pixel = stack[--top];
    const x = pixel % W;
    if (x > 0) seed(pixel - 1);
    if (x < W - 1) seed(pixel + 1);
    if (pixel >= W) seed(pixel - W);
    if (pixel < N - W) seed(pixel + W);
  }

  // 2. Keep the door unit: the largest non-background component plus any
  //    sizable pieces of it. Dust and watermark specks become background.
  const label = new Int32Array(N);
  const areas: number[] = [0];
  let next = 1;
  for (let start = 0; start < N; start += 1) {
    if (outside[start] || label[start]) continue;
    const id = next;
    next += 1;
    let area = 0;
    label[start] = id;
    stack[0] = start;
    top = 1;
    while (top > 0) {
      const pixel = stack[--top];
      area += 1;
      const x = pixel % W;
      const y = (pixel - x) / W;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          const neighbor = ny * W + nx;
          if (outside[neighbor] || label[neighbor]) continue;
          label[neighbor] = id;
          stack[top++] = neighbor;
        }
      }
    }
    areas.push(area);
  }
  let largest = 0;
  for (let id = 1; id < areas.length; id += 1) largest = Math.max(largest, areas[id]);
  if (largest < N * 0.04) return null;
  const keep = new Uint8Array(areas.length);
  for (let id = 1; id < areas.length; id += 1) {
    keep[id] = areas[id] >= largest * 0.02 ? 1 : 0;
  }

  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let pixel = 0; pixel < N; pixel += 1) {
    if (outside[pixel]) continue;
    if (!keep[label[pixel]]) {
      outside[pixel] = 1;
      continue;
    }
    const x = pixel % W;
    const y = (pixel - x) / W;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(W - 1, maxX + 1);
  maxY = Math.min(H - 1, maxY + 1);
  const box = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  if (box.width < W * 0.15 || box.height < H * 0.3) return null;

  // 3. Work in crop space from here on.
  const w = box.width;
  const h = box.height;
  const n = w * h;
  const pixels = new Uint8ClampedArray(n * 4);
  const lum = new Float32Array(n);
  const chroma = new Uint8Array(n);
  const door = new Uint8Array(n);
  for (let y = 0; y < h; y += 1) {
    const sourceRow = (y + box.y) * W + box.x;
    for (let x = 0; x < w; x += 1) {
      const s = (sourceRow + x) * 4;
      const p = y * w + x;
      const r = data[s];
      const g = data[s + 1];
      const b = data[s + 2];
      pixels[p * 4] = r;
      pixels[p * 4 + 1] = g;
      pixels[p * 4 + 2] = b;
      pixels[p * 4 + 3] = 255;
      lum[p] = luma(r, g, b);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      chroma[p] = max - min;
      door[p] = outside[sourceRow + x] ? 0 : 1;
    }
  }

  // Distance (in pixels, 4-connected) from the background into the door.
  const depth = new Uint8Array(n).fill(255);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let p = 0; p < n; p += 1) {
    if (!door[p]) {
      depth[p] = 0;
      queue[tail++] = p;
    } else {
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        depth[p] = 1;
        queue[tail++] = p;
      }
    }
  }
  while (head < tail) {
    const p = queue[head++];
    const d = depth[p];
    if (d >= 40) continue;
    const x = p % w;
    const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
    for (const q of neighbors) {
      if (q < 0 || q >= n || depth[q] <= d + 1) continue;
      depth[q] = d + 1;
      queue[tail++] = q;
    }
  }

  // 4. Iron reference from the outer frame band, which is always metal.
  const frameDepth = Math.max(3, Math.round(Math.min(w, h) * 0.006));
  const frameEnd = Math.max(frameDepth + 3, Math.round(Math.min(w, h) * 0.018));
  const frameHist = new Uint32Array(256);
  let frameCount = 0;
  let frameR = 0;
  let frameG = 0;
  let frameB = 0;
  for (let p = 0; p < n; p += 1) {
    if (!door[p] || depth[p] < frameDepth || depth[p] > frameEnd) continue;
    frameHist[Math.round(lum[p])] += 1;
    frameCount += 1;
    frameR += pixels[p * 4];
    frameG += pixels[p * 4 + 1];
    frameB += pixels[p * 4 + 2];
  }
  if (frameCount < 50) return null;
  const ironMedian = histPercentile(frameHist, frameCount, 0.5);
  const ironHigh = histPercentile(frameHist, frameCount, 0.9);
  const ironColor: [number, number, number] = [
    Math.round(frameR / frameCount),
    Math.round(frameG / frameCount),
    Math.round(frameB / frameCount),
  ];

  // 5. Glass seeds: bright, colorless areas inside the unit, voted to drop
  //    specks and highlights.
  const seedLevel = Math.max(178, ironHigh + 0.45 * (255 - ironHigh));
  const raw = new Uint8Array(n);
  for (let p = 0; p < n; p += 1) {
    raw[p] = door[p] && depth[p] > 2 && lum[p] > seedLevel && chroma[p] < 36 ? 1 : 0;
  }
  const seeds = vote(raw, w, h, 7);
  // Drop small seed components (bright spots on handles, panel edges).
  const minSeedArea = Math.max(40, Math.round(n * 0.0006));
  // Small pockets of glass between scrolls are kept too when they are as
  // bright as open glass, which iron highlights almost never are.
  const bigSeeds = keepLargeComponents(seeds, w, h, minSeedArea, stack, lum, {
    minArea: 6,
    minMean: Math.min(240, seedLevel + 22),
  });
  let seedArea = 0;
  let seedLumSum = 0;
  for (let p = 0; p < n; p += 1) {
    if (bigSeeds[p]) {
      seedArea += 1;
      seedLumSum += lum[p];
    }
  }

  const doorArea = door.reduce((sum, value) => sum + value, 0);
  const coverage = new Uint8Array(n);
  const glass = new Uint8Array(n);
  const ironRgb = new Uint8ClampedArray(n * 3);
  const glassRgb = new Uint8ClampedArray(n * 3);
  for (let p = 0; p < n; p += 1) {
    ironRgb[p * 3] = pixels[p * 4];
    ironRgb[p * 3 + 1] = pixels[p * 4 + 1];
    ironRgb[p * 3 + 2] = pixels[p * 4 + 2];
    glassRgb[p * 3] = pixels[p * 4];
    glassRgb[p * 3 + 1] = pixels[p * 4 + 1];
    glassRgb[p * 3 + 2] = pixels[p * 4 + 2];
  }

  let region = new Uint8Array(n);
  let reason = "";
  let glassMedian = 0;
  if (seedArea < Math.max(200, doorArea * 0.01)) {
    reason = "no-clear-glass";
  } else {
    glassMedian = seedLumSum / seedArea;
    // 6. Grow the glass from the seeds into everything lighter than the
    //    midpoint between iron and glass, so gray reflections stay glass.
    const growLevel = ironMedian + 0.42 * (glassMedian - ironMedian);
    region = bigSeeds.slice();
    top = 0;
    for (let p = 0; p < n; p += 1) if (region[p]) stack[top++] = p;
    while (top > 0) {
      const p = stack[--top];
      const x = p % w;
      const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of neighbors) {
        if (q < 0 || q >= n || region[q] || !door[q] || depth[q] <= 2) continue;
        if (lum[q] < growLevel) continue;
        region[q] = 1;
        stack[top++] = q;
      }
    }
    region = vote(region, w, h, 5);

    // 7. Pieces of "iron" that float in the glass without touching the
    //    frame are reflections or things behind the glass, unless they are
    //    as dark as the iron.
    fillFloatingIslands(region, door, lum, w, h, ironMedian, glassMedian, stack);

    // Clearly light, colorless areas the glass did not reach mean the mask
    // would only cover part of the glass. Better to not repaint at all.
    const lightLevel = ironMedian + 0.65 * (glassMedian - ironMedian);
    let regionArea = 0;
    let unclaimed = 0;
    for (let p = 0; p < n; p += 1) {
      if (region[p]) regionArea += 1;
      else if (door[p] && depth[p] > frameEnd && lum[p] > lightLevel && chroma[p] < 36) {
        unclaimed += 1;
      }
    }
    if (unclaimed > Math.max(150, regionArea * 0.1)) reason = "partial-glass";

    // Open decorative brackets in the top corners of arched units show the
    // studio white through them. That is air, not glass: cut it out.
    clearCornerOpenings(region, door, lum, w, h, doorArea, stack);
  }

  // 8. Soft edges and the iron and glass colors behind mixed pixels.
  let glassCount = 0;
  let edgeMeanCount = 0;
  for (let p = 0; p < n; p += 1) {
    if (!door[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    const inside = region[p];
    let edge = false;
    if (x > 0 && region[p - 1] !== inside && door[p - 1]) edge = true;
    else if (x < w - 1 && region[p + 1] !== inside && door[p + 1]) edge = true;
    else if (y > 0 && region[p - w] !== inside && door[p - w]) edge = true;
    else if (y < h - 1 && region[p + w] !== inside && door[p + w]) edge = true;
    if (!edge) {
      glass[p] = inside ? 255 : 0;
      if (inside) glassCount += 1;
      continue;
    }
    // Local means of clearly-iron and clearly-glass neighbors.
    let ir = 0;
    let ig = 0;
    let ib = 0;
    let il = 0;
    let ic = 0;
    let gr = 0;
    let gg = 0;
    let gb = 0;
    let gl = 0;
    let gc = 0;
    for (let radius = 3; radius <= 6 && (ic === 0 || gc === 0); radius += 3) {
      ir = ig = ib = il = ic = gr = gg = gb = gl = gc = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (!door[q]) continue;
          // Skip other edge pixels: only use pixels two steps from the border.
          const qx = nx;
          const sameAll =
            (qx === 0 || region[q - 1] === region[q]) &&
            (qx === w - 1 || region[q + 1] === region[q]) &&
            (ny === 0 || region[q - w] === region[q]) &&
            (ny === h - 1 || region[q + w] === region[q]);
          if (!sameAll) continue;
          if (region[q]) {
            gr += pixels[q * 4];
            gg += pixels[q * 4 + 1];
            gb += pixels[q * 4 + 2];
            gl += lum[q];
            gc += 1;
          } else {
            ir += pixels[q * 4];
            ig += pixels[q * 4 + 1];
            ib += pixels[q * 4 + 2];
            il += lum[q];
            ic += 1;
          }
        }
      }
    }
    const ironL = ic ? il / ic : ironMedian;
    const glassL = gc ? gl / gc : glassMedian;
    let a = inside ? 1 : 0;
    if (glassL - ironL > 18) {
      a = clamp((lum[p] - ironL) / (glassL - ironL), 0, 1);
      // Keep the classification's side of the border from flipping fully.
      a = inside ? Math.max(a, 0.12) : Math.min(a, 0.88);
    }
    glass[p] = Math.round(a * 255);
    if (a > 0.5) glassCount += 1;
    edgeMeanCount += 1;
    if (ic) {
      ironRgb[p * 3] = ir / ic;
      ironRgb[p * 3 + 1] = ig / ic;
      ironRgb[p * 3 + 2] = ib / ic;
    } else {
      ironRgb[p * 3] = ironColor[0];
      ironRgb[p * 3 + 1] = ironColor[1];
      ironRgb[p * 3 + 2] = ironColor[2];
    }
    if (gc) {
      glassRgb[p * 3] = gr / gc;
      glassRgb[p * 3 + 1] = gg / gc;
      glassRgb[p * 3 + 2] = gb / gc;
    }
  }

  // 9. Door outline: background pixels that touch the door get partial
  //    coverage so the cut-out edge stays smooth.
  const white = 248;
  for (let p = 0; p < n; p += 1) {
    if (door[p]) {
      coverage[p] = 255;
      continue;
    }
    const x = p % w;
    const y = (p - x) / w;
    let touches = false;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sc = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const q = ny * w + nx;
        if (door[q]) {
          touches = true;
          sr += ironRgb[q * 3];
          sg += ironRgb[q * 3 + 1];
          sb += ironRgb[q * 3 + 2];
          sc += 1;
        }
      }
    }
    if (!touches) continue;
    const a = clamp((white - lum[p]) / Math.max(30, white - ironMedian), 0, 1);
    coverage[p] = Math.round(a * 255);
    ironRgb[p * 3] = sr / sc;
    ironRgb[p * 3 + 1] = sg / sc;
    ironRgb[p * 3 + 2] = sb / sc;
  }

  // 10. Iron luminance spread over the whole door (excluding glass).
  const ironHist = new Uint32Array(256);
  let ironCount = 0;
  for (let p = 0; p < n; p += 1) {
    if (!door[p] || glass[p] > 0) continue;
    ironHist[Math.round(lum[p])] += 1;
    ironCount += 1;
  }
  const iron: IronStats = {
    median: ironMedian,
    low: histPercentile(ironHist, ironCount, 0.1),
    high: histPercentile(ironHist, ironCount, 0.9),
    color: ironColor,
  };

  // 11. Reliability. Be conservative: a wrong mask looks worse than none.
  const glassShare = doorArea ? glassCount / doorArea : 0;
  if (!reason) {
    if (glassShare < 0.015) reason = "too-little-glass";
    else if (glassShare > 0.85) reason = "not-a-door-unit";
    else if (glassMedian - ironMedian < 70) reason = "low-contrast";
    else if (seedArea / Math.max(1, glassCount) < 0.4) reason = "glass-not-clear";
    else {
      // Fine texture (mesh screens, heavy patterned glass) makes the photo's
      // glass unreliable to replace.
      const busy = glassBusyness(lum, region, w, h);
      if (busy > 9) reason = "busy-glass";
      else if (edgeMeanCount > glassCount * 0.9) reason = "fragmented-glass";
    }
  }
  const hasGlass = reason === "";

  // 12. Where the finish may go. With reliable glass that is simply "not
  //     glass". Without it, keep the finish to pixels that look like the
  //     frame iron and leave large areas that look different alone.
  const finishWeight = new Uint8Array(n);
  let finishable = true;
  if (hasGlass) {
    for (let p = 0; p < n; p += 1) finishWeight[p] = coverage[p] ? 255 - glass[p] : 0;
  } else {
    finishable = ironOnlyWeight(
      finishWeight,
      { pixels, lum, door, glass, w, h, doorArea, stack },
      { median: ironMedian, high: ironHigh, color: ironColor },
    );
  }

  return {
    sourceWidth: W,
    sourceHeight: H,
    box,
    width: w,
    height: h,
    pixels,
    coverage,
    glass,
    ironRgb,
    glassRgb,
    hasGlass,
    glassShare,
    reason,
    iron,
    finishWeight,
    finishable,
  };
}

function clearCornerOpenings(
  region: Uint8Array,
  door: Uint8Array,
  lum: Float32Array,
  w: number,
  h: number,
  doorArea: number,
  stack: Int32Array,
) {
  const n = w * h;
  const seen = new Uint8Array(n);
  const members = new Int32Array(n);
  const maxArea = doorArea * 0.004;
  for (let start = 0; start < n; start += 1) {
    if (!region[start] || seen[start]) continue;
    let top = 0;
    let count = 0;
    let sumX = 0;
    let sumL = 0;
    let maxY = 0;
    seen[start] = 1;
    stack[top++] = start;
    while (top > 0) {
      const p = stack[--top];
      members[count++] = p;
      const x = p % w;
      const y = (p - x) / w;
      sumX += x;
      sumL += lum[p];
      if (y > maxY) maxY = y;
      const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of neighbors) {
        if (q < 0 || q >= n || seen[q] || !region[q]) continue;
        seen[q] = 1;
        stack[top++] = q;
      }
    }
    const centerX = sumX / count / w;
    if (
      count <= maxArea &&
      maxY < h * 0.16 &&
      (centerX < 0.22 || centerX > 0.78) &&
      sumL / count > 222
    ) {
      for (let i = 0; i < count; i += 1) {
        region[members[i]] = 0;
        door[members[i]] = 0;
      }
    }
  }
}

/**
 * Finish weight for a door whose glass could not be isolated. Pixels that
 * match the frame iron get the finish; sizable areas that are clearly lighter
 * or a different color than the frame (glass, panels of another material) are
 * left as photographed. Returns false when too much of the door is in doubt.
 */
function ironOnlyWeight(
  out: Uint8Array,
  source: {
    pixels: Uint8ClampedArray;
    lum: Float32Array;
    door: Uint8Array;
    glass: Uint8Array;
    w: number;
    h: number;
    doorArea: number;
    stack: Int32Array;
  },
  frame: { median: number; high: number; color: [number, number, number] },
) {
  const { pixels, lum, door, glass, w, h, doorArea, stack } = source;
  const n = w * h;
  const frameL = luma(frame.color[0], frame.color[1], frame.color[2]);
  const frameCr = frame.color[0] - frameL;
  const frameCb = frame.color[2] - frameL;
  const lightLevel = frame.median + 0.45 * (255 - frame.median);
  const colorLimit = 24;
  const distance = new Float32Array(n);
  const odd = new Uint8Array(n);
  for (let p = 0; p < n; p += 1) {
    if (!door[p]) continue;
    const l = lum[p];
    // Hue is meaningless in near-black pixels.
    const weight = smoothstep(18, 60, l);
    const dr = pixels[p * 4] - l - frameCr;
    const db = pixels[p * 4 + 2] - l - frameCb;
    distance[p] = Math.sqrt(dr * dr + db * db) * weight;
    odd[p] =
      glass[p] > 127 || l > frame.high + 30 || distance[p] > colorLimit ? 1 : 0;
  }

  // Group the odd pixels; keep only sizable areas that are clearly different.
  const keepPhoto = new Uint8Array(n);
  const seen = new Uint8Array(n);
  const members = new Int32Array(n);
  const minArea = Math.max(60, doorArea * 0.004);
  let protectedArea = 0;
  for (let start = 0; start < n; start += 1) {
    if (!odd[start] || seen[start]) continue;
    let top = 0;
    let count = 0;
    let sumL = 0;
    let sumD = 0;
    let glassy = 0;
    seen[start] = 1;
    stack[top++] = start;
    while (top > 0) {
      const p = stack[--top];
      members[count++] = p;
      sumL += lum[p];
      sumD += distance[p];
      if (glass[p] > 127) glassy += 1;
      const x = p % w;
      const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of neighbors) {
        if (q < 0 || q >= n || seen[q] || !odd[q]) continue;
        seen[q] = 1;
        stack[top++] = q;
      }
    }
    if (count < minArea) {
      // Small pockets still stay as photographed when they are clearly
      // glass or clearly lighter than iron (glass between scrolls).
      for (let i = 0; i < count; i += 1) {
        const p = members[i];
        if (glass[p] > 127 || lum[p] > lightLevel) {
          keepPhoto[p] = 1;
          protectedArea += 1;
        }
      }
      continue;
    }
    const different =
      glassy > count * 0.5 || sumL / count > lightLevel || sumD / count > colorLimit;
    if (!different) continue;
    protectedArea += count;
    for (let i = 0; i < count; i += 1) keepPhoto[members[i]] = 1;
  }

  // Soft 3x3 edge so the boundary does not stair-step.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      let kept = 0;
      let total = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          kept += keepPhoto[ny * w + nx];
          total += 1;
        }
      }
      out[p] = Math.round(255 * (1 - kept / total));
    }
  }
  return protectedArea <= doorArea * 0.5;
}

/** 3x3 majority vote. Keeps a pixel set when at least `need` of 9 agree. */
function vote(mask: Uint8Array, w: number, h: number, need: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = y * w + x;
      const votes =
        mask[p - w - 1] +
        mask[p - w] +
        mask[p - w + 1] +
        mask[p - 1] +
        mask[p] +
        mask[p + 1] +
        mask[p + w - 1] +
        mask[p + w] +
        mask[p + w + 1];
      out[p] = votes >= need ? 1 : 0;
    }
  }
  return out;
}

function keepLargeComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea: number,
  stack: Int32Array,
  lum: Float32Array,
  bright: { minArea: number; minMean: number },
) {
  const n = w * h;
  const out = new Uint8Array(n);
  const seen = new Uint8Array(n);
  const members = new Int32Array(n);
  for (let start = 0; start < n; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    let count = 0;
    let sum = 0;
    seen[start] = 1;
    stack[top++] = start;
    while (top > 0) {
      const p = stack[--top];
      members[count++] = p;
      sum += lum[p];
      const x = p % w;
      const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of neighbors) {
        if (q < 0 || q >= n || seen[q] || !mask[q]) continue;
        seen[q] = 1;
        stack[top++] = q;
      }
    }
    if (count >= minArea || (count >= bright.minArea && sum / count >= bright.minMean)) {
      for (let i = 0; i < count; i += 1) out[members[i]] = 1;
    }
  }
  return out;
}

function fillFloatingIslands(
  region: Uint8Array,
  door: Uint8Array,
  lum: Float32Array,
  w: number,
  h: number,
  ironMedian: number,
  glassMedian: number,
  stack: Int32Array,
) {
  const n = w * h;
  const seen = new Uint8Array(n);
  const members = new Int32Array(n);
  const lightLevel = ironMedian + 0.32 * (glassMedian - ironMedian);
  for (let start = 0; start < n; start += 1) {
    if (region[start] || !door[start] || seen[start]) continue;
    let top = 0;
    let count = 0;
    let touchesFrame = false;
    let lumSum = 0;
    seen[start] = 1;
    stack[top++] = start;
    while (top > 0) {
      const p = stack[--top];
      members[count++] = p;
      lumSum += lum[p];
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) {
          touchesFrame = true;
          continue;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) {
            touchesFrame = true;
            continue;
          }
          const q = ny * w + nx;
          if (!door[q]) {
            touchesFrame = true;
            continue;
          }
          if (region[q] || seen[q]) continue;
          seen[q] = 1;
          stack[top++] = q;
        }
      }
    }
    if (touchesFrame) continue;
    const mean = lumSum / count;
    if (count <= 6 || mean > lightLevel) {
      for (let i = 0; i < count; i += 1) region[members[i]] = 1;
    }
  }
}

/** Mean absolute high-pass luminance inside the glass interior. */
function glassBusyness(lum: Float32Array, region: Uint8Array, w: number, h: number) {
  let sum = 0;
  let count = 0;
  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      const p = y * w + x;
      if (
        !region[p] ||
        !region[p - 2] ||
        !region[p + 2] ||
        !region[p - 2 * w] ||
        !region[p + 2 * w]
      ) {
        continue;
      }
      const mean = (lum[p - 1] + lum[p + 1] + lum[p - w] + lum[p + w]) / 4;
      sum += Math.abs(lum[p] - mean);
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

/* ------------------------------------------------------------------ */
/* Finish                                                               */
/* ------------------------------------------------------------------ */

/**
 * Average color of a finish swatch photo. The swatches are small framed
 * panels on white, so this reads the frame face near the edges and skips
 * white and deep shadow.
 */
export function swatchMean(image: Rgba): [number, number, number] | null {
  const { data, width, height } = image;
  const inner = Math.round(Math.min(width, height) * 0.05);
  const outer = Math.round(Math.min(width, height) * 0.13);
  const hist = new Uint32Array(256);
  const samples: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (edge < inner || edge > outer) continue;
      const i = (y * width + x) * 4;
      // Skip the white backdrop (but keep a white finish, which is not
      // perfectly neutral and sits below the studio level).
      if (data[i + 3] < 20 || luma(data[i], data[i + 1], data[i + 2]) > 246) continue;
      const l = Math.round(luma(data[i], data[i + 1], data[i + 2]));
      if (l < 12) continue;
      hist[l] += 1;
      samples.push(i);
    }
  }
  if (samples.length < 20) return null;
  // The swatch photo is lit from the front, so recesses and shadow pull the
  // plain average down. Use the lit face: luminance between the 55th and
  // 92nd percentile, which reads like the finish in daylight.
  const lowLevel = histPercentile(hist, samples.length, 0.55);
  const highLevel = histPercentile(hist, samples.length, 0.92);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (const i of samples) {
    const l = luma(data[i], data[i + 1], data[i + 2]);
    if (l < lowLevel || l > highLevel) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count += 1;
  }
  if (count < 10) return null;
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

type FinishMap = (r: number, g: number, b: number, out: Float32Array) => void;

function finishMapper(analysis: DoorAnalysis, finish: NonNullable<FinishInput>): FinishMap {
  let [fr, fg, fb] = finish.textureMean ?? parseHex(finish.hex);
  // Light finishes: the swatch photo is shot in soft light and reads grayer
  // than painted white metal does. Lift the lit face toward white while
  // keeping the tint, so White and Off White do not turn into light gray.
  const light = smoothstep(150, 215, luma(fr, fg, fb));
  if (light > 0) {
    const lift = 0.45 * light;
    fr += (255 - fr) * lift;
    fg += (255 - fg) * lift;
    fb += (255 - fb) * lift;
  }
  const target = Math.max(4, luma(fr, fg, fb));
  const { median } = analysis.iron;
  // Spread of the source iron, with a floor so photo noise on very even black
  // iron is not blown up into blotches on a light finish.
  const spread = Math.max(14, (analysis.iron.high - analysis.iron.low) / 2);
  const up = Math.min(255 - target, 26 + 0.32 * (255 - target));
  const down = Math.min(target * 0.88, 22 + (0.28 - 0.03 * light) * target);
  // Shadows on white paint fall toward a soft cool gray, not toward beige.
  const shadeR = fr * (1 - light) + 224 * light;
  const shadeG = fg * (1 - light) + 225 * light;
  const shadeB = fb * (1 - light) + 228 * light;
  return (r, g, b, out) => {
    const z = (luma(r, g, b) - median) / spread;
    // Small lifts are the studio watermark and photo noise rather than
    // relief, so they are ignored; real highlights are much stronger.
    const t = z > 0 ? Math.tanh(Math.max(0, z - 0.7) * 0.9) : Math.tanh(z * 0.85);
    if (t >= 0) {
      // Highlights move toward white, like light on painted metal.
      const lift = (t * up) / Math.max(1, 255 - target);
      out[0] = fr + (255 - fr) * lift;
      out[1] = fg + (255 - fg) * lift;
      out[2] = fb + (255 - fb) * lift;
    } else {
      const scale = (target + t * down) / target;
      const cool = -t * light;
      out[0] = (fr + (shadeR - fr) * cool) * scale;
      out[1] = (fg + (shadeG - fg) * cool) * scale;
      out[2] = (fb + (shadeB - fb) * cool) * scale;
    }
  };
}

/* ------------------------------------------------------------------ */
/* Glass                                                                */
/* ------------------------------------------------------------------ */

type Relief = {
  size: number;
  height: Float32Array;
  gx: Float32Array;
  gy: Float32Array;
};

type GlassLook = {
  /** Texture tile size as a share of the door height. */
  tile: number;
  /** Lighting strength of the relief. */
  shade: number;
  /** Refraction offset strength, in share of the door. */
  bend: number;
  /** How much the view behind is diffused (edge softness). */
  blur: number;
  /** Milky scatter mixed into the view. */
  milk: number;
  /** Sky or sheen reflection strength. */
  sheen: number;
};

const looks: Record<string, GlassLook> = {
  clear: { tile: 1, shade: 0, bend: 0, blur: 0.006, milk: 0.03, sheen: 1 },
  frosted: { tile: 0.35, shade: 0.06, bend: 0.002, blur: 0.3, milk: 0.62, sheen: 0.35 },
  rain: { tile: 0.42, shade: 1, bend: 0.02, blur: 0.04, milk: 0.16, sheen: 0.6 },
  aquatex: { tile: 0.42, shade: 1, bend: 0.03, blur: 0.06, milk: 0.2, sheen: 0.6 },
};

const reliefCache = new Map<string, Relief>();
const textureIds = new WeakMap<Rgba, number>();
let textureCounter = 0;

function textureKey(texture: Rgba) {
  let id = textureIds.get(texture);
  if (id === undefined) {
    textureCounter += 1;
    id = textureCounter;
    textureIds.set(texture, id);
  }
  return id;
}

/** Periodic value noise on a cells-x by cells-y lattice over a unit tile. */
function periodicNoise(seed: number, cellsX: number, cellsY: number) {
  const values = new Float32Array(cellsX * cellsY);
  let state = seed >>> 0 || 1;
  for (let i = 0; i < values.length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    values[i] = ((state >>> 0) % 10000) / 10000;
  }
  return (u: number, v: number) => {
    const x = (((u % 1) + 1) % 1) * cellsX;
    const y = (((v % 1) + 1) % 1) * cellsY;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const x1 = (x0 + 1) % cellsX;
    const y1 = (y0 + 1) % cellsY;
    const a = values[y0 * cellsX + x0];
    const b = values[y0 * cellsX + x1];
    const c = values[y1 * cellsX + x0];
    const d = values[y1 * cellsX + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** Procedural relief used when a glass texture image is missing. */
function proceduralHeight(id: string, size: number) {
  const height = new Float32Array(size * size);
  if (id === "rain") {
    const streaks = periodicNoise(11, 34, 3);
    const wobble = periodicNoise(12, 6, 5);
    const drops = periodicNoise(13, 22, 9);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const v = y / size;
        const shift = (wobble(u, v) - 0.5) * 0.03;
        height[y * size + x] = streaks(u + shift, v) * 0.8 + drops(u + shift, v) * 0.25;
      }
    }
  } else if (id === "aquatex") {
    const base = periodicNoise(21, 5, 5);
    const detail = periodicNoise(22, 11, 11);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const v = y / size;
        const n = base(u, v) * 1.6 + detail(u, v) * 0.55;
        height[y * size + x] = 0.5 + 0.5 * Math.sin(n * Math.PI * 3.2);
      }
    }
  } else if (id === "frosted") {
    const grain = periodicNoise(31, 64, 64);
    for (let i = 0; i < height.length; i += 1) {
      height[i] = grain((i % size) / size, Math.floor(i / size) / size);
    }
  }
  return height;
}

/** Resample a texture to `size` and derive its slopes. Cached. */
function reliefFor(id: string, texture: Rgba | null | undefined, size: number): Relief {
  const key = `${id}:${texture ? textureKey(texture) : "p"}:${size}`;
  const cached = reliefCache.get(key);
  if (cached) return cached;
  let height: Float32Array;
  if (texture && texture.width > 0 && texture.height > 0) {
    height = new Float32Array(size * size);
    const { data, width: tw, height: th } = texture;
    // Area average from texture to tile.
    for (let y = 0; y < size; y += 1) {
      const y0 = Math.floor((y * th) / size);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * th) / size));
      for (let x = 0; x < size; x += 1) {
        const x0 = Math.floor((x * tw) / size);
        const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * tw) / size));
        let sum = 0;
        let count = 0;
        for (let sy = y0; sy < y1; sy += 1) {
          for (let sx = x0; sx < x1; sx += 1) {
            sum += data[((sy % th) * tw + (sx % tw)) * 4];
            count += 1;
          }
        }
        height[y * size + x] = sum / count / 255;
      }
    }
  } else {
    height = proceduralHeight(id, size);
  }
  // Normalize contrast so every texture drives the lighting the same way.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < height.length; i += 1) {
    if (height[i] < min) min = height[i];
    if (height[i] > max) max = height[i];
  }
  const range = max - min > 1e-6 ? max - min : 1;
  for (let i = 0; i < height.length; i += 1) height[i] = (height[i] - min) / range;
  const gx = new Float32Array(size * size);
  const gy = new Float32Array(size * size);
  // Slopes in height units per tile pixel, scaled so a tile is "1 unit" wide.
  const scale = size / 16;
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      gx[row + x] = ((height[row + right] - height[row + left]) / 2) * scale;
      gy[row + x] = ((height[down + x] - height[up + x]) / 2) * scale;
    }
  }
  const relief = { size, height, gx, gy };
  if (reliefCache.size > 24) reliefCache.clear();
  reliefCache.set(key, relief);
  return relief;
}

/**
 * What is seen through the glass, in door-normalized coordinates.
 * `soft` widens every edge, standing in for blur.
 */
function behind(scene: DoorScene, nx: number, ny: number, soft: number, out: Float32Array) {
  if (scene === "studio") {
    // A pale room: light back wall, a soft wall edge, a lighter floor line.
    let l = 238 - 6 * ny;
    const wall = smoothstep(0.2 - soft, 0.2 + soft, nx) * (1 - smoothstep(0.27 - soft, 0.27 + soft, nx));
    l -= 16 * wall;
    const floor = smoothstep(0.8 - soft, 0.8 + soft, ny);
    l -= 20 * floor;
    const pane = smoothstep(0.55 - soft, 0.55 + soft, nx) *
      (1 - smoothstep(0.85 - soft, 0.85 + soft, nx)) *
      smoothstep(0.18 - soft, 0.18 + soft, ny) *
      (1 - smoothstep(0.55 - soft, 0.55 + soft, ny));
    l += 10 * pane;
    out[0] = l + 1;
    out[1] = l;
    out[2] = l - 3;
    return;
  }
  // Exterior: a dim interior behind the door, with a lit doorway deeper in.
  let r = 74;
  let g = 66;
  let b = 58;
  const floor = smoothstep(0.74 - soft, 0.74 + soft, ny);
  r -= 26 * floor;
  g -= 24 * floor;
  b -= 21 * floor;
  // Light falling into the room from deeper in the house: wide and soft.
  const spread = soft + 0.12;
  const lit = smoothstep(0.5 - spread, 0.5 + spread, nx) *
    (1 - smoothstep(0.86 - spread, 0.86 + spread, nx)) *
    smoothstep(0.2 - spread, 0.2 + spread, ny) *
    (1 - smoothstep(0.78 - spread, 0.78 + spread, ny));
  r += 40 * lit;
  g += 34 * lit;
  b += 24 * lit;
  const wall = smoothstep(0.16 - soft, 0.16 + soft, nx) * (1 - smoothstep(0.22 - soft, 0.22 + soft, nx));
  r -= 14 * wall;
  g -= 13 * wall;
  b -= 12 * wall;
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

type GlassLayer = { key: string; rgb: Float32Array };

const glassLayers = new WeakMap<DoorAnalysis, GlassLayer[]>();

function glassLayer(analysis: DoorAnalysis, glass: NonNullable<GlassInput>, scene: DoorScene) {
  const key = `${glass.id}:${glass.texture ? textureKey(glass.texture) : "p"}:${scene}`;
  const list = glassLayers.get(analysis) ?? [];
  const found = list.find((layer) => layer.key === key);
  if (found) return found.rgb;

  const { width: w, height: h, glass: mask } = analysis;
  const look = looks[glass.id] ?? looks.clear;
  const rgb = new Float32Array(w * h * 3);
  const tileSize = Math.max(32, Math.round(h * look.tile));
  const relief = look.shade > 0 || look.bend > 0 ? reliefFor(glass.id, glass.texture, tileSize) : null;
  const sample = new Float32Array(3);
  // Light from the upper left, the usual key light on an entry.
  const lx = -0.45;
  const ly = -0.6;
  const lz = 0.66;
  const milkColor = scene === "studio" ? [221, 226, 229] : [178, 184, 189];
  const textured = glass.id === "rain" || glass.id === "aquatex";
  // Outdoors, patterned glass reads as a light, slightly reflective pane with
  // soft relief: more scatter and sky, much gentler shading than indoors.
  const outdoorTexture = scene === "exterior" && textured;
  const milk = outdoorTexture ? Math.min(0.7, look.milk + 0.34) : look.milk;
  const shadeAmount = scene === "studio" ? 70 : outdoorTexture ? 26 : 58;
  const specAmount = outdoorTexture ? 50 : 140;
  const sheen = outdoorTexture ? look.sheen * 1.35 : look.sheen;

  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      if (mask[p] === 0) continue;
      const nx = x / w;
      let gx = 0;
      let gy = 0;
      let height = 0.5;
      if (relief) {
        const t = (y % relief.size) * relief.size + (x % relief.size);
        gx = relief.gx[t];
        gy = relief.gy[t];
        height = relief.height[t];
      }
      behind(scene, nx + gx * look.bend, ny + gy * look.bend, look.blur, sample);
      let r = sample[0];
      let g = sample[1];
      let b = sample[2];
      // Milky scatter (frosted reads as a bright flat diffusion).
      r += (milkColor[0] - r) * milk;
      g += (milkColor[1] - g) * milk;
      b += (milkColor[2] - b) * milk;
      if (relief && look.shade > 0) {
        // Lambert-style shading of the relief normal, centered on flat glass.
        const nzInv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const dot = (-gx * lx - gy * ly + lz) * nzInv - lz;
        const lit = dot * shadeAmount * look.shade;
        const spec = Math.max(0, dot) ** 2 * specAmount * look.shade;
        r += lit + spec;
        g += lit + spec;
        b += lit + spec;
        if (glass.id === "frosted") {
          const grain = (height - 0.5) * 6;
          r += grain;
          g += grain;
          b += grain;
        }
      }
      // Reflection: a soft diagonal sheen in the studio, sky outdoors.
      const diagonal = nx * 0.55 + ny;
      const band = Math.exp(-(((diagonal - 0.42) / 0.1) ** 2));
      if (scene === "studio") {
        const s = (5 + 9 * band) * sheen;
        r += s;
        g += s;
        b += s + 1;
      } else {
        const fresnel = (0.2 + 0.14 * band) * sheen;
        const skyR = 150 + 50 * (1 - ny);
        const skyG = 166 + 46 * (1 - ny);
        const skyB = 182 + 44 * (1 - ny);
        r += (skyR - r) * fresnel;
        g += (skyG - g) * fresnel;
        b += (skyB - b) * fresnel;
      }
      rgb[p * 3] = r;
      rgb[p * 3 + 1] = g;
      rgb[p * 3 + 2] = b;
    }
  }
  list.push({ key, rgb });
  if (list.length > 8) list.shift();
  glassLayers.set(analysis, list);
  return rgb;
}

/* ------------------------------------------------------------------ */
/* Render                                                               */
/* ------------------------------------------------------------------ */

/**
 * Renders the cropped door with alpha. A null finish leaves the iron as
 * photographed; a null glass, or a door without reliable glass, leaves the
 * photo's glass.
 */
export function renderDoor(analysis: DoorAnalysis, options: RenderOptions): Rgba {
  const { width: w, height: h, coverage, glass: mask, ironRgb, glassRgb } = analysis;
  const scene = options.scene ?? "studio";
  const n = w * h;
  const out = new Uint8ClampedArray(n * 4);
  const map =
    options.finish && analysis.finishable ? finishMapper(analysis, options.finish) : null;
  const layer =
    options.glass && analysis.hasGlass ? glassLayer(analysis, options.glass, scene) : null;
  const iron = new Float32Array(3);
  const { pixels, finishWeight } = analysis;

  if (!analysis.hasGlass) {
    // No reliable glass: the photo stays as is, and the finish goes only
    // where the pixel looks like the frame iron.
    for (let p = 0; p < n; p += 1) {
      const cover = coverage[p];
      if (cover === 0) continue;
      const o = p * 4;
      const edge = cover < 255;
      let r = edge ? ironRgb[p * 3] : pixels[o];
      let g = edge ? ironRgb[p * 3 + 1] : pixels[o + 1];
      let b = edge ? ironRgb[p * 3 + 2] : pixels[o + 2];
      const weight = edge ? 1 : finishWeight[p] / 255;
      if (map && weight > 0) {
        map(r, g, b, iron);
        r += (iron[0] - r) * weight;
        g += (iron[1] - g) * weight;
        b += (iron[2] - b) * weight;
      }
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = cover;
    }
    return { data: out, width: w, height: h };
  }

  for (let p = 0; p < n; p += 1) {
    const cover = coverage[p];
    if (cover === 0) continue;
    const a = mask[p] / 255;
    let ir = ironRgb[p * 3];
    let ig = ironRgb[p * 3 + 1];
    let ib = ironRgb[p * 3 + 2];
    if (map && a < 1) {
      map(ir, ig, ib, iron);
      ir = iron[0];
      ig = iron[1];
      ib = iron[2];
    }
    let gr = 0;
    let gg = 0;
    let gb = 0;
    if (a > 0) {
      if (layer) {
        gr = layer[p * 3];
        gg = layer[p * 3 + 1];
        gb = layer[p * 3 + 2];
      } else {
        gr = glassRgb[p * 3];
        gg = glassRgb[p * 3 + 1];
        gb = glassRgb[p * 3 + 2];
      }
    }
    const o = p * 4;
    out[o] = ir + (gr - ir) * a;
    out[o + 1] = ig + (gg - ig) * a;
    out[o + 2] = ib + (gb - ib) * a;
    out[o + 3] = cover;
  }
  return { data: out, width: w, height: h };
}

export type DoorParts = {
  width: number;
  height: number;
  /**
   * Iron color at every pixel of the crop, RGB. The finish is applied, and
   * glass edges carry the iron color rather than a blend with the glass.
   */
  iron: Uint8ClampedArray;
  /** Glass color, RGB, meaningful where analysis.glass > 0. Null without reliable glass. */
  glass: Uint8ClampedArray | null;
};

/**
 * The same colors as renderDoor, kept apart so a 3D view can stack the iron
 * and the glass as separate layers. A null finish leaves the iron as
 * photographed; a null glass keeps the photo's glass.
 */
export function renderDoorParts(analysis: DoorAnalysis, options: RenderOptions): DoorParts {
  const { width: w, height: h, ironRgb, glassRgb } = analysis;
  const n = w * h;
  const iron = new Uint8ClampedArray(n * 3);
  if (!analysis.hasGlass) {
    const flat = renderDoor(analysis, options).data;
    for (let p = 0; p < n; p += 1) {
      iron[p * 3] = flat[p * 4];
      iron[p * 3 + 1] = flat[p * 4 + 1];
      iron[p * 3 + 2] = flat[p * 4 + 2];
    }
    return { width: w, height: h, iron, glass: null };
  }
  const scene = options.scene ?? "studio";
  const map =
    options.finish && analysis.finishable ? finishMapper(analysis, options.finish) : null;
  const out = new Float32Array(3);
  for (let p = 0; p < n; p += 1) {
    const i = p * 3;
    if (map) {
      map(ironRgb[i], ironRgb[i + 1], ironRgb[i + 2], out);
      iron[i] = out[0];
      iron[i + 1] = out[1];
      iron[i + 2] = out[2];
    } else {
      iron[i] = ironRgb[i];
      iron[i + 1] = ironRgb[i + 1];
      iron[i + 2] = ironRgb[i + 2];
    }
  }
  const glass = new Uint8ClampedArray(n * 3);
  const layer = options.glass ? glassLayer(analysis, options.glass, scene) : null;
  const source = layer ?? glassRgb;
  for (let i = 0; i < n * 3; i += 1) glass[i] = source[i];
  return { width: w, height: h, iron, glass };
}

/** Drops the cached glass layers for a door, to free memory once they are drawn. */
export function releaseGlassLayers(analysis: DoorAnalysis) {
  glassLayers.delete(analysis);
}
