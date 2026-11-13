"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { catalog, optionById } from "@/lib/catalog";
import {
  currentDesignKey,
  type DoorDesign,
  designFromParams,
  findDoor,
  parseDesign,
  resolveDesign,
} from "@/lib/design";
import {
  DoorMark,
  Opening,
  OpeningDraft,
  PlannerView,
  defaultDoorMark,
  defaultOpeningDraft,
  fileToPreviewUrl,
  formatInches,
  handingLabel,
  markError,
  openingFromDraft,
  photoError,
  plannerSummary,
} from "@/lib/planner";
import { PhotoAligner } from "@/components/planner/PhotoAligner";
import { segmentDoor, warmSegmenter } from "@/lib/segment";
import { CleanPlate, boxMaskUrl, requestCleanPlate } from "@/lib/clean-plate";
import { TrackedDoorList } from "@/components/TrackedDoorList";
import {
  appendTrackingFields,
  beginQuote,
  leadSubmitted,
  formErrorReason,
  readJsonResponse,
  trackFormError,
  trackOption,
  trackStep,
  track,
  viewDoor,
  type DoorLike,
  type DoorOpts,
} from "@/lib/analytics";
import { recordInterest } from "@/lib/interest";

const EntryViewer = dynamic(
  () => import("@/components/planner/EntryViewer").then((mod) => mod.EntryViewer),
  {
    ssr: false,
    loading: () => <p className="planner-loading">Preparing the 3D entry…</p>,
  },
);

type DoorLayout = "all" | "single" | "double";
type Outlining = "idle" | "working" | "found" | "ready" | "missed" | "snapped" | "manual";
type Step = "door" | "opening" | "photo" | "walk" | "quote";

const steps: Array<{ id: Step; label: string }> = [
  { id: "door", label: "Door" },
  { id: "opening", label: "Opening" },
  { id: "photo", label: "Photo" },
  { id: "walk", label: "Walk" },
  { id: "quote", label: "Quote" },
];

const views: Array<{ id: PlannerView; label: string }> = [
  { id: "exterior", label: "Outside" },
  { id: "threshold", label: "Threshold" },
  { id: "inside", label: "Inside" },
];

const PLANNER_DOOR_LIST = { id: "planner_door_grid", name: "Planner door grid" };
const HOME_PREVIEW_LIST_OPTS = {
  listId: "planner_home_preview",
  listName: "On my home",
  funnelStage: "preview",
};
// A door must stay on the customer's home this long before it counts as seen.
const HOME_DWELL_MS = 3000;
// Photo and preview events all belong to the "preview" funnel stage.
const PREVIEW = { funnel_stage: "preview" } as const;

function doorLike(door: {
  id: string;
  name: string;
  configuration?: string;
  layout?: string;
}): DoorLike {
  return { id: door.id, name: door.name, configuration: door.configuration, layout: door.layout };
}

function namedOption(list: Array<{ id: string; name: string }>, id: string) {
  const found = optionById(list, id);
  return found ? { id: found.id, name: found.name } : undefined;
}

function designOpts(design: { glassId: string; finishId: string; handleId?: string }): DoorOpts {
  return {
    glass: namedOption(catalog.glass, design.glassId),
    finish: namedOption(catalog.finishes, design.finishId),
    handle: design.handleId ? namedOption(catalog.handles, design.handleId) : undefined,
  };
}

export function PlannerApp() {
  const params = useSearchParams();
  const requested = designFromParams(params);
  const requestedDoor = findDoor(requested.doorId);
  const startingDesign = resolveDesign(requestedDoor ?? catalog.doors[0], requested);

  const [step, setStep] = useState<Step>(requestedDoor ? "opening" : "door");
  const [doorId, setDoorId] = useState(startingDesign.doorId);
  const [glassId, setGlassId] = useState(startingDesign.glassId);
  const [finishId, setFinishId] = useState(startingDesign.finishId);
  const [handleId, setHandleId] = useState(startingDesign.handleId);
  const [layoutFilter, setLayoutFilter] = useState<DoorLayout>("all");
  // A design the customer brought from the designer stays first in the door
  // rail, so they can always get back to it.
  const [pinned, setPinned] = useState<DoorDesign | null>(
    requestedDoor && (requested.glassId || requested.finishId) ? startingDesign : null,
  );
  const [doorBusy, setDoorBusy] = useState(false);
  // The browser's saved design is read through an external-store subscription,
  // so the server render and the first client render both see "none".
  const savedRaw = useSyncExternalStore(subscribeToDesign, readSavedRaw, () => null);
  const savedDesign = useMemo(() => parseDesign(savedRaw), [savedRaw]);
  const [doorQuery, setDoorQuery] = useState("");
  const [visibleDoors, setVisibleDoors] = useState(24);
  const [draft, setDraft] = useState<OpeningDraft>(defaultOpeningDraft);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [insideFile, setInsideFile] = useState<File | null>(null);
  const [insideUrl, setInsideUrl] = useState<string | null>(null);
  const [insideMark, setInsideMark] = useState<DoorMark>(defaultDoorMark);
  const [insideOutlineUrl, setInsideOutlineUrl] = useState<string | null>(null);
  const [insideOutlining, setInsideOutlining] = useState<Outlining>("idle");
  const insideRun = useRef(0);
  const [openFile, setOpenFile] = useState<File | null>(null);
  const [mark, setMark] = useState<DoorMark>(defaultDoorMark);
  const [outlineUrl, setOutlineUrl] = useState<string | null>(null);
  const [outlining, setOutlining] = useState<Outlining>("idle");
  const outlineRun = useRef(0);
  const [plate, setPlate] = useState<CleanPlate | null>(null);
  const plateJob = useRef<{ timer: number; abort: AbortController } | null>(null);
  const [revealNonce, setRevealNonce] = useState(0);
  const [revealing, setRevealing] = useState(false);
  const [compare, setCompare] = useState(0);
  const [doorOpen, setDoorOpen] = useState(0);
  const [viewName, setViewName] = useState<PlannerView>("exterior");
  const [viewNonce, setViewNonce] = useState(0);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  const door = useMemo(
    () => catalog.doors.find((item) => item.id === doorId) ?? catalog.doors[0],
    [doorId],
  );
  const glass = optionById(catalog.glass, glassId) ?? catalog.glass[0];
  const handle = optionById(catalog.handles, handleId) ?? catalog.handles[0];
  const finish = optionById(catalog.finishes, finishId) ?? catalog.finishes[0];
  const currentStepIndex = steps.findIndex((item) => item.id === step);
  const filteredDoors = useMemo(() => {
    const query = doorQuery.trim().toLowerCase();
    return catalog.doors.filter((item) => {
      if (layoutFilter !== "all" && item.layout !== layoutFilter) return false;
      if (!query) return true;
      return [item.id, item.name, item.slug, item.style, item.configuration, item.layout]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [doorQuery, layoutFilter]);

  // The step the planner opens on, and a design carried over from the
  // designer in the link, each count once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    trackStep("planner", step, currentStepIndex + 1);
    if (requestedDoor && (requested.glassId || requested.finishId)) {
      track("planner_design_loaded", {
        door_id: startingDesign.doorId,
        glass_id: startingDesign.glassId,
        finish_id: startingDesign.finishId,
        source: "url",
      });
      viewDoor(doorLike(requestedDoor), designOpts(startingDesign));
    }
    // Runs once for the link the planner opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickDoor(id: string) {
    const next = findDoor(id);
    if (!next) return;
    const kept = resolveDesign(next, { glassId, finishId, handleId });
    setDoorId(kept.doorId);
    setGlassId(kept.glassId);
    setFinishId(kept.finishId);
    setHandleId(kept.handleId);
  }

  // Doors to step through while viewing the home: the same layout as the
  // door on screen, in catalog order, with the customer's own design first.
  const cycleDoors = useMemo(() => {
    const same = catalog.doors.filter((item) => item.layout === door.layout);
    const pin = pinned ? findDoor(pinned.doorId) : undefined;
    if (!pin || pin.layout !== door.layout) return same;
    return [pin, ...same.filter((item) => item.id !== pin.id)];
  }, [door.layout, pinned]);
  const cycleIndex = Math.max(0, cycleDoors.findIndex((item) => item.id === door.id));
  const neighborUrls = useMemo(() => {
    const count = cycleDoors.length;
    if (count < 2) return [];
    return [
      cycleDoors[(cycleIndex + 1) % count].imageUrl,
      cycleDoors[(cycleIndex - 1 + count) % count].imageUrl,
    ];
  }, [cycleDoors, cycleIndex]);

  function cycleTo(index: number, method: "arrow" | "thumbnail" | "keyboard") {
    const count = cycleDoors.length;
    if (!count) return;
    const nextIndex = ((index % count) + count) % count;
    const next = cycleDoors[nextIndex];
    if (next.id === door.id) return;
    if (pinned && next.id === pinned.doorId) {
      // Back to the customer's own design, with its glass and finish.
      const kept = resolveDesign(next, pinned);
      setDoorId(kept.doorId);
      setGlassId(kept.glassId);
      setFinishId(kept.finishId);
      setHandleId(kept.handleId);
    } else {
      pickDoor(next.id);
    }
    track("planner_door_cycle", {
      ...PREVIEW,
      door_id: next.id,
      from_door_id: door.id,
      method,
      index: nextIndex,
      layout: door.layout,
    });
  }

  function chooseOption(type: "glass" | "finish", id: string) {
    if (type === "glass") setGlassId(id);
    else setFinishId(id);
    trackOption(type, id, doorLike(door));
  }

  // A door counts as "shown on the customer's home" only after it has stayed on
  // screen in the Walk step for a few seconds: the timer restarts on every
  // door, glass, or finish change, waits out the reveal animation and the
  // door image loading, and stops when the customer leaves the step. Each
  // door + glass + finish counts once per page view.
  const homeSeen = useRef(new Set<string>());
  const quoteStarted = useRef(false);
  useEffect(() => {
    if (step !== "walk" || revealing || doorBusy) return;
    const key = `${door.id}|${glass.id}|${finish.id}`;
    if (homeSeen.current.has(key)) return;
    const timer = window.setTimeout(() => {
      homeSeen.current.add(key);
      const opts: DoorOpts = {
        glass: { id: glass.id, name: glass.name },
        finish: { id: finish.id, name: finish.name },
        ...HOME_PREVIEW_LIST_OPTS,
        // The preview below is this moment's interest; do not add a view on top.
        interest: false,
      };
      viewDoor(doorLike(door), opts);
      recordInterest("preview", door, { glassId: glass.id, finishId: finish.id });
    }, HOME_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [step, revealing, doorBusy, door, glass, finish]);

  function loadSavedDesign() {
    if (!savedDesign) return;
    const next = findDoor(savedDesign.doorId);
    if (!next) return;
    const kept = resolveDesign(next, savedDesign);
    setDoorId(kept.doorId);
    setGlassId(kept.glassId);
    setFinishId(kept.finishId);
    setHandleId(kept.handleId);
    setPinned(kept);
    track("planner_design_loaded", {
      door_id: kept.doorId,
      glass_id: kept.glassId,
      finish_id: kept.finishId,
      source: "saved",
    });
    viewDoor(doorLike(next), designOpts(kept));
    trackStep("planner", "opening", 2);
    setMessage("");
    setStep("opening");
    document.querySelector(".planner-page")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // The outline model is a few megabytes. Fetch it while the customer is
  // still entering measurements so the photo step feels instant.
  useEffect(() => {
    if (step === "opening" || step === "photo") warmSegmenter();
  }, [step]);

  function cancelCleanPlate() {
    if (!plateJob.current) return;
    window.clearTimeout(plateJob.current.timer);
    plateJob.current.abort.abort();
    plateJob.current = null;
  }

  // Painting the old door out is a paid server call, so it waits a moment in
  // case the customer taps again, and only the latest outline is sent.
  function startCleanPlate(url: string, maskUrl: string, snap = true) {
    cancelCleanPlate();
    setPlate(null);
    const abort = new AbortController();
    const timer = window.setTimeout(async () => {
      const report = (result: string, refined = false) =>
        track("planner_clean_plate", { ...PREVIEW, door_id: door.id, result, refined });
      try {
        const result = await requestCleanPlate(url, maskUrl, abort.signal);
        if (abort.signal.aborted) return;
        if (result.ok) {
          setPlate(result.plate);
          // The server found the whole door: fit the box to it, unless the
          // customer placed the box by hand (a drag cancels this request).
          if (snap && result.plate.door) {
            setMark(result.plate.door);
            setOutlineUrl(null);
            setOutlining("snapped");
          } else {
            setOutlining((now) => (now === "found" ? "ready" : now));
          }
        }
        // Without the server's help the phone's outline stands as it is.
        if (!result.ok) setOutlining((now) => (now === "found" ? "ready" : now));
        report(result.ok ? "ready" : result.reason, result.ok && result.plate.refined);
      } catch {
        if (abort.signal.aborted) return;
        setOutlining((now) => (now === "found" ? "ready" : now));
        report("error");
      }
    }, 1500);
    plateJob.current = { timer, abort };
  }

  useEffect(() => cancelCleanPlate, []);

  async function outlineDoor(
    url: string,
    point: { x: number; y: number },
    source: "auto" | "tap",
    photo: "front" | "inside" = "front",
  ) {
    const front = photo === "front";
    const counter = front ? outlineRun : insideRun;
    const setStatus = front ? setOutlining : setInsideOutlining;
    const run = (counter.current += 1);
    const report = (result: string) =>
      track("planner_outline", { ...PREVIEW, door_id: door.id, photo, source, result });
    setStatus("working");
    try {
      const outline = await segmentDoor(url, point);
      if (run !== counter.current) return;
      if (!outline) {
        setStatus("missed");
        report("missed");
        return;
      }
      (front ? setMark : setInsideMark)(outline.mark);
      (front ? setOutlineUrl : setInsideOutlineUrl)(outline.overlayUrl);
      setStatus("found");
      report("found");
      if (front) startCleanPlate(url, outline.maskUrl);
    } catch {
      if (run !== counter.current) return;
      setStatus("missed");
      report("error");
    }
  }

  function go(next: Step) {
    setMessage("");
    setStep(next);
    trackStep("planner", next, steps.findIndex((item) => item.id === next) + 1);
    document.querySelector(".planner-page")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function chooseFront(file: File | undefined) {
    if (!file) return;
    const error = photoError(file);
    if (error) {
      setMessage(error);
      return;
    }
    setReadingPhoto(true);
    setMessage("");
    try {
      const preview = await fileToPreviewUrl(file, 2048);
      setFrontFile(file);
      setPhotoUrl(preview);
      setMark(defaultDoorMark);
      setOutlineUrl(null);
      cancelCleanPlate();
      setPlate(null);
      track("planner_photo", { ...PREVIEW, door_id: door.id });
      // Most entry photos have the door near the middle, a little below center.
      void outlineDoor(preview, { x: 0.5, y: 0.55 }, "auto");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read that photo.");
    } finally {
      setReadingPhoto(false);
    }
  }

  async function chooseInside(file: File | undefined) {
    if (!file) return;
    const error = photoError(file);
    if (error) {
      setMessage(error);
      return;
    }
    setMessage("");
    try {
      const preview = await fileToPreviewUrl(file, 2048);
      setInsideFile(file);
      setInsideUrl(preview);
      setInsideMark(defaultDoorMark);
      setInsideOutlineUrl(null);
      track("planner_photo", { ...PREVIEW, door_id: door.id, photo: "inside" });
      void outlineDoor(preview, { x: 0.5, y: 0.55 }, "auto", "inside");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read that photo.");
    }
  }

  function removeInside() {
    insideRun.current += 1;
    setInsideFile(null);
    setInsideUrl(null);
    setInsideOutlineUrl(null);
    setInsideOutlining("idle");
  }

  function chooseOpen(file: File | undefined) {
    if (!file) return;
    const error = photoError(file);
    if (error) {
      setMessage(error);
      return;
    }
    setMessage("");
    setOpenFile(file);
    track("planner_photo", { ...PREVIEW, door_id: door.id, photo: "door_open" });
  }

  function continueOpening() {
    const result = openingFromDraft(draft);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setOpening(result.opening);
    go("photo");
  }

  function continuePhoto() {
    if (!frontFile || !photoUrl) {
      setMessage("Add a straight-on photo of the entry.");
      return;
    }
    const error = markError(mark) ?? (insideUrl ? markError(insideMark) : null);
    if (error) {
      setMessage(error);
      return;
    }
    setViewName("exterior");
    setViewNonce((value) => value + 1);
    setCompare(0);
    setRevealing(true);
    setRevealNonce((value) => value + 1);
    go("walk");
  }

  function replayReveal() {
    setDoorOpen(0);
    setCompare(0);
    setViewName("exterior");
    setRevealing(true);
    setViewNonce((value) => value + 1);
    setRevealNonce((value) => value + 1);
    track("planner_reveal_replay", { ...PREVIEW, door_id: door.id });
  }

  function showView(next: PlannerView) {
    setViewName(next);
    setViewNonce((value) => value + 1);
  }

  async function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!opening || !frontFile) return;
    setStatus("sending");
    setMessage("");

    const form = new FormData(event.currentTarget);
    form.set("leadType", "quote");
    form.set("doorId", door.id);
    form.set("doorName", door.name);
    form.set("configuration", door.configuration);
    form.set("doorImagePath", door.imageUrl);
    form.set("glassId", glass.id);
    form.set("glassName", glass.name);
    form.set("handleId", handle.id);
    form.set("handleName", handle.name);
    form.set("finishId", finish.id);
    form.set("finishName", finish.name);
    form.set("roughOpeningWidth", String(opening.width));
    form.set("roughOpeningHeight", String(opening.height));
    form.set("jambDepth", String(opening.jambDepth));
    form.set("hingeSide", opening.hingeSide);
    form.set("swing", opening.swing);
    form.set("plannerSummary", plannerSummary(door.name, opening, {
      glass: glass.name,
      handle: handle.name,
      finish: finish.name,
    }));
    form.set("leadSource", "entry-planner");
    form.set("sourceUrl", window.location.href);
    form.set("entryPhoto", frontFile);
    if (insideFile) form.set("entryPhoto2", insideFile);
    if (openFile) form.set("entryPhoto3", openFile);

    // Campaign, click ids, GA ids, and the doors previewed on the home.
    appendTrackingFields(form);

    try {
      const response = await fetch("/api/quote", { method: "POST", body: form });
      await readJsonResponse(response, "Unable to send quote");
      setStatus("success");
      leadSubmitted({
        leadType: "entry_planner",
        door: doorLike(door),
        opts: designOpts({ glassId: glass.id, finishId: finish.id, handleId: handle.id }),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
      });
    } catch (error) {
      setStatus("error");
      trackFormError("planner_quote", formErrorReason(error));
      setMessage(
        error instanceof Error
          ? error.message
          : "We could not send your request. Please try again.",
      );
    }
  }

  return (
    <>
      <div className="stepper planner-stepper" aria-label="Planner progress">
        {steps.map((item, index) => (
          <button
            className={index <= currentStepIndex ? "step active" : "step"}
            key={item.id}
            onClick={() => index < currentStepIndex && go(item.id)}
            type="button"
          >
            <span>{index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className={step === "walk" ? "planner-walk-layout" : "planner-layout"}>
        {step === "door" && (
          <section>
            <p className="eyebrow">Step 1 of 5</p>
            <h2>Choose a door</h2>
            <p className="section-copy">
              Pick the iron door you want to see in the entry. The preview uses
              this photo on a door sized to your opening.
            </p>
            {savedDesign && (
              <div className="planner-selected planner-design-card">
                <span className="door-thumb">
                  <Image
                    alt=""
                    fill
                    sizes="88px"
                    src={findDoor(savedDesign.doorId)?.thumbnailUrl ?? ""}
                    unoptimized
                  />
                </span>
                <div>
                  <p>Your design</p>
                  <strong>
                    {findDoor(savedDesign.doorId)?.name} · {designName(catalog.glass, savedDesign.glassId)} glass ·{" "}
                    {designName(catalog.finishes, savedDesign.finishId)} finish
                  </strong>
                </div>
                <button className="primary-action" onClick={loadSavedDesign} type="button">
                  View this door on my home
                </button>
              </div>
            )}
            <div className="layout-filter" role="group" aria-label="Door type">
              {(
                [
                  ["all", "All doors"],
                  ["single", "Single doors"],
                  ["double", "Double doors"],
                ] as const
              ).map(([id, label]) => (
                <button
                  aria-pressed={layoutFilter === id}
                  className={layoutFilter === id ? "selected" : ""}
                  key={id}
                  onClick={() => {
                    setLayoutFilter(id);
                    setVisibleDoors(24);
                    trackOption("layout", id);
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="door-search">
              Search doors
              <input
                onChange={(event) => {
                  setDoorQuery(event.target.value);
                  setVisibleDoors(24);
                }}
                placeholder="Search by door number or name"
                type="search"
                value={doorQuery}
              />
            </label>
            <p className="door-results-copy">
              Showing {Math.min(visibleDoors, filteredDoors.length)} of {filteredDoors.length} doors
            </p>
            <TrackedDoorList
              className="door-grid"
              doors={filteredDoors.slice(0, visibleDoors).map(doorLike)}
              listId={PLANNER_DOOR_LIST.id}
              listName={PLANNER_DOOR_LIST.name}
            >
              {filteredDoors.slice(0, visibleDoors).map((item) => (
                <button
                  aria-pressed={item.id === door.id}
                  data-door-id={item.id}
                  className={item.id === door.id ? "door-card selected" : "door-card"}
                  key={item.id}
                  onClick={() => pickDoor(item.id)}
                  type="button"
                >
                  <span className="door-thumb">
                    <Image alt={item.alt} fill sizes="150px" src={item.thumbnailUrl} unoptimized />
                  </span>
                  <strong>{item.name}</strong>
                  <small>{item.configuration}</small>
                </button>
              ))}
            </TrackedDoorList>
            {visibleDoors < filteredDoors.length && (
              <button
                className="secondary-action"
                onClick={() => setVisibleDoors((count) => count + 24)}
                type="button"
              >
                Load More Doors
              </button>
            )}
            <div className="button-row">
              <span />
              <button className="primary-action" onClick={() => go("opening")} type="button">
                Use this door
              </button>
            </div>
          </section>
        )}

        {step === "opening" && (
          <section>
            <p className="eyebrow">Step 2 of 5</p>
            <h2>Size the opening</h2>
            <p className="section-copy">
              Enter the rough opening, the wall thickness, and which way the door
              swings. These measurements size the preview. They are not a
              fabrication drawing.
            </p>
            <SelectedDoor
              door={door}
              finishName={finish.name}
              glassName={glass.name}
              onChange={() => go("door")}
            />
            <div className="quote-form planner-fields">
              <div className="field-row">
                <label>
                  Rough opening width (inches)
                  <input
                    inputMode="decimal"
                    min={24}
                    max={96}
                    onChange={(event) => setDraft({ ...draft, width: event.target.value })}
                    step="0.125"
                    type="number"
                    value={draft.width}
                  />
                </label>
                <label>
                  Rough opening height (inches)
                  <input
                    inputMode="decimal"
                    min={72}
                    max={120}
                    onChange={(event) => setDraft({ ...draft, height: event.target.value })}
                    step="0.125"
                    type="number"
                    value={draft.height}
                  />
                </label>
              </div>
              <label>
                Jamb depth / wall thickness (inches)
                <input
                  inputMode="decimal"
                  min={4}
                  max={12}
                  onChange={(event) => setDraft({ ...draft, jambDepth: event.target.value })}
                  step="0.0625"
                  type="number"
                  value={draft.jambDepth}
                />
              </label>
              <ChoiceGroup
                label="Hinge side, standing outside"
                onSelect={(hingeSide) => setDraft({ ...draft, hingeSide })}
                options={[
                  { id: "left", name: "Left hinge", description: "Hinges on your left as you face the door." },
                  { id: "right", name: "Right hinge", description: "Hinges on your right as you face the door." },
                ]}
                selected={draft.hingeSide}
              />
              <ChoiceGroup
                label="Swing"
                onSelect={(swing) => setDraft({ ...draft, swing })}
                options={[
                  { id: "in", name: "Inswing", description: "The door opens into the house." },
                  { id: "out", name: "Outswing", description: "The door opens toward the outside." },
                ]}
                selected={draft.swing}
              />
            </div>
            {message && <p className="form-error">{message}</p>}
            <div className="button-row">
              <button className="text-action" onClick={() => go("door")} type="button">
                Back
              </button>
              <button className="primary-action" onClick={continueOpening} type="button">
                Continue
              </button>
            </div>
          </section>
        )}

        {step === "photo" && (
          <section>
            <p className="eyebrow">Step 3 of 5</p>
            <h2>Mark the door on your home</h2>
            <p className="section-copy">
              Use a straight-on photo of the front entry. We outline your
              existing door for you. If the outline is off, tap the door in
              the photo or drag the box until it covers only the door.
            </p>
            <div className="quote-form">
              <label>
                Straight-on entry photo
                <input
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    void chooseFront(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
            </div>
            {readingPhoto && <p className="planner-note">Preparing the photo…</p>}
            {frontFile && <p className="planner-note">Using {frontFile.name}</p>}
            {photoUrl && (
              <p aria-live="polite" className="planner-note planner-outline-status">
                {outlining === "working" && "Finding your door…"}
                {outlining === "found" &&
                  "Door outlined. Fine-tuning the edges… If it is off, tap the door or drag a corner."}
                {outlining === "ready" && "Door outlined. If it is off, tap the door or drag a corner."}
                {outlining === "snapped" && "Box fitted to your whole door. Drag a corner if it needs a nudge."}
                {outlining === "manual" && "Got it. We will use the box where you placed it."}
                {outlining === "missed" &&
                  "We could not outline the door. Tap it in the photo, or drag the box over it."}
              </p>
            )}
            {photoUrl && (
              <PhotoAligner
                imageUrl={photoUrl}
                mark={mark}
                onChange={setMark}
                onAdjustEnd={(next) => {
                  setOutlineUrl(null);
                  setOutlining("manual");
                  track("planner_outline_adjust", { ...PREVIEW, door_id: door.id });
                  void photoAspect(photoUrl).then((aspect) =>
                    startCleanPlate(photoUrl, boxMaskUrl(next, aspect), false),
                  );
                }}
                onAdjustStart={() => {
                  // Stop anything that would move the box under the customer's finger.
                  outlineRun.current += 1;
                  cancelCleanPlate();
                }}
                onPick={(point) => void outlineDoor(photoUrl, point, "tap")}
                overlayUrl={outlineUrl}
              />
            )}
            <div className="planner-extra">
              <p className="eyebrow">Optional</p>
              <h3>Add the view from inside</h3>
              <p className="planner-note">
                Stand inside, face the door straight on, and fit the whole door
                in the frame. The Inside view then shows your own entry around
                the new door. Without it, we show a neutral foyer.
              </p>
              <div className="quote-form">
                <label>
                  Photo from inside, door closed
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      void chooseInside(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                    type="file"
                  />
                </label>
              </div>
              {insideUrl && (
                <>
                  <p aria-live="polite" className="planner-note planner-outline-status">
                    {insideOutlining === "working" && "Finding your door…"}
                    {insideOutlining === "found" &&
                      "Door outlined. Tap the photo or drag the corners to adjust."}
                    {insideOutlining === "missed" &&
                      "We could not outline the door. Tap it in the photo, or drag the box over it."}
                  </p>
                  <PhotoAligner
                    imageUrl={insideUrl}
                    mark={insideMark}
                    onChange={setInsideMark}
                    onAdjustEnd={() => {
                      setInsideOutlineUrl(null);
                      setInsideOutlining("manual");
                    }}
                    onAdjustStart={() => {
                      insideRun.current += 1;
                    }}
                    onPick={(point) => void outlineDoor(insideUrl, point, "tap", "inside")}
                    overlayUrl={insideOutlineUrl}
                  />
                  <button className="text-action" onClick={removeInside} type="button">
                    Remove the inside photo
                  </button>
                </>
              )}
            </div>
            <div className="planner-extra">
              <p className="eyebrow">Optional</p>
              <h3>Add a photo with the door open</h3>
              <p className="planner-note">
                From outside, open the door all the way and take one more photo.
                It shows us the jamb, the threshold, and the swing, so we can
                confirm the fit. It is sent with your quote and is not used in
                the 3D view.
              </p>
              <div className="quote-form">
                <label>
                  Photo from outside, door open
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      chooseOpen(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                    type="file"
                  />
                </label>
              </div>
              {openFile && (
                <ul className="planner-files">
                  <li>
                    <span>{openFile.name}</span>
                    <button className="text-action" onClick={() => setOpenFile(null)} type="button">
                      Remove
                    </button>
                  </li>
                </ul>
              )}
            </div>
            {message && <p className="form-error">{message}</p>}
            <div className="button-row">
              <button className="text-action" onClick={() => go("opening")} type="button">
                Back
              </button>
              <button
                className="primary-action"
                disabled={readingPhoto}
                onClick={continuePhoto}
                type="button"
              >
                Walk the entry
              </button>
            </div>
          </section>
        )}

        {step === "walk" && opening && photoUrl && (
          <section className="planner-stage">
            <div className="planner-stage-copy">
              <p className="eyebrow">Step 4 of 5</p>
              <h2>Walk the entry</h2>
              <p className="section-copy">
                {door.name} in a {formatInches(opening.width)} by {formatInches(opening.height)} rough
                opening. {handingLabel(opening)}. Only your door and frame are
                replaced; the rest is your photo as taken.
              </p>
            </div>
            <div
              className="planner-browse"
              onKeyDown={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("input, select, textarea")) return;
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                cycleTo(cycleIndex + (event.key === "ArrowRight" ? 1 : -1), "keyboard");
              }}
            >
            <div
              aria-busy={doorBusy}
              aria-label={`${door.name} on your entry. Use the left and right arrow keys to change the door.`}
              className="planner-viewer"
              role="group"
              tabIndex={0}
            >
            <EntryViewer
              doorImageUrl={door.imageUrl}
              glass={glass}
              finish={finish}
              onBusyChange={setDoorBusy}
              preloadDoorUrls={neighborUrls}
              compare={compare}
              interiorMark={insideMark}
              interiorPhotoUrl={insideUrl}
              doorOpen={doorOpen}
              mark={mark}
              onRevealEnd={() => setRevealing(false)}
              opening={opening}
              photoUrl={photoUrl}
              plateUrl={plate?.plateUrl}
              removed={plate?.removed}
              revealNonce={revealNonce}
              viewName={viewName}
              viewNonce={viewNonce}
            />
              {cycleDoors.length > 1 && (
                <>
                  <button
                    className="planner-arrow"
                    data-busy={doorBusy || undefined}
                    data-dir="prev"
                    onClick={() => cycleTo(cycleIndex - 1, "arrow")}
                    type="button"
                  >
                    <Chevron dir={-1} />
                    <span className="sr-only">Previous door</span>
                  </button>
                  <button
                    className="planner-arrow"
                    data-busy={doorBusy || undefined}
                    data-dir="next"
                    onClick={() => cycleTo(cycleIndex + 1, "arrow")}
                    type="button"
                  >
                    <Chevron dir={1} />
                    <span className="sr-only">Next door</span>
                  </button>
                </>
              )}
            </div>
            <p aria-live="polite" className="planner-cycle-label">
              <strong>{door.name}</strong>
              {pinned?.doorId === door.id && <span className="planner-badge">Your design</span>}
              <span>
                {cycleIndex + 1} of {cycleDoors.length} {door.layout} doors
              </span>
            </p>
            <DoorRail
              busy={doorBusy}
              current={cycleIndex}
              doors={cycleDoors}
              onPick={(index) => cycleTo(index, "thumbnail")}
              pinnedId={pinned?.doorId ?? null}
            />
            </div>
            <div className="planner-options">
              <fieldset className="planner-option-row">
                <legend>
                  Glass <span>{glass.name}</span>
                </legend>
                <div className="planner-chips">
                  {catalog.glass
                    .filter((item) => door.availableGlassIds.includes(item.id))
                    .map((item) => (
                      <button
                        aria-pressed={item.id === glass.id}
                        className="planner-chip"
                        key={item.id}
                        onClick={() => chooseOption("glass", item.id)}
                        type="button"
                      >
                        {item.name}
                      </button>
                    ))}
                </div>
              </fieldset>
              <fieldset className="planner-option-row">
                <legend>
                  Finish <span>{finish.name}</span>
                </legend>
                <div className="planner-swatches">
                  {catalog.finishes
                    .filter((item) => door.availableFinishIds.includes(item.id))
                    .map((item) =>
                      item.id === "as-shown" ? (
                        <button
                          aria-pressed={item.id === finish.id}
                          className="planner-chip planner-chip-small"
                          key={item.id}
                          onClick={() => chooseOption("finish", item.id)}
                          type="button"
                        >
                          As shown
                        </button>
                      ) : (
                        <button
                          aria-label={item.name}
                          aria-pressed={item.id === finish.id}
                          className="planner-swatch"
                          key={item.id}
                          onClick={() => chooseOption("finish", item.id)}
                          title={item.name}
                          type="button"
                        >
                          <span style={{ background: item.hex }} />
                        </button>
                      ),
                    )}
                </div>
              </fieldset>
            </div>
            <div className="planner-hud">
              <div className="planner-views" role="group" aria-label="Camera views">
                {views
                  .filter((view) => view.id !== "inside" || insideUrl)
                  .map((view) => (
                  <button
                    aria-pressed={view.id === viewName}
                    className={view.id === viewName ? "planner-view selected" : "planner-view"}
                    key={view.id}
                    onClick={() => showView(view.id)}
                    type="button"
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              <div className="planner-reveal">
                <button
                  className="planner-view"
                  disabled={revealing}
                  onClick={replayReveal}
                  type="button"
                >
                  {revealing ? "Revealing…" : "Replay the reveal"}
                </button>
                <label className="planner-open">
                  <span className="planner-compare-ends">
                    <span>New door</span>
                    <span>Your door today</span>
                  </span>
                  <input
                    aria-label="Compare the new door with your door today"
                    disabled={revealing}
                    max={100}
                    min={0}
                    onChange={(event) => setCompare(Number(event.target.value) / 100)}
                    onPointerUp={() => track("planner_compare", { ...PREVIEW, door_id: door.id })}
                    type="range"
                    value={Math.round(compare * 100)}
                  />
                </label>
              </div>
              <label className="planner-open">
                Open the door
                <input
                  max={100}
                  min={0}
                  onChange={(event) => setDoorOpen(Number(event.target.value) / 100)}
                  type="range"
                  value={Math.round(doorOpen * 100)}
                />
              </label>
            </div>
            <p className="planner-note">
              Drag to look and pinch or scroll to move closer.
              {!insideUrl &&
                " To see the door from inside, go back and add a photo from inside."}
            </p>
            <p className="preview-disclaimer">
              This is a visual preview sized from the measurements you entered.
              It is not a fabrication or installation drawing. Artistic Entrances
              confirms fit before anything is built.
            </p>
            <div className="button-row">
              <button className="text-action" onClick={() => go("photo")} type="button">
                Back
              </button>
              <button className="primary-action" onClick={() => go("quote")} type="button">
                Request a quote
              </button>
            </div>
          </section>
        )}

        {step === "quote" && opening && status !== "success" && (
          <section>
            <p className="eyebrow">Step 5 of 5</p>
            <h2>Request your quote</h2>
            <p className="section-copy">
              Your door, opening, swing, and photos are included with this request.
            </p>
            <div className="summary-card">
              <SummaryRow label="Door" value={door.name} />
              <SummaryRow label="Glass" value={glass.name} />
              <SummaryRow label="Handle" value={handle.name} />
              <SummaryRow label="Finish" value={finish.name} />
              <SummaryRow label="Opening" value={`${formatInches(opening.width)} × ${formatInches(opening.height)}`} />
              <SummaryRow label="Jamb depth" value={formatInches(opening.jambDepth)} />
              <SummaryRow label="Handing" value={handingLabel(opening)} />
            </div>
            <form
              className="quote-form"
              onFocus={() => {
                if (quoteStarted.current) return;
                quoteStarted.current = true;
                beginQuote(
                  doorLike(door),
                  designOpts({ glassId: glass.id, finishId: finish.id, handleId: handle.id }),
                  "entry_planner",
                );
              }}
              onSubmit={submitQuote}
            >
              <input aria-hidden="true" className="honeypot" name="website" tabIndex={-1} autoComplete="off" />
              <div className="field-row">
                <label>
                  First name
                  <input name="firstName" required autoComplete="given-name" />
                </label>
                <label>
                  Last name
                  <input name="lastName" required autoComplete="family-name" />
                </label>
              </div>
              <label>
                Email
                <input name="email" required type="email" autoComplete="email" />
              </label>
              <div className="field-row">
                <label>
                  Phone
                  <input name="phone" required type="tel" autoComplete="tel" />
                </label>
                <label>
                  ZIP code
                  <input
                    autoComplete="postal-code"
                    inputMode="numeric"
                    name="zip"
                    pattern="[0-9]{5}(-[0-9]{4})?"
                    required
                  />
                </label>
              </div>
              <div className="field-row">
                <label>
                  I am a
                  <select name="customerType" required defaultValue="">
                    <option disabled value="">Choose one</option>
                    <option value="homeowner">Homeowner</option>
                    <option value="contractor">Contractor</option>
                    <option value="builder">Home builder</option>
                  </select>
                </label>
                <label>
                  Project timeline
                  <select name="timeline" required defaultValue="">
                    <option disabled value="">Choose one</option>
                    <option value="0-3-months">0–3 months</option>
                    <option value="3-6-months">3–6 months</option>
                    <option value="6-plus-months">6+ months</option>
                    <option value="researching">Just researching</option>
                  </select>
                </label>
              </div>
              <label>
                Project notes
                <textarea
                  name="notes"
                  rows={4}
                  placeholder="Sidelights, installation questions, or anything else we should know"
                />
              </label>
              <label className="consent">
                <input name="smsConsent" required type="checkbox" value="yes" />
                <span>
                  I agree to receive calls and text messages about my quote.
                  Message and data rates may apply. Consent is not a condition
                  of purchase.
                </span>
              </label>
              {status === "error" && <p className="form-error">{message}</p>}
              <button className="primary-action" disabled={status === "sending"} type="submit">
                {status === "sending" ? "Sending Request…" : "Request My Quote"}
              </button>
            </form>
            <button className="text-action" onClick={() => go("walk")} type="button">
              Back to the preview
            </button>
          </section>
        )}

        {status === "success" && (
          <section className="success-state" role="status">
            <span>✓</span>
            <p className="eyebrow">Preview received</p>
            <h2>Thank You</h2>
            <p>
              Your entry preview, measurements, and photos have been sent to
              Artistic Entrances. A team member will review the details and
              contact you.
            </p>
          </section>
        )}
      </div>
    </>
  );
}

function photoAspect(url: string) {
  return new Promise<number>((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve(image.width / Math.max(1, image.height));
    image.onerror = () => resolve(3 / 4);
    image.src = url;
  });
}

function subscribeToDesign(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readSavedRaw() {
  try {
    return window.localStorage.getItem(currentDesignKey);
  } catch {
    return null;
  }
}

function designName(options: ReadonlyArray<{ id: string; name: string }>, id: string) {
  return options.find((option) => option.id === id)?.name ?? "";
}

function SelectedDoor({
  door,
  glassName,
  finishName,
  onChange,
}: {
  door: (typeof catalog.doors)[number];
  glassName: string;
  finishName: string;
  onChange: () => void;
}) {
  return (
    <div className="planner-selected">
      <span className="door-thumb">
        <Image alt="" fill sizes="88px" src={door.thumbnailUrl} unoptimized />
      </span>
      <div>
        <p>{door.style}</p>
        <strong>{door.name}</strong>
        <p>{glassName} glass · {finishName} finish</p>
      </div>
      <button className="text-action" onClick={onChange} type="button">
        Change door
      </button>
    </div>
  );
}

function ChoiceGroup<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: Array<{ id: T; name: string; description: string }>;
  selected: T;
  onSelect: (id: T) => void;
}) {
  return (
    <fieldset className="option-group">
      <legend>{label}</legend>
      <div className="option-list">
        {options.map((option) => (
          <button
            aria-pressed={option.id === selected}
            className={option.id === selected ? "option selected" : "option"}
            key={option.id}
            onClick={() => onSelect(option.id)}
            type="button"
          >
            <span>
              <strong>{option.name}</strong>
              <small>{option.description}</small>
            </span>
            <i>{option.id === selected ? "✓" : ""}</i>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Chevron({ dir }: { dir: -1 | 1 }) {
  return (
    <svg aria-hidden="true" height="22" viewBox="0 0 24 24" width="22">
      <path
        d={dir < 0 ? "M14.5 5.5 8 12l6.5 6.5" : "M9.5 5.5 16 12l-6.5 6.5"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

const RAIL_ITEM = 60;
const RAIL_GAP = 8;
const RAIL_STEP = RAIL_ITEM + RAIL_GAP;
/** Thumbnails drawn beyond each edge of the rail, so scrolling stays smooth. */
const RAIL_BUFFER = 4;

/**
 * Thumbnails of the doors to step through, with the current door centered.
 * Only the thumbnails near the visible part of the rail are mounted.
 */
function DoorRail({
  doors,
  current,
  pinnedId,
  busy,
  onPick,
}: {
  doors: ReadonlyArray<(typeof catalog.doors)[number]>;
  current: number;
  pinnedId: string | null;
  busy: boolean;
  onPick: (index: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(() => ({ left: current * RAIL_STEP, width: 340 }));

  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() =>
        setView({ left: box.scrollLeft, width: box.clientWidth }),
      );
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(box);
    box.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      box.removeEventListener("scroll", measure);
    };
  }, []);

  // Keep the current door in the middle of the rail.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ left: current * RAIL_STEP, behavior: still ? "auto" : "smooth" });
  }, [current]);

  const pad = Math.max(0, (view.width - RAIL_ITEM) / 2);
  const first = Math.max(0, Math.floor((view.left - pad) / RAIL_STEP) - RAIL_BUFFER);
  const last = Math.min(
    doors.length - 1,
    Math.ceil((view.left + view.width - pad) / RAIL_STEP) + RAIL_BUFFER,
  );
  const shown: number[] = [];
  for (let index = first; index <= last; index += 1) shown.push(index);

  return (
    <div aria-label="Doors to try" className="planner-rail" ref={scroller} role="group">
      <div
        className="planner-rail-track"
        style={{ width: pad * 2 + doors.length * RAIL_STEP - RAIL_GAP }}
      >
        {shown.map((index) => {
          const item = doors[index];
          const pinned = item.id === pinnedId;
          return (
            <button
              aria-current={index === current}
              aria-label={`Show ${item.name}${pinned ? ", your design" : ""}`}
              className="planner-rail-item"
              data-busy={(index === current && busy) || undefined}
              key={item.id}
              onClick={() => onPick(index)}
              style={{ left: pad + index * RAIL_STEP, width: RAIL_ITEM }}
              type="button"
            >
              <Image alt="" fill sizes={`${RAIL_ITEM}px`} src={item.thumbnailUrl} unoptimized />
              {pinned && <span className="planner-rail-badge">Your design</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
