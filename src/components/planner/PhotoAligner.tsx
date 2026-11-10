"use client";

import { KeyboardEvent, MouseEvent, PointerEvent, useRef } from "react";
import { DoorMark, MIN_MARK, clamp } from "@/lib/planner";

type Handle = "move" | "nw" | "ne" | "sw" | "se";

export function PhotoAligner({
  imageUrl,
  mark,
  onChange,
  overlayUrl,
  onPick,
  onAdjustStart,
  onAdjustEnd,
}: {
  imageUrl: string;
  mark: DoorMark;
  onChange: (mark: DoorMark) => void;
  /** Tint showing the door the phone outlined. */
  overlayUrl?: string | null;
  /** A tap on the photo outside the box: outline whatever is there. */
  onPick?: (point: { x: number; y: number }) => void;
  /** The customer grabbed the box or a corner. */
  onAdjustStart?: () => void;
  /** The customer let go after moving the box or a corner. */
  onAdjustEnd?: (mark: DoorMark) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: Handle;
    x: number;
    y: number;
    mark: DoorMark;
    moved: boolean;
    latest: DoorMark;
  } | null>(null);
  // Set when a press began on the box. The browser follows every drag with a
  // click on the photo, and that click must not re-outline the door.
  const swallowClick = useRef(false);

  function ratio(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    };
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const box = (event.target as HTMLElement).closest(".photo-box");
    if (!box) return;
    const point = ratio(event);
    if (!point) return;
    const handle = (event.target as HTMLElement).dataset.handle;
    const mode: Handle =
      handle === "nw" || handle === "ne" || handle === "sw" || handle === "se"
        ? handle
        : "move";
    event.preventDefault();
    swallowClick.current = true;
    drag.current = { mode, x: point.x, y: point.y, mark, moved: false, latest: mark };
    event.currentTarget.setPointerCapture(event.pointerId);
    onAdjustStart?.();
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    const point = ratio(event);
    if (!current || !point) return;
    current.moved = true;
    current.latest = nextMark(current.mode, current.mark, current, point);
    onChange(current.latest);
  }

  function endDrag() {
    const current = drag.current;
    drag.current = null;
    if (current?.moved) onAdjustEnd?.(current.latest);
  }

  function pick(event: MouseEvent<HTMLDivElement>) {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    if (!onPick || (event.target as HTMLElement).closest(".photo-box")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    onPick({
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    });
  }

  function nudge(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.04 : 0.015;
    const next = { ...mark };
    if (event.key === "ArrowLeft") next.x = clamp(next.x - step, 0, 1 - next.width);
    else if (event.key === "ArrowRight") next.x = clamp(next.x + step, 0, 1 - next.width);
    else if (event.key === "ArrowUp") next.y = clamp(next.y - step, 0, 1 - next.height);
    else if (event.key === "ArrowDown") next.y = clamp(next.y + step, 0, 1 - next.height);
    else if (event.key === "+" || event.key === "=") {
      next.width = clamp(next.width + step, MIN_MARK, 1 - next.x);
      next.height = clamp(next.height + step, MIN_MARK, 1 - next.y);
    } else if (event.key === "-" || event.key === "_") {
      next.width = clamp(next.width - step, MIN_MARK, 1 - next.x);
      next.height = clamp(next.height - step, MIN_MARK, 1 - next.y);
    } else {
      return;
    }
    event.preventDefault();
    onChange(next);
  }

  return (
    <div
      aria-label="Door area on your photo. Drag the box onto the existing door. Arrow keys move it. Plus and minus resize it."
      className="photo-aligner"
      onClick={pick}
      onKeyDown={nudge}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerCancel={endDrag}
      onPointerUp={endDrag}
      ref={frame}
      role="application"
      tabIndex={0}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="Your current front entry" draggable={false} src={imageUrl} />
      {overlayUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" aria-hidden className="photo-outline" draggable={false} src={overlayUrl} />
      )}
      <div
        className="photo-box"
        style={{
          left: `${mark.x * 100}%`,
          top: `${mark.y * 100}%`,
          width: `${mark.width * 100}%`,
          height: `${mark.height * 100}%`,
        }}
      >
        <span>Door</span>
        {(["nw", "ne", "sw", "se"] as const).map((handle) => (
          <i
            aria-hidden
            className={`photo-handle ${handle}`}
            data-handle={handle}
            key={handle}
          />
        ))}
      </div>
    </div>
  );
}

function nextMark(
  mode: Handle,
  start: DoorMark,
  origin: { x: number; y: number },
  point: { x: number; y: number },
) {
  if (mode === "move") {
    const width = start.width;
    const height = start.height;
    return {
      x: clamp(start.x + point.x - origin.x, 0, 1 - width),
      y: clamp(start.y + point.y - origin.y, 0, 1 - height),
      width,
      height,
    };
  }

  const right = start.x + start.width;
  const bottom = start.y + start.height;
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (mode === "se") {
    width = clamp(point.x - start.x, MIN_MARK, 1 - start.x);
    height = clamp(point.y - start.y, MIN_MARK, 1 - start.y);
  } else if (mode === "nw") {
    x = clamp(point.x, 0, right - MIN_MARK);
    y = clamp(point.y, 0, bottom - MIN_MARK);
    width = right - x;
    height = bottom - y;
  } else if (mode === "ne") {
    y = clamp(point.y, 0, bottom - MIN_MARK);
    width = clamp(point.x - start.x, MIN_MARK, 1 - start.x);
    height = bottom - y;
  } else {
    x = clamp(point.x, 0, right - MIN_MARK);
    width = right - x;
    height = clamp(point.y - start.y, MIN_MARK, 1 - start.y);
  }

  return { x, y, width, height };
}
