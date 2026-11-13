"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  analyzeDoor,
  renderDoor,
  swatchMean,
  type DoorAnalysis,
  type Rgba,
} from "@/lib/door-render";
import "@/styles/door-preview.css";

type PreviewDoor = { id: string; imageUrl: string; alt: string };
type PreviewGlass = { id: string; name: string };
type PreviewFinish = { id: string; name: string; hex: string; textureUrl: string | null };

type Props = {
  door: PreviewDoor;
  glass: PreviewGlass;
  finish: PreviewFinish;
  sizes?: string;
};

type Loaded = { image: HTMLImageElement; analysis: DoorAnalysis | null };

const AS_SHOWN = "as-shown";
const FADE_MS = 180;
const FIRST_FADE_MS = 420;

/* Caches shared by every preview on the page. */
const doorCache = new Map<string, Promise<Loaded>>();
const textureCache = new Map<string, Promise<Rgba | null>>();
const swatchCache = new Map<string, Promise<[number, number, number] | null>>();

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

function pixelsOf(image: HTMLImageElement): Rgba | null {
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
function whenIdle<T>(work: () => T) {
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
function nextFrame(work: () => void) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    work();
  };
  window.requestAnimationFrame(run);
  window.setTimeout(run, 80);
}

function loadDoor(src: string) {
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
    if (doorCache.size > 12) {
      const oldest = doorCache.keys().next().value;
      if (oldest !== undefined && oldest !== src) doorCache.delete(oldest);
    }
  }
  return pending;
}

function loadGlassTexture(id: string) {
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

function loadSwatchMean(url: string | null) {
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

function statusFor(
  state: "loading" | "ready" | "photo",
  analysis: DoorAnalysis | null,
  glass: PreviewGlass,
  finish: PreviewFinish,
) {
  const asShown = finish.id === AS_SHOWN;
  const finishText = asShown ? "the finish shown" : finish.name;
  if (state === "photo") {
    return `Showing the catalog photo. ${glass.name} glass and ${finishText} are recorded with your request.`;
  }
  if (state === "loading") return "Preparing the preview.";
  const finishDrawn = asShown || Boolean(analysis?.finishable);
  if (analysis && !analysis.hasGlass) {
    if (!finishDrawn) {
      return `Showing this door as photographed. ${glass.name} glass and ${finish.name} are recorded with your request.`;
    }
    const shown = asShown ? "this door as photographed" : `${finish.name} on this door`;
    return `Showing ${shown}. ${glass.name} glass is recorded with your request.`;
  }
  if (!finishDrawn) {
    return `Showing ${glass.name} glass. ${finish.name} is recorded with your request.`;
  }
  return `Showing ${glass.name} glass in ${finishText}.`;
}

function noteFor(
  state: "loading" | "ready" | "photo",
  analysis: DoorAnalysis | null,
  finish: PreviewFinish,
) {
  if (state === "photo") return "Glass and finish are recorded but not drawn on this photo";
  if (state !== "ready" || !analysis) return null;
  const finishMissing = finish.id !== AS_SHOWN && !analysis.finishable;
  if (!analysis.hasGlass && finishMissing) {
    return "Glass and finish are recorded but cannot be drawn on this photo";
  }
  if (!analysis.hasGlass) return "Glass in this photo cannot be previewed";
  if (finishMissing) return "Finish is recorded but cannot be drawn on this photo";
  return null;
}

type LayerContent = { door: HTMLCanvasElement };

export function DoorPreview({ door, glass, finish, sizes = "(max-width: 900px) 100vw, 45vw" }: Props) {
  const layers = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const holder = useRef<HTMLDivElement>(null);
  const contents = useRef<Array<LayerContent | null>>([null, null]);
  const [front, setFront] = useState<0 | 1 | null>(null);
  const [back, setBack] = useState<0 | 1 | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "photo">("loading");
  const [analysis, setAnalysis] = useState<DoorAnalysis | null>(null);
  const frontRef = useRef<0 | 1 | null>(null);
  const shownDoor = useRef<string | null>(null);
  const job = useRef(0);

  const finishId = finish.id;
  const finishHex = finish.hex;
  const finishTexture = finish.textureUrl;
  const glassId = glass.id;
  const doorSrc = door.imageUrl;

  // Keep the stage sharp and framed when the preview box changes size.
  useEffect(() => {
    const box = holder.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      [0, 1].forEach((index) => {
        const canvas = layers[index].current;
        const content = contents.current[index];
        if (canvas && content) stage(canvas, content.door);
      });
    });
    observer.observe(box);
    return () => observer.disconnect();
    // The canvas refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const token = ++job.current;
    let cancelled = false;
    const newDoor = shownDoor.current !== doorSrc;
    if (newDoor) {
      // Drop the old door's render at once so it never sits over the new photo.
      frontRef.current = null;
      setFront(null);
      setState("loading");
    }

    Promise.all([loadDoor(doorSrc), loadGlassTexture(glassId), loadSwatchMean(finishTexture)])
      .then(([loaded, texture, mean]) => {
        if (cancelled || token !== job.current) return;
        const result = loaded.analysis;
        setAnalysis(result);
        if (!result) {
          shownDoor.current = doorSrc;
          setState("photo");
          frontRef.current = null;
          setFront(null);
          return;
        }
        // Paint on the next frame so option clicks stay responsive.
        nextFrame(() => {
          if (cancelled || token !== job.current) return;
          const target = frontRef.current === 0 ? 1 : 0;
          const canvas = layers[target].current;
          if (!canvas) return;
          const rendered = renderDoor(result, {
            glass: { id: glassId, texture },
            finish: finishId === AS_SHOWN ? null : { hex: finishHex, textureMean: mean },
            scene: "studio",
          });
          const doorCanvas = contents.current[target]?.door ?? document.createElement("canvas");
          toCanvas(doorCanvas, rendered);
          contents.current[target] = { door: doorCanvas };
          stage(canvas, doorCanvas);
          const firstForDoor = frontRef.current === null;
          // The new render fades in over the previous one, which stays fully
          // visible underneath. The first render for a door fades in slowly
          // over the photo, so the change to the studio stage is gentle.
          setBack(frontRef.current);
          shownDoor.current = doorSrc;
          frontRef.current = target;
          setFront(target);
          setState("ready");
          const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          if (!still && typeof canvas.animate === "function") {
            canvas.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: firstForDoor ? FIRST_FADE_MS : FADE_MS,
              easing: "ease-out",
            });
          }
        });
      })
      .catch(() => {
        if (cancelled || token !== job.current) return;
        shownDoor.current = doorSrc;
        frontRef.current = null;
        setFront(null);
        setState("photo");
      });

    return () => {
      cancelled = true;
    };
    // The canvas refs are stable; listing them would only add noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doorSrc, glassId, finishId, finishHex, finishTexture]);

  const status = statusFor(state, analysis, glass, finish);
  const note = noteFor(state, analysis, finish);

  return (
    <>
      <Image
        alt={door.alt}
        className="door-preview-photo"
        fill
        priority
        sizes={sizes}
        src={door.imageUrl}
        unoptimized
      />
      <div aria-hidden="true" className="door-preview-layers" ref={holder}>
        {[0, 1].map((index) => (
          <canvas
            className={
              front === index
                ? "door-preview-layer is-front"
                : front !== null && back === index
                  ? "door-preview-layer is-back"
                  : "door-preview-layer"
            }
            key={index}
            ref={layers[index]}
          />
        ))}
      </div>
      {note ? <p className="door-preview-note">{note}</p> : null}
      <p aria-live="polite" className="door-preview-status" role="status">
        {status}
      </p>
    </>
  );
}

function toCanvas(canvas: HTMLCanvasElement, image: Rgba) {
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0,
  );
}

/** Room kept at the bottom of the preview for the door name, in CSS pixels. */
const LABEL_ROOM = 112;

/**
 * Draws the door cutout on a soft studio backdrop: warm paper wall, a floor
 * line, a contact shadow, and the door scaled to fit with padding, standing
 * above the label at the bottom of the preview.
 */
function stage(canvas: HTMLCanvasElement, door: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height || !door.width || !door.height) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(rect.width * ratio);
  const H = Math.round(rect.height * ratio);
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const context = canvas.getContext("2d");
  if (!context) return;

  const floorY = Math.round(Math.min(H * 0.72, H - LABEL_ROOM * ratio));
  const topPad = H * 0.07;
  const sidePad = W * 0.09;
  const scale = Math.min((W - sidePad * 2) / door.width, (floorY - topPad) / door.height);
  const doorW = door.width * scale;
  const doorH = door.height * scale;
  const doorX = (W - doorW) / 2;
  const doorY = floorY - doorH;

  // Wall: warm paper, a touch lighter behind the door.
  const wall = context.createLinearGradient(0, 0, 0, floorY);
  wall.addColorStop(0, "#f5f1ea");
  wall.addColorStop(1, "#e9e2d6");
  context.fillStyle = wall;
  context.fillRect(0, 0, W, floorY);
  const glow = context.createRadialGradient(W / 2, floorY * 0.45, 0, W / 2, floorY * 0.45, W * 0.7);
  glow.addColorStop(0, "rgba(255, 253, 248, 0.55)");
  glow.addColorStop(1, "rgba(255, 253, 248, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, W, floorY);

  // Floor: slightly darker, fading down.
  const floor = context.createLinearGradient(0, floorY, 0, H);
  floor.addColorStop(0, "#ded6c8");
  floor.addColorStop(1, "#d3cabb");
  context.fillStyle = floor;
  context.fillRect(0, floorY, W, H - floorY);
  context.fillStyle = "rgba(70, 58, 42, 0.12)";
  context.fillRect(0, floorY, W, Math.max(1, ratio));

  // Contact shadow where the door meets the floor.
  context.save();
  context.translate(W / 2, floorY);
  context.scale(1, Math.max(0.04, Math.min(0.12, (14 * ratio) / doorW)));
  const contact = context.createRadialGradient(0, 0, 0, 0, 0, doorW * 0.62);
  contact.addColorStop(0, "rgba(38, 30, 20, 0.42)");
  contact.addColorStop(0.7, "rgba(38, 30, 20, 0.12)");
  contact.addColorStop(1, "rgba(38, 30, 20, 0)");
  context.fillStyle = contact;
  context.beginPath();
  context.arc(0, 0, doorW * 0.62, 0, Math.PI * 2);
  context.fill();
  context.restore();

  // The door, with a soft shadow that follows its outline (arches included).
  context.save();
  context.shadowColor = "rgba(40, 30, 20, 0.2)";
  context.shadowBlur = 22 * ratio;
  context.shadowOffsetY = 6 * ratio;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(door, doorX, doorY, doorW, doorH);
  context.restore();
}
