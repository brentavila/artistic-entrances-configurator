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

export function facadeFromMark(opening: Opening, mark: DoorMark): Facade {
  const width = opening.width / mark.width;
  const height = opening.height / mark.height;
  const left = -opening.width / 2 - mark.x * width;
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

export function loadDownscaled(url: string, maxEdge: number) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not prepare the photo."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    image.onerror = () => reject(new Error("Could not read that photo."));
    image.src = url;
  });
}

export async function fileToPreviewUrl(file: File, maxEdge: number) {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadDownscaled(objectUrl, maxEdge);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
