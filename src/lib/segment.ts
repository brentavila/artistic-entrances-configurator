import type { InteractiveSegmenterLegacy } from "@mediapipe/tasks-vision";
import { DoorMark, MIN_MARK, clamp } from "@/lib/planner";

// The MediaPipe runtime is copied from node_modules into /public so it always
// matches the installed package. The model comes from Google's model host.
const WASM_PATH = "/mediapipe/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";
const SEGMENT_EDGE = 768;

export type DoorOutline = {
  /** Box around the outlined door, as fractions of the photo. */
  mark: DoorMark;
  /** Transparent PNG, the same shape as the photo, tinting the outlined door. */
  overlayUrl: string;
  /** Black and white PNG of the same outline: white is the door. */
  maskUrl: string;
};

export type MaskBox = { x0: number; y0: number; x1: number; y1: number; fill: number };

let segmenter: Promise<InteractiveSegmenterLegacy> | null = null;

function loadSegmenter() {
  if (!segmenter) {
    segmenter = (async () => {
      const { FilesetResolver, InteractiveSegmenterLegacy } = await import(
        "@mediapipe/tasks-vision"
      );
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      const create = (delegate: "GPU" | "CPU") =>
        InteractiveSegmenterLegacy.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      try {
        return await create("GPU");
      } catch {
        return await create("CPU");
      }
    })();
    segmenter.catch(() => {
      segmenter = null;
    });
  }
  return segmenter;
}

/** Start downloading the model before the customer picks a photo. */
export function warmSegmenter() {
  void loadSegmenter().catch(() => undefined);
}

/**
 * Finds the door box in a mask. A row or column counts only when a real share
 * of it is filled, so stray specks and thin spill onto the wall are ignored.
 */
export function maskBox(
  inside: Uint8Array,
  width: number,
  height: number,
): MaskBox | null {
  const columns = new Uint32Array(width);
  const rows = new Uint32Array(height);
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!inside[y * width + x]) continue;
      columns[x] += 1;
      rows[y] += 1;
      total += 1;
    }
  }
  if (total === 0) return null;

  const span = (counts: Uint32Array) => {
    let peak = 0;
    for (const count of counts) if (count > peak) peak = count;
    const floor = peak * 0.3;
    let first = -1;
    let last = -1;
    for (let index = 0; index < counts.length; index += 1) {
      if (counts[index] < floor) continue;
      if (first < 0) first = index;
      last = index;
    }
    return [first, last] as const;
  };
  const [x0, x1] = span(columns);
  const [y0, y1] = span(rows);
  if (x0 < 0 || y0 < 0) return null;
  return {
    x0: x0 / width,
    y0: y0 / height,
    x1: (x1 + 1) / width,
    y1: (y1 + 1) / height,
    fill: total / (width * height),
  };
}

export function markFromMaskBox(box: MaskBox): DoorMark | null {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  // A door is a tall shape that is neither a speck nor the whole photo.
  if (box.fill < 0.015 || width < MIN_MARK || height < MIN_MARK) return null;
  if (width > 0.92 && height > 0.92) return null;
  return {
    x: clamp(box.x0, 0, 1 - width),
    y: clamp(box.y0, 0, 1 - height),
    width,
    height,
  };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the photo."));
    image.src = url;
  });
}

function maskImage(inside: Uint8Array, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const pixels = context.createImageData(width, height);
  for (let pixel = 0; pixel < inside.length; pixel += 1) {
    const value = inside[pixel] ? 255 : 0;
    const target = pixel * 4;
    pixels.data[target] = value;
    pixels.data[target + 1] = value;
    pixels.data[target + 2] = value;
    pixels.data[target + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

function overlay(inside: Uint8Array, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const pixels = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!inside[pixel]) continue;
      const edge =
        x < 2 ||
        y < 2 ||
        x >= width - 2 ||
        y >= height - 2 ||
        !inside[pixel - 2] ||
        !inside[pixel + 2] ||
        !inside[pixel - 2 * width] ||
        !inside[pixel + 2 * width];
      const target = pixel * 4;
      pixels.data[target] = edge ? 255 : 200;
      pixels.data[target + 1] = edge ? 236 : 164;
      pixels.data[target + 2] = edge ? 190 : 92;
      pixels.data[target + 3] = edge ? 245 : 78;
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Outlines the object under `point` (fractions of the photo) on the device.
 * Returns null when the model finds nothing door-shaped there.
 */
export async function segmentDoor(
  photoUrl: string,
  point: { x: number; y: number },
): Promise<DoorOutline | null> {
  const [task, image] = await Promise.all([loadSegmenter(), loadImage(photoUrl)]);
  const scale = Math.min(1, SEGMENT_EDGE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let inside: Uint8Array | null = null;
  let width = 0;
  let height = 0;
  task.segment(canvas, { keypoint: { x: point.x, y: point.y } }, (result) => {
    const masks = result.confidenceMasks;
    const mask = masks?.[masks.length - 1];
    if (!mask) return;
    const values = mask.getAsFloat32Array();
    width = mask.width;
    height = mask.height;
    const px = clamp(Math.round(point.x * width), 0, width - 1);
    const py = clamp(Math.round(point.y * height), 0, height - 1);
    // The tapped pixel is on the door by definition. If the model scored it
    // as background, this mask is the background channel and is flipped.
    const flipped = values[py * width + px] < 0.5;
    inside = new Uint8Array(width * height);
    for (let index = 0; index < values.length; index += 1) {
      inside[index] = values[index] >= 0.5 !== flipped ? 1 : 0;
    }
  });
  if (!inside) return null;

  const box = maskBox(inside, width, height);
  const mark = box && markFromMaskBox(box);
  if (!mark) return null;
  return {
    mark,
    overlayUrl: overlay(inside, width, height),
    maskUrl: maskImage(inside, width, height),
  };
}
