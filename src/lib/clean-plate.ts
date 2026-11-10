import { DoorMark, clamp } from "@/lib/planner";

const SEND_EDGE = 1280;

export type CleanPlate = {
  /** The entry photo at full size with the old door painted out. */
  plateUrl: string;
  /** Box around everything that was painted out, as fractions of the photo. */
  removed: DoorMark;
  /** True when the server sharpened the phone's outline. */
  refined: boolean;
  /** The whole door as the server found it, as fractions of the photo. */
  door: DoorMark | null;
};

/** A black and white mask that is white inside the box, for a box the customer drew. */
export function boxMaskUrl(mark: DoorMark, aspect: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.max(1, Math.round(512 / aspect));
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  context.fillRect(
    mark.x * canvas.width,
    mark.y * canvas.height,
    mark.width * canvas.width,
    mark.height * canvas.height,
  );
  return canvas.toDataURL("image/png");
}

export type CleanPlateResult =
  | { ok: true; plate: CleanPlate }
  | { ok: false; reason: string };

function validBox(box: unknown): box is DoorMark {
  if (!box || typeof box !== "object") return false;
  const { x, y, width, height } = box as Record<string, unknown>;
  return [x, y, width, height].every((value) => typeof value === "number" && Number.isFinite(value))
    && (width as number) > 0.05 && (height as number) > 0.05
    && (x as number) >= 0 && (y as number) >= 0
    && (x as number) + (width as number) <= 1.001 && (y as number) + (height as number) <= 1.001;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the image."));
    image.src = url;
  });
}

/**
 * Sends the photo and the phone's door outline to the server, which paints the
 * old door out. The fill comes back smaller than the photo, so it is blended
 * into the full-size original here, only where the door was.
 */
export async function requestCleanPlate(
  photoUrl: string,
  maskUrl: string,
  signal?: AbortSignal,
): Promise<CleanPlateResult> {
  const photo = await loadImage(photoUrl);
  const scale = Math.min(1, SEND_EDGE / Math.max(photo.width, photo.height));
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(photo.width * scale));
  small.height = Math.max(1, Math.round(photo.height * scale));
  small.getContext("2d")?.drawImage(photo, 0, 0, small.width, small.height);

  const reply = await fetch("/api/planner/clean-plate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: small.toDataURL("image/jpeg", 0.88), mask: maskUrl }),
    signal,
  });
  const result = (await reply.json().catch(() => null)) as {
    ok?: boolean;
    reason?: string;
    plate?: string;
    mask?: string;
    refined?: boolean;
    door?: DoorMark | null;
  } | null;
  if (!reply.ok || !result?.ok || !result.plate || !result.mask) {
    return { ok: false, reason: result?.reason ?? `http-${reply.status}` };
  }

  const [fill, mask] = await Promise.all([loadImage(result.plate), loadImage(result.mask)]);

  // Turn the black and white mask into transparency at a low resolution.
  // Stretching it back up softens the edge, so the fill blends into the photo.
  const alpha = document.createElement("canvas");
  alpha.width = Math.max(1, Math.round(photo.width / 6));
  alpha.height = Math.max(1, Math.round(photo.height / 6));
  const alphaContext = alpha.getContext("2d", { willReadFrequently: true });
  if (!alphaContext) return { ok: false, reason: "no-canvas" };
  alphaContext.drawImage(mask, 0, 0, alpha.width, alpha.height);
  const pixels = alphaContext.getImageData(0, 0, alpha.width, alpha.height);
  let minX = alpha.width;
  let minY = alpha.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < alpha.height; y += 1) {
    for (let x = 0; x < alpha.width; x += 1) {
      const index = (y * alpha.width + x) * 4;
      const inside = pixels.data[index];
      pixels.data[index + 3] = inside;
      if (inside < 24) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { ok: false, reason: "empty-mask" };
  alphaContext.putImageData(pixels, 0, 0);

  const patch = document.createElement("canvas");
  patch.width = photo.width;
  patch.height = photo.height;
  const patchContext = patch.getContext("2d");
  const output = document.createElement("canvas");
  output.width = photo.width;
  output.height = photo.height;
  const outputContext = output.getContext("2d");
  if (!patchContext || !outputContext) return { ok: false, reason: "no-canvas" };
  patchContext.drawImage(fill, 0, 0, patch.width, patch.height);
  patchContext.globalCompositeOperation = "destination-in";
  patchContext.drawImage(alpha, 0, 0, patch.width, patch.height);
  outputContext.drawImage(photo, 0, 0);
  outputContext.drawImage(patch, 0, 0);

  // One low-resolution pixel of margin covers the softened edge.
  const x = clamp((minX - 1) / alpha.width, 0, 1);
  const y = clamp((minY - 1) / alpha.height, 0, 1);
  return {
    ok: true,
    plate: {
      plateUrl: output.toDataURL("image/jpeg", 0.9),
      removed: {
        x,
        y,
        width: clamp((maxX + 2) / alpha.width, 0, 1) - x,
        height: clamp((maxY + 2) / alpha.height, 0, 1) - y,
      },
      refined: Boolean(result.refined),
      door: validBox(result.door) ? result.door : null,
    },
  };
}
