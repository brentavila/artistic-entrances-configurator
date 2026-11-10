"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { catalog, optionById } from "@/lib/catalog";
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

const EntryViewer = dynamic(
  () => import("@/components/planner/EntryViewer").then((mod) => mod.EntryViewer),
  {
    ssr: false,
    loading: () => <p className="planner-loading">Preparing the 3D entry…</p>,
  },
);

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

function track(event: string, values: Record<string, unknown> = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...values });
}

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function PlannerApp() {
  const params = useSearchParams();
  const requestedId = params.get("door");
  const requestedDoor = catalog.doors.find((item) => item.id === requestedId);

  const [step, setStep] = useState<Step>(requestedDoor ? "opening" : "door");
  const [doorId, setDoorId] = useState(requestedDoor?.id ?? catalog.doors[0].id);
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
  const glass = optionById(catalog.glass, door.availableGlassIds[0]) ?? catalog.glass[0];
  const handle = optionById(catalog.handles, door.availableHandleIds[0]) ?? catalog.handles[0];
  const finish = optionById(catalog.finishes, door.availableFinishIds[0]) ?? catalog.finishes[0];
  const currentStepIndex = steps.findIndex((item) => item.id === step);
  const filteredDoors = useMemo(() => {
    const query = doorQuery.trim().toLowerCase();
    if (!query) return catalog.doors;
    return catalog.doors.filter((item) =>
      [item.id, item.name, item.slug, item.style, item.configuration]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [doorQuery]);

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
        track("planner_clean_plate", { door_id: door.id, result, refined });
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
      track("planner_outline", { door_id: door.id, photo, source, result });
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
    if (next === "opening" && step === "door") {
      track("planner_start", { door_id: door.id });
    }
    if (next === "walk") track("planner_view", { door_id: door.id });
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
      track("planner_photo", { door_id: door.id });
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
      track("planner_photo", { door_id: door.id, photo: "inside" });
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
    track("planner_photo", { door_id: door.id, photo: "door_open" });
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
    track("planner_reveal_replay", { door_id: door.id });
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
    form.set("plannerSummary", plannerSummary(door.name, opening));
    form.set("leadSource", "entry-planner");
    form.set("sourceUrl", window.location.href);
    form.set("entryPhoto", frontFile);
    if (insideFile) form.set("entryPhoto2", insideFile);
    if (openFile) form.set("entryPhoto3", openFile);

    const query = new URLSearchParams(window.location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "gclid"].forEach((key) => {
      const value = query.get(key);
      if (value) form.set(key, value);
    });

    try {
      const response = await fetch("/api/quote", { method: "POST", body: form });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Unable to send quote");
      setStatus("success");
      track("planner_complete", { door_id: door.id });
      track("generate_lead", { door_id: door.id, lead_type: "entry_planner" });
    } catch (error) {
      setStatus("error");
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
            <div className="door-grid">
              {filteredDoors.slice(0, visibleDoors).map((item) => (
                <button
                  aria-pressed={item.id === door.id}
                  className={item.id === door.id ? "door-card selected" : "door-card"}
                  key={item.id}
                  onClick={() => setDoorId(item.id)}
                  type="button"
                >
                  <span className="door-thumb">
                    <Image alt={item.alt} fill sizes="150px" src={item.thumbnailUrl} unoptimized />
                  </span>
                  <strong>{item.name}</strong>
                  <small>{item.configuration}</small>
                </button>
              ))}
            </div>
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
            <SelectedDoor door={door} onChange={() => go("door")} />
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
                  track("planner_outline_adjust", { door_id: door.id });
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
            <EntryViewer
              doorImageUrl={door.imageUrl}
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
                    onPointerUp={() => track("planner_compare", { door_id: door.id })}
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
              <SummaryRow label="Opening" value={`${formatInches(opening.width)} × ${formatInches(opening.height)}`} />
              <SummaryRow label="Jamb depth" value={formatInches(opening.jambDepth)} />
              <SummaryRow label="Handing" value={handingLabel(opening)} />
            </div>
            <form className="quote-form" onSubmit={submitQuote}>
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

function SelectedDoor({
  door,
  onChange,
}: {
  door: (typeof catalog.doors)[number];
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
