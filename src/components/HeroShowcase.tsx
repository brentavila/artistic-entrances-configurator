"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import heroData from "@/data/hero-doors.json";
import { selectDoor, track, trackOption, viewDoor, type DoorLike } from "@/lib/analytics";
import { business } from "@/lib/business";
import { HERO_STATIC_CSS } from "./hero-static-css";
import "@/styles/hero.css";

type Layout = "single" | "double";
type HeroDoor = { id: string; name: string; cutout: string; thumb: string };
type Method = "button" | "card" | "rail" | "keyboard" | "wheel" | "swipe";

const LAYOUTS: Layout[] = ["single", "double"];
const data = heroData.layouts as Record<
  Layout,
  {
    plate: { src: string; sources: Array<{ src: string; width: number }> };
    opening: { x: number; y: number; w: number; h: number };
    matte: { band: number; sources: Array<{ src: string; width: number }> };
    doors: HeroDoor[];
  }
>;

/* Scroll choreography, as shares of the pinned track. */
const INTRO = [0, 0.34] as const; // copy eases away, camera pushes in
const REVEAL = [0.2, 0.48] as const; // gold line wipes in the new door
const UI = [0.4, 0.62] as const; // cards and door details slide in
const INTERACTIVE_P = 0.66; // where the arrows and toggle scroll to
const HEADER = 78;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const phase = (p: number, [a, b]: readonly [number, number]) => ease(clamp01((p - a) / (b - a)));
const wrap = (value: number, length: number) => ((value % length) + length) % length;
const srcSet = (sources: Array<{ src: string; width: number }>) =>
  sources.map((item) => `${item.src} ${item.width}w`).join(", ");
// The plate is drawn at "cover" size: as wide as the stage, or 16:9 of its height.
const PLATE_SIZES = "(max-aspect-ratio: 16/9) calc((100vh - 78px) * 1.78), 100vw";

const HERO_LIST = { id: "hero", name: "Home page hero" };

function heroDoor(door: HeroDoor, layout: Layout): DoorLike {
  return {
    id: door.id,
    name: door.name,
    layout,
    configuration: layout === "single" ? "Single door" : "Double door",
  };
}

function DoorIcon({ layout }: { layout: Layout }) {
  return layout === "single" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <rect x="7" y="3" width="10" height="18" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14.6" cy="12.5" r="0.9" fill="currentColor" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <rect x="3.5" y="3" width="17" height="18" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 3v18" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10.2" cy="12.5" r="0.85" fill="currentColor" />
      <circle cx="13.8" cy="12.5" r="0.85" fill="currentColor" />
    </svg>
  );
}

function Chevron({ dir }: { dir: -1 | 1 }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      <path
        d={dir < 0 ? "M14.5 5.5 8 12l6.5 6.5" : "M9.5 5.5 16 12l-6.5 6.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Leaving = { layout: Layout; door: HeroDoor; dir: number; key: number } | null;

export function HeroShowcase() {
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const motionRef = useRef(true);
  const headerRef = useRef(HEADER);

  const [layout, setLayout] = useState<Layout>("single");
  const [indices, setIndices] = useState<Record<Layout, number>>({ single: 0, double: 0 });
  const [dir, setDir] = useState(1);
  const [leaving, setLeaving] = useState<Leaving>(null);
  const [doubleReady, setDoubleReady] = useState(false);
  // The double plate loads lazily; the single plate stays up until it has.
  const [doubleLoaded, setDoubleLoaded] = useState(false);
  // The word behind the roofline only shows once the house matte is in front of it.
  const [matteReady, setMatteReady] = useState<Record<Layout, boolean>>({ single: false, double: false });
  const singleMatteRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = singleMatteRef.current;
    if (img?.complete && img.naturalWidth > 0) setMatteReady((value) => ({ ...value, single: true }));
  }, []);
  const [motion, setMotion] = useState(true);
  const [uiOn, setUiOn] = useState(false);
  const [copyOn, setCopyOn] = useState(true);
  const [announce, setAnnounce] = useState("");

  const doors = data[layout].doors;
  const index = indices[layout];
  const active = doors[index];

  /* ---------------- scroll progress ---------------- */
  useEffect(() => {
    const root = rootRef.current;
    const trackEl = trackRef.current;
    const stage = stageRef.current;
    if (!root || !trackEl || !stage) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let lastUi = false;
    let lastCopy = true;

    // The sticky site header wraps to two rows on narrow phones, so its real
    // height is measured and handed to the CSS (78 px is only the default).
    const header = document.querySelector<HTMLElement>(".site-header");
    const measureHeader = () => {
      const height = header ? Math.round(header.getBoundingClientRect().height) : HEADER;
      if (height !== headerRef.current) {
        headerRef.current = height;
        root.style.setProperty("--hx-top", `${height}px`);
      }
    };
    measureHeader();
    const headerObserver = header ? new ResizeObserver(() => {
      measureHeader();
      schedule();
    }) : null;
    if (header) headerObserver?.observe(header);

    const write = () => {
      frame = 0;
      if (!motionRef.current) return;
      const rect = trackEl.getBoundingClientRect();
      const total = trackEl.offsetHeight - stage.offsetHeight;
      const p = total > 0 ? clamp01((headerRef.current - rect.top) / total) : 0;
      progressRef.current = p;
      const reveal = phase(p, REVEAL);
      const ui = phase(p, UI);
      const intro = phase(p, INTRO);
      root.style.setProperty("--p", p.toFixed(4));
      root.style.setProperty("--intro", intro.toFixed(4));
      root.style.setProperty("--reveal", reveal.toFixed(4));
      root.style.setProperty("--ui", ui.toFixed(4));
      root.style.setProperty("--wipe", Math.min(1, reveal * 10, (1 - reveal) * 10).toFixed(3));
      const nextUi = ui > 0.5;
      const nextCopy = intro < 0.6;
      if (nextUi !== lastUi) {
        lastUi = nextUi;
        setUiOn(nextUi);
        if (nextUi) setDoubleReady(true); // prefetch the double plate once the switcher is up
      }
      if (nextCopy !== lastCopy) {
        lastCopy = nextCopy;
        setCopyOn(nextCopy);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    const applyMode = () => {
      const reduced = query.matches;
      motionRef.current = !reduced;
      setMotion(!reduced);
      if (reduced) {
        for (const name of ["--p", "--intro", "--reveal", "--ui", "--wipe"]) {
          root.style.removeProperty(name);
        }
        lastUi = true;
        lastCopy = true;
        setUiOn(true);
        setCopyOn(true);
      } else {
        lastUi = false;
        lastCopy = true;
        setUiOn(false);
        setCopyOn(true);
        schedule();
      }
    };
    applyMode();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    query.addEventListener("change", applyMode);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      headerObserver?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      query.removeEventListener("change", applyMode);
    };
  }, []);

  /** Before the switcher is up, a control first scrolls the visitor to it. */
  const ensureInteractive = useCallback(() => {
    const trackEl = trackRef.current;
    const stage = stageRef.current;
    if (!motionRef.current || !trackEl || !stage) return;
    if (progressRef.current >= UI[1] - 0.02) return;
    const total = trackEl.offsetHeight - stage.offsetHeight;
    const top = trackEl.getBoundingClientRect().top + window.scrollY - headerRef.current;
    window.scrollTo({ top: top + total * INTERACTIVE_P, behavior: "smooth" });
  }, []);

  /* ---------------- door changes ---------------- */
  const leaveTimer = useRef<number | undefined>(undefined);
  const goTo = useCallback(
    (target: number, method: Method, direction?: number) => {
      const list = data[layout].doors;
      const next = wrap(target, list.length);
      const current = indices[layout];
      ensureInteractive();
      if (next === current) return;
      const step = direction ?? (next > current ? 1 : -1);
      setDir(step);
      setLeaving({ layout, door: list[current], dir: step, key: Date.now() });
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(() => setLeaving(null), 700);
      setIndices((value) => ({ ...value, [layout]: next }));
      setAnnounce(`${list[next].name}, ${next + 1} of ${list.length}, ${layout} door`);
      // Every method here is a deliberate choice: the scroll-driven reveal never
      // changes doors, there is no auto-advance, and "wheel" only fires on a
      // clearly horizontal trackpad gesture. So all of them count as views.
      viewDoor(heroDoor(list[next], layout), { listId: HERO_LIST.id, listName: HERO_LIST.name, index: next });
      track("hero_door_change", { door_id: list[next].id, layout, method });
    },
    [ensureInteractive, indices, layout],
  );
  const step = useCallback(
    (delta: number, method: Method) => goTo(indices[layout] + delta, method, delta > 0 ? 1 : -1),
    [goTo, indices, layout],
  );

  const chooseLayout = (next: Layout) => {
    ensureInteractive();
    if (next === layout) return;
    if (next === "double") setDoubleReady(true);
    setLeaving(null);
    setLayout(next);
    const list = data[next].doors;
    const i = indices[next];
    setAnnounce(`${next === "single" ? "Single" : "Double"} door. ${list[i].name}, ${i + 1} of ${list.length}`);
    trackOption("layout", next);
    track("hero_layout_toggle", { layout: next });
  };

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  /* Preload the neighbors of the active door. */
  useEffect(() => {
    const list = data[layout].doors;
    for (const offset of [1, -1, 2]) {
      const img = new Image();
      img.src = list[wrap(index + offset, list.length)].cutout;
    }
  }, [index, layout]);

  /* Keep the active thumbnail in view on the phone rail without moving the page. */
  useEffect(() => {
    const rail = railRef.current;
    const item = rail?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!rail || !item) return;
    const left = item.offsetLeft - (rail.clientWidth - item.offsetWidth) / 2;
    rail.scrollTo({ left, behavior: motionRef.current ? "smooth" : "auto" });
  }, [index, layout]);

  /* ---------------- gestures ---------------- */
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Horizontal wheel or trackpad: act only when horizontal clearly dominates,
    // and let one gesture (including its inertia tail) move one door.
    let sum = 0;
    let lockedUntil = 0;
    let lastEvent = 0;
    const onWheel = (event: WheelEvent) => {
      const dx = event.deltaX;
      const dy = event.deltaY;
      if (Math.abs(dx) < 2 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      event.preventDefault(); // keeps the browser's back-swipe from firing
      const now = performance.now();
      if (now - lastEvent > 260) sum = 0;
      lastEvent = now;
      if (now < lockedUntil) {
        lockedUntil = now + 240; // still the same gesture
        return;
      }
      sum += dx;
      if (Math.abs(sum) > 36) {
        stepRef.current(sum > 0 ? 1 : -1, "wheel");
        sum = 0;
        lockedUntil = now + 480;
      }
    };
    // Touch swipe and mouse drag on the photo.
    let start: { x: number; y: number; id: number } | null = null;
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("a, button")) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    };
    const onUp = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        stepRef.current(dx < 0 ? 1 : -1, "swipe");
      }
    };
    const onCancel = () => {
      start = null;
    };
    view.addEventListener("wheel", onWheel, { passive: false });
    view.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      view.removeEventListener("wheel", onWheel);
      view.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1, "keyboard");
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1, "keyboard");
    }
  };

  /* ---------------- render helpers ---------------- */
  const neighborSlots = [-2, -1, 1, 2];

  const renderPlate = (which: Layout) => {
    const plate = data[which];
    const shown: Layout = layout === "double" && !doubleLoaded ? "single" : layout;
    const isActive = which === shown;
    const current = plate.doors[indices[which]];
    const opening: CSSProperties = {
      left: `${plate.opening.x * 100}%`,
      top: `${plate.opening.y * 100}%`,
      width: `${plate.opening.w * 100}%`,
      height: `${plate.opening.h * 100}%`,
    };
    const away = leaving && leaving.layout === which ? leaving : null;
    return (
      <div
        className="hx-plate"
        data-active={isActive}
        data-matte={matteReady[which] ? "ready" : undefined}
        aria-hidden={!isActive}
        key={which}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="hx-plate-img"
          src={plate.plate.src}
          srcSet={srcSet(plate.plate.sources)}
          sizes={PLATE_SIZES}
          width={3840}
          height={2160}
          alt={
            which === "single"
              ? "A stucco Las Vegas home with its single front door at the center of a covered entry"
              : "The same Las Vegas home with a double front door at the center of the covered entry"
          }
          fetchPriority={which === "single" ? "high" : "auto"}
          loading="eager"
          onLoad={which === "double" ? () => setDoubleLoaded(true) : undefined}
          decoding="async"
          draggable={false}
        />
        <span className="hx-word" aria-hidden="true">
          IRON
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="hx-matte"
          src={plate.matte.sources[0].src}
          srcSet={srcSet(plate.matte.sources)}
          sizes={PLATE_SIZES}
          alt=""
          aria-hidden="true"
          decoding="async"
          draggable={false}
          ref={which === "single" ? singleMatteRef : undefined}
          onLoad={() => setMatteReady((value) => (value[which] ? value : { ...value, [which]: true }))}
        />
        <div className="hx-opening" style={opening}>
          <div className="hx-doors">
            {away ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`out-${away.key}`}
                className="hx-door is-out"
                style={{ "--dir": away.dir } as CSSProperties}
                src={away.door.cutout}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.id}
              className={`hx-door${away ? " is-in" : ""}`}
              style={{ "--dir": dir } as CSSProperties}
              src={current.cutout}
              alt={`${current.name}, an Artistic Entrances iron ${which} door, shown in the entry`}
              decoding="async"
              draggable={false}
            />
            <span className="hx-porch" aria-hidden="true" />
          </div>
          <div className="hx-wipe" aria-hidden="true">
            <span />
          </div>
          <span className="hx-contact" aria-hidden="true" />
        </div>
      </div>
    );
  };

  const designHref = (id: string) => `/design-your-door?door=${encodeURIComponent(id)}`;
  const pickDoor = (door: HeroDoor, position: number) =>
    selectDoor(heroDoor(door, layout), HERO_LIST, { index: position });
  const plannerHref = (id: string) => `/planner?door=${encodeURIComponent(id)}`;

  return (
    <section
      ref={rootRef}
      className="hx"
      data-layout={layout}
      data-motion={motion ? "on" : "off"}
      aria-labelledby="hx-title"
    >
      <style>{`@media (prefers-reduced-motion: reduce) {${HERO_STATIC_CSS}}`}</style>
      <noscript>
        <style>{`${HERO_STATIC_CSS} .hx .hx-nav, .hx .hx-pill, .hx .hx-info, .hx .hx-rail { display: none; }`}</style>
      </noscript>
      <div className="hx-track" ref={trackRef}>
        <div
          className="hx-stage"
          ref={stageRef}
          onKeyDown={onKeyDown}
          role="region"
          aria-roledescription="carousel"
          aria-label="Iron doors shown on a sample home"
          tabIndex={0}
        >
          <div className="hx-view" ref={viewRef}>
            <div className="hx-scene">
              {renderPlate("single")}
              {doubleReady ? renderPlate("double") : null}
            </div>
            <div className="hx-vignette" aria-hidden="true" />

            <div className="hx-cards" inert={!uiOn}>
              {neighborSlots.map((slot) => {
                const i = wrap(index + slot, doors.length);
                const door = doors[i];
                if (doors.length < 5 && Math.abs(slot) === 2) return null;
                return (
                  <div
                    className="hx-card"
                    key={`${layout}-${door.id}`}
                    data-rank={Math.abs(slot)}
                    style={{ "--side": Math.sign(slot), "--rank": Math.abs(slot) } as CSSProperties}
                  >
                    <div className="hx-card-body">
                    <button
                      type="button"
                      className="hx-card-pick"
                      onClick={() => goTo(i, "card", Math.sign(slot))}
                      aria-label={`Show ${door.name} on the house`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={door.thumb} alt="" loading="lazy" decoding="async" draggable={false} />
                      <span className="hx-card-name">{door.name}</span>
                    </button>
                    <a
                      className="hx-card-link"
                      href={designHref(door.id)}
                      data-cta="hero_card_design_door"
                      onClick={() => pickDoor(door, i)}
                    >
                      Design this door
                    </a>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hx-nav">
              <button type="button" className="hx-arrow" data-dir="prev" onClick={() => step(-1, "button")}>
                <Chevron dir={-1} />
                <span className="hx-sr">Previous door</span>
              </button>
              <button type="button" className="hx-arrow" data-dir="next" onClick={() => step(1, "button")}>
                <Chevron dir={1} />
                <span className="hx-sr">Next door</span>
              </button>
            </div>

            <div className="hx-pill" role="group" aria-label="Door layout">
              {LAYOUTS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={layout === item}
                  onClick={() => chooseLayout(item)}
                >
                  <DoorIcon layout={item} />
                  <span>{item === "single" ? "Single" : "Double"}</span>
                  <span className="hx-sr"> door</span>
                </button>
              ))}
            </div>
          </div>

          <div className="hx-base" aria-hidden="true" />

          <div className="hx-copy" inert={!copyOn}>
            <div className="hx-copy-panel">
              <p className="hx-eyebrow">Las Vegas custom iron doors</p>
              <h1 id="hx-title">Custom Iron Entry Doors in Las Vegas</h1>
              <p className="hx-lede">
                Artistic Entrances designs iron entry doors for luxury homes in {business.city}.
                Choose a style, then the glass, handle, and finish. The showroom confirms
                measurements before anything is built.
              </p>
              <div className="hx-actions">
                <a className="hx-btn hx-btn-primary" href="/design-your-door" data-cta="design_your_door" data-cta-location="hero">
                  Design Your Door
                </a>
                <Link className="hx-btn hx-btn-ghost" href="/planner" data-cta="see_it_on_your_home" data-cta-location="hero">
                  See it on your home
                </Link>
              </div>
            </div>
          </div>

          <div className="hx-cue" aria-hidden="true">
            <span>Scroll to change the door</span>
            <i />
          </div>

          <div className="hx-rail" ref={railRef} inert={!uiOn}>
            {doors.map((door, i) => (
              <button
                key={door.id}
                type="button"
                aria-current={i === index}
                aria-label={`Show ${door.name}`}
                onClick={() => goTo(i, "rail")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={door.thumb} alt="" loading="lazy" decoding="async" draggable={false} />
              </button>
            ))}
          </div>

          <div className="hx-info" inert={!uiOn}>
            <p className="hx-info-line">
              <span className="hx-info-name">{active.name}</span>
              <span className="hx-info-count">
                {index + 1} of {doors.length}
              </span>
            </p>
            <div className="hx-info-actions">
              <a
                className="hx-btn hx-btn-primary"
                href={designHref(active.id)}
                data-cta="hero_design_this_door"
                onClick={() => pickDoor(active, index)}
              >
                Design This Door
              </a>
              <Link
                className="hx-btn hx-btn-ghost"
                href={plannerHref(active.id)}
                data-cta="hero_see_on_home"
                onClick={() => pickDoor(active, index)}
              >
                See It on Your Home
              </Link>
            </div>
          </div>

          <p className="hx-caption">Illustration. Catalog doors shown on a sample home.</p>
          <p className="hx-sr" aria-live="polite">
            {announce}
          </p>
        </div>
      </div>
    </section>
  );
}
