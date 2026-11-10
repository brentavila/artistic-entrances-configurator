import { NextResponse } from "next/server";
import sharp from "sharp";

// Removes the customer's old door from their entry photo.
//
// The phone sends the photo and the door outline it drew with MediaPipe.
// 1. SAM 2 finds every object in the photo. The one that best matches the
//    phone's outline sharpens it (the hosted model takes no tap prompt).
// 2. LaMa paints wall, trim, and floor over the outlined door.
// The reply is the filled photo plus the final mask. The planner blends the
// fill into the full-size photo on the device.

export const runtime = "nodejs";
export const maxDuration = 60;

const SAM_VERSION = "fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83";
const LAMA_VERSION = "cdac78a1bec5b23c07fd29692fb70baa513ea403a39e643c48ec5edadb15fe72";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_EDGE = 1600;
const TOTAL_MS = 55_000;
const REFINE_MS = 25_000;
const MATCH_IOU = 0.55;
// The phone often outlines a single glass panel. A SAM object that holds most
// of that outline, is door-shaped, and is not most of the photo is the door.
const MIN_COVER = 0.8;
const MAX_SHARE = 0.6;

// Each call costs money, so one visitor gets a small allowance.
const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_CALLS = 8;
const calls = new Map<string, number[]>();

function allowed(key: string) {
  const now = Date.now();
  const recent = (calls.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= WINDOW_CALLS) {
    calls.set(key, recent);
    return false;
  }
  recent.push(now);
  calls.set(key, recent);
  if (calls.size > 5000) calls.clear();
  return true;
}

function decode(dataUrl: unknown) {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  return bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES ? bytes : null;
}

class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function run(token: string, version: string, input: object, deadline: number) {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const wait = Math.max(1, Math.min(60, Math.floor((deadline - Date.now()) / 1000)));
  const body = JSON.stringify({ version, input });
  let started = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: { ...headers, Prefer: `wait=${wait}` },
    body,
  });
  // Replicate throttles accounts with a small balance to about one prediction
  // at a time. When it says "too many", wait as long as it asks and try again.
  while (started.status === 429) {
    const seconds = Number(started.headers.get("retry-after")) || 2;
    const pause = Math.min(10, Math.max(1, seconds)) * 1000;
    if (Date.now() + pause > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, pause));
    started = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: { ...headers, Prefer: `wait=${wait}` },
      body,
    });
  }
  if (!started.ok) {
    throw new ProviderError(`Replicate replied ${started.status}`, started.status);
  }
  let prediction = (await started.json()) as {
    status: string;
    output?: unknown;
    error?: unknown;
    urls?: { get?: string };
  };
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (Date.now() > deadline || !prediction.urls?.get) {
      throw new ProviderError("The model took too long", 504);
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const next = await fetch(prediction.urls.get, { headers });
    if (!next.ok) throw new ProviderError(`Replicate replied ${next.status}`, next.status);
    prediction = await next.json();
  }
  if (prediction.status !== "succeeded") {
    throw new ProviderError(`The model ${prediction.status}`, 502);
  }
  return prediction.output;
}

async function download(url: string) {
  const reply = await fetch(url);
  if (!reply.ok) throw new ProviderError(`Could not fetch a model result (${reply.status})`, 502);
  return Buffer.from(await reply.arrayBuffer());
}

/** One byte per pixel, 255 inside the mask. */
async function grey(image: Buffer, width: number, height: number) {
  const { data, info } = await sharp(image)
    .resize(width, height, { fit: "fill" })
    .flatten({ background: "#000" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels === 1) return data;
  const single = Buffer.alloc(width * height);
  for (let pixel = 0; pixel < single.length; pixel += 1) single[pixel] = data[pixel * info.channels];
  return single;
}

type Box = { x: number; y: number; width: number; height: number };

/** How a SAM object compares with the phone's outline (a). */
function compare(a: Buffer, b: Buffer, size: number) {
  let both = 0;
  let either = 0;
  let inA = 0;
  let inB = 0;
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let pixel = 0; pixel < a.length; pixel += 1) {
    const hitA = a[pixel] > 127;
    const hitB = b[pixel] > 127;
    if (hitA) inA += 1;
    if (hitB) {
      inB += 1;
      const x = pixel % size;
      const y = (pixel - x) / size;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (hitA && hitB) both += 1;
    if (hitA || hitB) either += 1;
  }
  return {
    iou: either === 0 ? 0 : both / either,
    cover: inA === 0 ? 0 : both / inA,
    share: inB / a.length,
    box: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

/** Box around the white pixels of a full-size mask, as fractions. */
function boxOf(mask: Buffer, width: number, height: number): Box | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] <= 127) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return {
    x: minX / width,
    y: minY / height,
    width: (maxX - minX + 1) / width,
    height: (maxY - minY + 1) / height,
  };
}

/** Asks SAM 2 for every object and returns the one that matches the phone's outline. */
async function sharperMask(
  token: string,
  imageUri: string,
  phoneMask: Buffer,
  deadline: number,
) {
  const output = (await run(
    token,
    SAM_VERSION,
    // The model's default filters keep only a few very confident objects and
    // usually drop the door. These looser settings returned it on test photos.
    {
      image: imageUri,
      points_per_side: 32,
      pred_iou_thresh: 0.6,
      stability_score_thresh: 0.7,
      use_m2m: false,
    },
    deadline,
  )) as { individual_masks?: unknown };
  const urls = Array.isArray(output?.individual_masks)
    ? output.individual_masks.filter((url): url is string => typeof url === "string").slice(0, 60)
    : [];
  const small = 192;
  const phoneSmall = await grey(phoneMask, small, small);
  // The photo was squashed into a square to compare, so a door's real
  // proportions come back by scaling with the photo's own shape.
  const meta = await sharp(phoneMask).metadata();
  const aspect = (meta.width ?? 1) / (meta.height ?? 1);
  let door: { image: Buffer; share: number } | null = null;
  let closest: { image: Buffer; iou: number } | null = null;
  await Promise.all(
    urls.map(async (url) => {
      try {
        const image = await download(url);
        const found = compare(phoneSmall, await grey(image, small, small), small);
        if (!closest || found.iou > closest.iou) closest = { image, iou: found.iou };
        if (!found.box || found.cover < MIN_COVER || found.share > MAX_SHARE) return;
        const shape = (found.box.width / found.box.height) * aspect;
        // Single doors are about 0.4 wide per 1 tall, double doors about 0.9.
        if (shape < 0.25 || shape > 1.2) return;
        if (!door || found.share > door.share) door = { image, share: found.share };
      } catch {
        // One unreadable mask does not stop the others.
      }
    }),
  );
  const whole = door as { image: Buffer; share: number } | null;
  if (whole) return whole.image;
  const near = closest as { image: Buffer; iou: number } | null;
  return near && near.iou >= MATCH_IOU ? near.image : null;
}

export async function POST(request: Request) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, reason: "not-configured" }, { status: 501 });
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }
  const visitor =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  if (!allowed(visitor)) {
    return NextResponse.json({ ok: false, reason: "rate-limited" }, { status: 429 });
  }

  let body: { image?: unknown; mask?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }
  const image = decode(body.image);
  const phoneMask = decode(body.mask);
  if (!image || !phoneMask) {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }

  const deadline = Date.now() + TOTAL_MS;
  try {
    const size = await sharp(image).metadata();
    const width = size.width ?? 0;
    const height = size.height ?? 0;
    if (width < 64 || height < 64 || Math.max(width, height) > MAX_EDGE) {
      return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
    }
    const imageUri = `data:image/jpeg;base64,${(await sharp(image).jpeg({ quality: 88 }).toBuffer()).toString("base64")}`;

    let refined = false;
    let door: Box | null = null;
    const combined = await grey(phoneMask, width, height);
    try {
      const sharper = await sharperMask(
        token,
        imageUri,
        phoneMask,
        Math.min(deadline, Date.now() + REFINE_MS),
      );
      if (sharper) {
        const extra = await grey(sharper, width, height);
        door = boxOf(extra, width, height);
        for (let pixel = 0; pixel < combined.length; pixel += 1) {
          if (extra[pixel] > combined[pixel]) combined[pixel] = extra[pixel];
        }
        refined = true;
      }
    } catch (error) {
      console.warn("[planner] outline refinement skipped:", error instanceof Error ? error.message : error);
      // Out of credit or forbidden will fail the fill too, so stop here.
      if (error instanceof ProviderError && [401, 402, 403].includes(error.status)) throw error;
    }

    // Grow the mask a little so the fill also covers the door's edge and shadow line.
    // sharp applies threshold before blur within one pipeline, so this takes two.
    const soft = await sharp(combined, { raw: { width, height, channels: 1 } })
      .blur(Math.max(2, Math.max(width, height) / 110))
      .png()
      .toBuffer();
    const mask = await sharp(soft).threshold(36).png().toBuffer();

    const filled = await run(
      token,
      LAMA_VERSION,
      { image: imageUri, mask: `data:image/png;base64,${mask.toString("base64")}` },
      deadline,
    );
    const filledUrl = Array.isArray(filled) ? filled[0] : filled;
    if (typeof filledUrl !== "string") throw new ProviderError("The fill returned no image", 502);
    const plate = await sharp(await download(filledUrl))
      .resize(width, height, { fit: "fill" })
      .jpeg({ quality: 90 })
      .toBuffer();

    return NextResponse.json({
      ok: true,
      refined,
      door,
      plate: `data:image/jpeg;base64,${plate.toString("base64")}`,
      mask: `data:image/png;base64,${mask.toString("base64")}`,
    });
  } catch (error) {
    const status = error instanceof ProviderError ? error.status : 500;
    const reason =
      status === 402 ? "no-credit" : status === 401 || status === 403 ? "bad-key" : "failed";
    console.error("[planner] clean plate failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, reason }, { status: status === 402 ? 402 : 502 });
  }
}
