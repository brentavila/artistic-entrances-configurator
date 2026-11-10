export const OPENING_LIMITS = {
  width: { min: 24, max: 96 },
  height: { min: 72, max: 120 },
  jambDepth: { min: 4, max: 12 },
} as const;

export const FRAME = { side: 2, head: 2, sill: 1 } as const;
export const DOOR_THICKNESS = 1.75;
export const MIN_MARK = 0.08;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type HingeSide = "left" | "right";
export type Swing = "in" | "out";
export type PlannerView = "exterior" | "threshold" | "inside";

export type Opening = {
  width: number;
  height: number;
  jambDepth: number;
  hingeSide: HingeSide;
  swing: Swing;
};

export type OpeningDraft = {
  width: string;
  height: string;
  jambDepth: string;
  hingeSide: HingeSide;
  swing: Swing;
};

export type DoorMark = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Facade = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export type WallRect = {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
};

export const defaultOpeningDraft: OpeningDraft = {
  width: "38",
  height: "82.5",
  jambDepth: "4.5625",
  hingeSide: "left",
  swing: "in",
};

export const defaultDoorMark: DoorMark = {
  x: 0.32,
  y: 0.06,
  width: 0.36,
  height: 0.8,
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function photoError(file: File) {
  const allowed = PHOTO_TYPES as readonly string[];
  if (!allowed.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
    return "Photos must be JPG, PNG, or WebP and under 8 MB.";
  }
  return null;
}

function parseInches(
  value: string,
  min: number,
  max: number,
  label: string,
) {
  const inches = Number(value);
  if (!Number.isFinite(inches)) return `Enter ${label} in inches.`;
  if (inches < min || inches > max) {
    return `${label} must be between ${min} and ${max} inches.`;
  }
  return inches;
}

export function openingFromDraft(
  draft: OpeningDraft,
): { ok: true; opening: Opening } | { ok: false; error: string } {
  const width = parseInches(
    draft.width,
    OPENING_LIMITS.width.min,
    OPENING_LIMITS.width.max,
    "Rough opening width",
  );
  if (typeof width === "string") return { ok: false, error: width };

  const height = parseInches(
    draft.height,
    OPENING_LIMITS.height.min,
    OPENING_LIMITS.height.max,
    "Rough opening height",
  );
  if (typeof height === "string") return { ok: false, error: height };

  const jambDepth = parseInches(
    draft.jambDepth,
    OPENING_LIMITS.jambDepth.min,
    OPENING_LIMITS.jambDepth.max,
    "Jamb depth",
  );
  if (typeof jambDepth === "string") return { ok: false, error: jambDepth };

  return {
    ok: true,
    opening: {
      width,
      height,
      jambDepth,
      hingeSide: draft.hingeSide,
      swing: draft.swing,
    },
  };
}

export function markError(mark: DoorMark) {
  if (mark.width < MIN_MARK || mark.height < MIN_MARK) {
    return "Draw a larger box around the door.";
  }
  if (
    mark.x < -0.001 ||
    mark.y < -0.001 ||
    mark.x + mark.width > 1.001 ||
    mark.y + mark.height > 1.001
  ) {
    return "Keep the box on the photo.";
  }
  return null;
}

export function doorLeaf(opening: Opening) {
  return {
    width: opening.width - FRAME.side * 2,
    height: opening.height - FRAME.head - FRAME.sill,
    thickness: DOOR_THICKNESS,
  };
}

export function hingeX(opening: Opening) {
  return opening.hingeSide === "left"
    ? -opening.width / 2 + FRAME.side
    : opening.width / 2 - FRAME.side;
}

// Negative Y rotation swings a left-hinged door into the house.
// The sign flips for a right hinge, and again for an outswing.
export function swingRadians(
  opening: Pick<Opening, "hingeSide" | "swing">,
  openAmount: number,
) {
  const angle = (Math.PI / 2) * clamp(openAmount, 0, 1);
  const intoHome = opening.swing === "in";
  const left = opening.hingeSide === "left";
  const sign = left === intoHome ? -1 : 1;
  return sign * angle;
}

export function handingLabel(opening: Pick<Opening, "hingeSide" | "swing">) {
  const hinge = opening.hingeSide === "left" ? "Left hinge" : "Right hinge";
  const swing = opening.swing === "in" ? "swings in" : "swings out";
  return `${hinge}, ${swing}, standing outside`;
}

export function formatInches(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded} in`;
}

export function plannerSummary(doorName: string, opening: Opening) {
  return [
    `${doorName} preview in a rough opening ${formatInches(opening.width)} wide by ${formatInches(opening.height)} high.`,
    `Jamb depth ${formatInches(opening.jambDepth)}.`,
    `${handingLabel(opening)}.`,
    "Glass, handle, and finish were not selected in the 3D planner.",
  ].join(" ");
}

// World +X is on the viewer's left from outside and on their right from
// inside. An exterior photo is therefore laid out from its right edge, and an
// interior photo from its left edge, so an off-center door lands where it is.
export function facadeFromMark(
  opening: Opening,
  mark: DoorMark,
  side: "exterior" | "interior" = "exterior",
): Facade {
  const width = opening.width / mark.width;
  const height = opening.height / mark.height;
  const before = side === "exterior" ? 1 - mark.x - mark.width : mark.x;
  const left = -opening.width / 2 - before * width;
  const top = opening.height + mark.y * height;
  return {
    left,
    right: left + width,
    top,
    bottom: top - height,
    width,
    height,
  };
}

export function facadeRects(facade: Facade, opening: Opening): WallRect[] {
  const ox0 = -opening.width / 2;
  const ox1 = opening.width / 2;
  const candidates: WallRect[] = [
    { id: "left", x0: facade.left, x1: ox0, y0: facade.bottom, y1: facade.top },
    { id: "right", x0: ox1, x1: facade.right, y0: facade.bottom, y1: facade.top },
    { id: "head", x0: ox0, x1: ox1, y0: opening.height, y1: facade.top },
    { id: "sill", x0: ox0, x1: ox1, y0: facade.bottom, y1: 0 },
  ];
  return candidates.filter(
    (rect) => rect.x1 - rect.x0 > 0.5 && rect.y1 - rect.y0 > 0.5,
  );
}

/** The parts of a wall of the given size that surround the opening. */
export function wallRects(
  bounds: { left: number; right: number; bottom: number; top: number },
  opening: Opening,
  clip?: { left: number; right: number; bottom: number; top: number },
): WallRect[] {
  const ox0 = -opening.width / 2;
  const ox1 = opening.width / 2;
  const left = Math.max(bounds.left, clip?.left ?? -Infinity);
  const right = Math.min(bounds.right, clip?.right ?? Infinity);
  const bottom = Math.max(bounds.bottom, clip?.bottom ?? -Infinity);
  const top = Math.min(bounds.top, clip?.top ?? Infinity);
  const candidates: WallRect[] = [
    { id: "left", x0: left, x1: Math.min(ox0, right), y0: bottom, y1: top },
    { id: "right", x0: Math.max(ox1, left), x1: right, y0: bottom, y1: top },
    { id: "head", x0: ox0, x1: ox1, y0: Math.max(opening.height, bottom), y1: top },
    { id: "sill", x0: ox0, x1: ox1, y0: bottom, y1: Math.min(0, top) },
  ];
  return candidates.filter(
    (rect) => rect.x1 - rect.x0 > 0.5 && rect.y1 - rect.y0 > 0.5,
  );
}

export function entryRoom(opening: Opening) {
  return {
    width: Math.max(opening.width + 64, 96),
    depth: 132,
    ceiling: Math.max(opening.height + 16, 96),
    eye: Math.min(64, opening.height - 8),
  };
}

export function cameraPose(
  name: PlannerView,
  opening: Opening,
  facade: Facade,
): CameraPose {
  const room = entryRoom(opening);
  if (name === "threshold") {
    return {
      position: [0, room.eye, -36],
      target: [0, opening.height * 0.42, opening.jambDepth],
    };
  }
  if (name === "inside") {
    return {
      position: [0, room.eye, opening.jambDepth + 72],
      target: [0, opening.height * 0.46, 0],
    };
  }

  const span = Math.max(facade.height, facade.width * 0.65, opening.height);
  const y = clamp(
    (Math.max(facade.bottom, -12) + facade.top) / 2,
    opening.height * 0.35,
    Math.max(opening.height, facade.top),
  );
  return {
    position: [0, y, -Math.max(span * 0.95, 90)],
    target: [0, opening.height * 0.45, 0],
  };
}

export function walkBounds(opening: Opening, facade: Facade) {
  const room = entryRoom(opening);
  const exteriorDistance = Math.abs(
    cameraPose("exterior", opening, facade).position[2],
  );
  return {
    minX: -room.width / 2 + 10,
    maxX: room.width / 2 - 10,
    minZ: -(exteriorDistance + 24),
    maxZ: opening.jambDepth + room.depth - 14,
    eye: room.eye,
  };
}

export function cameraBlocked(
  x: number,
  z: number,
  opening: Opening,
  doorOpen: number,
) {
  const inJamb = z > -0.5 && z < opening.jambDepth + 0.5;
  const inHole = Math.abs(x) < opening.width / 2 - 4;
  if (inJamb && !inHole) return true;
  if (doorOpen < 0.72 && inHole && z > -0.5 && z < opening.jambDepth + 2) {
    return true;
  }

  if (doorOpen >= 0.72) {
    const leaf = doorLeaf(opening);
    const hinge = hingeX(opening);
    const inward = opening.swing === "in" ? 1 : -1;
    const start = 0.75;
    const end = start + inward * leaf.width;
    if (z >= Math.min(start, end) && z <= Math.max(start, end) && Math.abs(x - hinge) < 7) {
      return true;
    }
  }

  return false;
}

export function doorTextureSrc(imageUrl: string) {
  if (imageUrl.startsWith("/")) return imageUrl;
  return `/api/door-image?src=${encodeURIComponent(imageUrl)}`;
}

export type PixelBox = { x: number; y: number; width: number; height: number };

function backgroundPixel(data: Uint8ClampedArray | Uint8Array, index: number) {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const alpha = data[index + 3];
  if (alpha < 20) return true;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  // Product photos sit on white, with a faint watermark outside the door.
  return max > 214 && max - min < 28;
}

export function doorContentBox(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): PixelBox | null {
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (seen[pixel] || !backgroundPixel(data, pixel * 4)) return;
    seen[pixel] = 1;
    stack.push(pixel);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const pixel = stack.pop() ?? 0;
    const x = pixel % width;
    const y = (pixel - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (seen[y * width + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const box = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  if (box.width < width * 0.2 || box.height < height * 0.35) return null;
  return box;
}

export function fillEdgeBackground(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
) {
  const outside = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (outside[pixel] || !backgroundPixel(data, pixel * 4)) return;
    outside[pixel] = 1;
    stack.push(pixel);
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const pixel = stack.pop() ?? 0;
    const x = pixel % width;
    const y = (pixel - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  let remaining = outside.reduce((sum, value) => sum + value, 0);
  let guard = 0;
  while (remaining > 0 && guard < width + height) {
    guard += 1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        if (!outside[pixel]) continue;
        const neighbors = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        for (const [nextX, nextY] of neighbors) {
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (outside[next]) continue;
          const target = pixel * 4;
          const source = next * 4;
          data[target] = data[source];
          data[target + 1] = data[source + 1];
          data[target + 2] = data[source + 2];
          data[target + 3] = 255;
          outside[pixel] = 0;
          remaining -= 1;
          break;
        }
      }
    }
  }
}

export async function fileToPreviewUrl(file: File, maxEdge: number) {
  const buffer = await file.arrayBuffer();
  const orientation = jpegOrientation(buffer);
  const stored = jpegSize(buffer);
  const bitmap = await createImageBitmap(new Blob([buffer], { type: file.type || "image/jpeg" }));
  try {
    // Phone photos are stored sideways with a rotation tag. Current browsers
    // already apply that tag, so turning the pixels again lays the door on
    // its side. A browser that ignores the tag keeps the stored dimensions.
    const turns = orientation >= 5 && orientation <= 8;
    const browserTurned =
      !turns ||
      !stored ||
      (bitmap.width === stored.height && bitmap.height === stored.width);
    const orientedWidth = browserTurned ? bitmap.width : bitmap.height;
    const orientedHeight = browserTurned ? bitmap.height : bitmap.width;
    const scale = Math.min(1, maxEdge / Math.max(orientedWidth, orientedHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(orientedWidth * scale));
    canvas.height = Math.max(1, Math.round(orientedHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the photo.");
    if (browserTurned) {
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    } else {
      context.scale(scale, scale);
      orientContext(context, orientation, bitmap.width, bitmap.height);
      context.drawImage(bitmap, 0, 0);
    }
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    bitmap.close();
  }
}

function jpegSize(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 9 < view.byteLength) {
    const marker = view.getUint16(offset);
    if (
      (marker >= 0xffc0 && marker <= 0xffc3) ||
      (marker >= 0xffc5 && marker <= 0xffc7) ||
      (marker >= 0xffc9 && marker <= 0xffcb) ||
      (marker >= 0xffcd && marker <= 0xffcf)
    ) {
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    }
    if (marker === 0xffda || marker === 0xffd9) break;
    const size = view.getUint16(offset + 2);
    if (size < 2) break;
    offset += 2 + size;
  }
  return null;
}

function jpegOrientation(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && size > 8 && view.getUint32(offset + 4) === 0x45786966) {
      const found = orientationInExif(view, offset + 10);
      if (found) return found;
    }
    if (marker === 0xffda || size < 2) break;
    offset += 2 + size;
  }
  return 1;
}

function orientationInExif(view: DataView, tiff: number) {
  if (tiff + 8 > view.byteLength) return 0;
  const little = view.getUint16(tiff) === 0x4949;
  const read16 = (position: number) => view.getUint16(position, little);
  const read32 = (position: number) => view.getUint32(position, little);
  if (read16(tiff + 2) !== 0x002a) return 0;
  let ifd = tiff + read32(tiff + 4);
  for (let depth = 0; depth < 4 && ifd + 2 < view.byteLength; depth += 1) {
    const count = read16(ifd);
    for (let index = 0; index < count; index += 1) {
      const entry = ifd + 2 + index * 12;
      if (entry + 12 > view.byteLength) return 0;
      if (read16(entry) === 0x0112) {
        const type = read16(entry + 2);
        const values = read32(entry + 4);
        if (values !== 1) continue;
        if (type === 3) return read16(entry + 8);
        if (type === 4) return read32(entry + 8);
      }
    }
    const next = read32(ifd + 2 + count * 12);
    if (!next) break;
    ifd = tiff + next;
  }
  return 0;
}

function orientContext(
  context: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number,
) {
  switch (orientation) {
    case 2:
      context.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      context.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      context.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      context.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      context.transform(0, 1, -1, 0, height, 0);
      break;
    case 7:
      context.transform(0, -1, -1, 0, height, width);
      break;
    case 8:
      context.transform(0, -1, 1, 0, 0, width);
      break;
    default:
      break;
  }
}

/**
 * Marks the glass in a cropped catalog photo. The doors are shot on white, so
 * glass shows as bright, colorless areas inside the ironwork. Returns one byte
 * per pixel (1 = glass), or null when the photo has no clear glass to cut out.
 */
export function glassMask(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8Array | null {
  const raw = new Uint8Array(width * height);
  for (let pixel = 0; pixel < raw.length; pixel += 1) {
    const index = pixel * 4;
    const max = Math.max(data[index], data[index + 1], data[index + 2]);
    const min = Math.min(data[index], data[index + 1], data[index + 2]);
    raw[pixel] = max > 168 && max - min < 40 ? 1 : 0;
  }

  // Keep a pixel as glass only when most of its neighbors agree. This drops
  // highlights on the iron and keeps thin scrollwork from breaking up.
  const glass = new Uint8Array(width * height);
  let total = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let votes = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          votes += raw[(y + dy) * width + x + dx];
        }
      }
      if (votes >= 7) {
        glass[y * width + x] = 1;
        total += 1;
      }
    }
  }
  const share = total / (width * height);
  if (share < 0.06 || share > 0.8) return null;
  return glass;
}

export type DoorLayers = {
  /** The door photo, cropped to the door. */
  colorUrl: string;
  /** White where there is iron, black where there is glass. Null for a solid door. */
  ironUrl: string | null;
};

export async function doorLayers(url: string, maxEdge: number): Promise<DoorLayers> {
  const colorUrl = await doorTextureUrl(url, maxEdge);
  const image = await loadImage(colorUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { colorUrl, ironUrl: null };
  context.drawImage(image, 0, 0);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const glass = glassMask(frame.data, canvas.width, canvas.height);
  if (!glass) return { colorUrl, ironUrl: null };
  for (let pixel = 0; pixel < glass.length; pixel += 1) {
    const value = glass[pixel] ? 0 : 255;
    const index = pixel * 4;
    frame.data[index] = value;
    frame.data[index + 1] = value;
    frame.data[index + 2] = value;
    frame.data[index + 3] = 255;
  }
  context.putImageData(frame, 0, 0);
  return { colorUrl, ironUrl: canvas.toDataURL("image/png") };
}

export async function doorTextureUrl(url: string, maxEdge: number) {
  const image = await loadImage(url);
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not prepare the door.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const box = doorContentBox(frame.data, canvas.width, canvas.height);
  if (!box) return canvas.toDataURL("image/png");

  const cropped = context.getImageData(box.x, box.y, box.width, box.height);
  fillEdgeBackground(cropped.data, box.width, box.height);
  const output = document.createElement("canvas");
  output.width = box.width;
  output.height = box.height;
  const outputContext = output.getContext("2d");
  if (!outputContext) return canvas.toDataURL("image/png");
  outputContext.putImageData(cropped, 0, 0);
  return output.toDataURL("image/png");
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the door image."));
    image.src = url;
  });
}
