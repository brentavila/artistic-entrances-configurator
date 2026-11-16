/**
 * Browser-side loading for door-render.ts: the catalog photo analysis, glass
 * textures and finish swatch colors, cached and shared by every view on the
 * page (the designer preview and the 3D planner door).
 */
import {
  analyzeDoor,
  releaseGlassLayers,
  renderDoorParts,
  swatchMean,
  type DoorAnalysis,
  type Rgba,
} from "@/lib/door-render";

export type LoadedDoor = { image: HTMLImageElement; analysis: DoorAnalysis | null };

export const AS_SHOWN = "as-shown";

/* Caches shared by every view on the page. */
const doorCache = new Map<string, Promise<LoadedDoor>>();
const textureCache = new Map<string, Promise<Rgba | null>>();
const swatchCache = new Map<string, Promise<[number, number, number] | null>>();

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

export function pixelsOf(image: HTMLImageElement): Rgba | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return null;
  context.drawImage(image, 0, 0);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: frame.data, width: frame.width, height: frame.height };
}

/** Runs heavy work when the browser is idle, so the first paint stays quick. */
export function whenIdle<T>(work: () => T) {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      try {
        resolve(work());
      } catch (error) {
        reject(error);
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 600 });
    } else {
      window.setTimeout(run, 30);
    }
  });
}

/**
 * Runs on the next animation frame, with a timer fallback for pages where
 * frames are paused (a background tab, some embedded previews).
 */
export function nextFrame(work: () => void) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    work();
  };
  window.requestAnimationFrame(run);
  window.setTimeout(run, 80);
}

export function loadDoor(src: string) {
  let pending = doorCache.get(src);
  if (!pending) {
    pending = loadImage(src).then((image) =>
      whenIdle(() => {
        const pixels = pixelsOf(image);
        return { image, analysis: pixels ? analyzeDoor(pixels) : null };
      }),
    );
    pending.catch(() => doorCache.delete(src));
    doorCache.set(src, pending);
    trimDoorCache(12, src);
  }
  return pending;
}

/** Keeps at most `max` door analyses, dropping the oldest first. */
function trimDoorCache(max: number, keep?: string) {
  for (const key of doorCache.keys()) {
    if (doorCache.size <= max) break;
    if (key !== keep) doorCache.delete(key);
  }
}

export function loadGlassTexture(id: string) {
  let pending = textureCache.get(id);
  if (!pending) {
    // A missing texture falls back to the renderer's procedural relief.
    pending = loadImage(`/media/render/glass/${id}.webp`)
      .then((image) => pixelsOf(image))
      .catch(() => null);
    textureCache.set(id, pending);
  }
  return pending;
}

export function loadSwatchMean(url: string | null) {
  if (!url) return Promise.resolve(null);
  let pending = swatchCache.get(url);
  if (!pending) {
    pending = loadImage(url)
      .then((image) => {
        const pixels = pixelsOf(image);
        return pixels ? swatchMean(pixels) : null;
      })
      .catch(() => null);
    swatchCache.set(url, pending);
  }
  return pending;
}

/* ------------------------------------------------------------------ */
/* Door art for the 3D planner                                          */
/* ------------------------------------------------------------------ */

export type ArtGlass = { id: string };
export type ArtFinish = { id: string; hex: string; textureUrl: string | null };

/** Glass types that are drawn as obscure, textured panes rather than see-through. */
const OBSCURE_GLASS = new Set(["frosted", "rain", "aquatex"]);

/** Longest texture edge, in pixels. Catalog photos are about 800 today. */
const MAX_EDGE = 1024;
/** Prepared doors kept in memory: the current one, its neighbors, and a spare. */
const ART_LIMIT = 5;
/** Door analyses kept while the planner is browsing doors. */
const PLANNER_ANALYSES = 6;

export type DoorArt =
  | {
      kind: "parts";
      key: string;
      width: number;
      height: number;
      /** Opaque iron color with the finish applied. */
      iron: HTMLCanvasElement;
      /**
       * Opaque masks. Red: the door unit (arched and shaped tops leave the
       * corners at 0). Green: iron, that is the door unit minus its glass.
       */
      mask: HTMLCanvasElement;
      /** Obscure glass as seen from outside and from inside. Null for clear glass. */
      glassOutside: HTMLCanvasElement | null;
      glassInside: HTMLCanvasElement | null;
      hasGlass: boolean;
      /** True when part of the crop rectangle lies outside the door unit. */
      shaped: boolean;
      /** Which outer edges of the crop are straight, full-length door edges. */
      edges: { top: boolean; bottom: boolean; left: boolean; right: boolean };
      /** Average iron color, sRGB hex. */
      ironHex: string;
    }
  | {
      /** The analysis failed: the catalog photo goes on a plain slab. */
      kind: "photo";
      key: string;
      photo: HTMLCanvasElement;
    };

const artCache = new Map<string, Promise<DoorArt>>();

export function doorArtKey(src: string, glass: ArtGlass, finish: ArtFinish) {
  return `${src}|${glass.id}|${finish.id}|${finish.hex}`;
}

/**
 * Analyzes a catalog door and draws it in the chosen glass and finish, as
 * textures for the 3D door. Heavy work waits for idle time. Cached per door,
 * glass and finish, and bounded so browsing many doors keeps memory flat.
 */
export function prepareDoorArt(src: string, glass: ArtGlass, finish: ArtFinish): Promise<DoorArt> {
  const key = doorArtKey(src, glass, finish);
  const cached = artCache.get(key);
  if (cached) {
    // Most recently used goes last.
    artCache.delete(key);
    artCache.set(key, cached);
    return cached;
  }
  const pending = Promise.all([
    loadDoor(src),
    loadGlassTexture(glass.id),
    loadSwatchMean(finish.textureUrl),
  ]).then(([loaded, texture, mean]) =>
    whenIdle(() => {
      const art = buildArt(key, loaded, glass, texture, finish, mean);
      if (loaded.analysis) releaseGlassLayers(loaded.analysis);
      trimDoorCache(PLANNER_ANALYSES, src);
      return art;
    }),
  );
  pending.catch(() => artCache.delete(key));
  artCache.set(key, pending);
  for (const old of artCache.keys()) {
    if (artCache.size <= ART_LIMIT) break;
    if (old !== key) artCache.delete(old);
  }
  return pending;
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Writes RGBA bytes into a canvas, scaled down when it is over MAX_EDGE. */
function toCanvas(data: Uint8ClampedArray, width: number, height: number) {
  const full = canvasOf(width, height);
  const context = full.getContext("2d");
  if (context) context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  if (scale >= 1) return full;
  const small = canvasOf(Math.round(width * scale), Math.round(height * scale));
  const smallContext = small.getContext("2d");
  if (!smallContext) return full;
  smallContext.imageSmoothingQuality = "high";
  smallContext.drawImage(full, 0, 0, small.width, small.height);
  return small;
}

function hex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function buildArt(
  key: string,
  loaded: LoadedDoor,
  glass: ArtGlass,
  texture: Rgba | null,
  finish: ArtFinish,
  mean: [number, number, number] | null,
): DoorArt {
  const analysis = loaded.analysis;
  if (!analysis) {
    const { image } = loaded;
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const photo = canvasOf(
      Math.max(1, Math.round(image.naturalWidth * scale)),
      Math.max(1, Math.round(image.naturalHeight * scale)),
    );
    photo.getContext("2d")?.drawImage(image, 0, 0, photo.width, photo.height);
    return { kind: "photo", key, photo };
  }

  const finishInput = finish.id === AS_SHOWN ? null : { hex: finish.hex, textureMean: mean };
  const glassInput = { id: glass.id, texture };
  const outside = renderDoorParts(analysis, { glass: glassInput, finish: finishInput, scene: "exterior" });
  const obscure = analysis.hasGlass && OBSCURE_GLASS.has(glass.id);
  const inside = obscure
    ? renderDoorParts(analysis, { glass: glassInput, finish: finishInput, scene: "studio" })
    : null;

  const { width: w, height: h, coverage } = analysis;
  const mask = analysis.glass;
  const n = w * h;

  // Average iron color, for the edges of the door and to pad the texture.
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let count = 0;
  const ironShare = (p: number) =>
    (coverage[p] / 255) * (analysis.hasGlass ? 1 - mask[p] / 255 : 1);
  for (let p = 0; p < n; p += 7) {
    if (ironShare(p) < 0.9) continue;
    sr += outside.iron[p * 3];
    sg += outside.iron[p * 3 + 1];
    sb += outside.iron[p * 3 + 2];
    count += 1;
  }
  const avg: [number, number, number] =
    count > 0 ? [sr / count, sg / count, sb / count] : [40, 36, 32];

  const ironData = new Uint8ClampedArray(n * 4);
  const maskData = new Uint8ClampedArray(n * 4);
  const outsideData = obscure ? new Uint8ClampedArray(n * 4) : null;
  const insideData = obscure ? new Uint8ClampedArray(n * 4) : null;
  let shapedPixels = 0;
  for (let p = 0; p < n; p += 1) {
    const o = p * 4;
    const i = p * 3;
    const cover = coverage[p];
    if (cover < 128) shapedPixels += 1;
    // Outside the door unit the color is padding only, so texture filtering
    // never pulls a dark or white fringe into the iron edge.
    const pad = cover === 0;
    ironData[o] = pad ? avg[0] : outside.iron[i];
    ironData[o + 1] = pad ? avg[1] : outside.iron[i + 1];
    ironData[o + 2] = pad ? avg[2] : outside.iron[i + 2];
    ironData[o + 3] = 255;
    maskData[o] = cover;
    maskData[o + 1] = Math.round(ironShare(p) * 255);
    maskData[o + 2] = 0;
    maskData[o + 3] = 255;
    if (outsideData && insideData && outside.glass && inside?.glass) {
      outsideData[o] = outside.glass[i];
      outsideData[o + 1] = outside.glass[i + 1];
      outsideData[o + 2] = outside.glass[i + 2];
      outsideData[o + 3] = 255;
      insideData[o] = inside.glass[i];
      insideData[o + 1] = inside.glass[i + 1];
      insideData[o + 2] = inside.glass[i + 2];
      insideData[o + 3] = 255;
    }
  }
  if (outsideData && insideData) {
    padGlass(outsideData, mask, w, h);
    padGlass(insideData, mask, w, h);
  }

  const fullRow = (y: number) => {
    let full = 0;
    for (let x = 0; x < w; x += 1) if (coverage[y * w + x] >= 128) full += 1;
    return full / w > 0.92;
  };
  const fullColumn = (x: number) => {
    let full = 0;
    for (let y = 0; y < h; y += 1) if (coverage[y * w + x] >= 128) full += 1;
    return full / h > 0.92;
  };
  const inset = Math.max(1, Math.round(Math.min(w, h) * 0.01));

  return {
    kind: "parts",
    key,
    width: w,
    height: h,
    iron: toCanvas(ironData, w, h),
    mask: toCanvas(maskData, w, h),
    glassOutside: outsideData ? toCanvas(outsideData, w, h) : null,
    glassInside: insideData ? toCanvas(insideData, w, h) : null,
    hasGlass: analysis.hasGlass,
    shaped: shapedPixels > n * 0.004,
    edges: {
      top: fullRow(inset),
      bottom: fullRow(h - 1 - inset),
      left: fullColumn(inset),
      right: fullColumn(w - 1 - inset),
    },
    ironHex: hex(avg[0], avg[1], avg[2]),
  };
}

/**
 * The glass colors only exist where there is glass. Spread them a few pixels
 * under the iron so texture filtering does not darken the glass edges.
 */
function padGlass(data: Uint8ClampedArray, mask: Uint8Array, w: number, h: number) {
  const known = new Uint8Array(w * h);
  for (let p = 0; p < known.length; p += 1) known[p] = mask[p] > 0 ? 1 : 0;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = known.slice();
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = y * w + x;
        if (known[p]) continue;
        const from =
          x > 0 && known[p - 1] ? p - 1
            : x < w - 1 && known[p + 1] ? p + 1
              : y > 0 && known[p - w] ? p - w
                : y < h - 1 && known[p + w] ? p + w
                  : -1;
        if (from < 0) continue;
        data[p * 4] = data[from * 4];
        data[p * 4 + 1] = data[from * 4 + 1];
        data[p * 4 + 2] = data[from * 4 + 2];
        next[p] = 1;
      }
    }
    known.set(next);
  }
}
