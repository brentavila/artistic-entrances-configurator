"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { FormEvent, useMemo, useState } from "react";
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

const EntryViewer = dynamic(
  () => import("@/components/planner/EntryViewer").then((mod) => mod.EntryViewer),
  {
    ssr: false,
    loading: () => <p className="planner-loading">Preparing the 3D entry…</p>,
  },
);

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
  const [extras, setExtras] = useState<File[]>([]);
  const [mark, setMark] = useState<DoorMark>(defaultDoorMark);
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read that photo.");
    } finally {
      setReadingPhoto(false);
    }
  }

  function addExtra(file: File | undefined) {
    if (!file) return;
    const error = photoError(file);
    if (error) {
      setMessage(error);
      return;
    }
    setMessage("");
    setExtras((current) => (current.length >= 3 ? current : [...current, file]));
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
    const error = markError(mark);
    if (error) {
      setMessage(error);
      return;
    }
    setViewName("exterior");
    setViewNonce((value) => value + 1);
    go("walk");
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
    form.set("doorId", door.id);
    form.set("doorName", door.name);
    form.set("configuration", door.configuration);
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
    extras.forEach((file, index) => form.set(`entryPhoto${index + 2}`, file));

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
              Use a straight-on photo of the front entry. Drag the box until it
              covers only the existing door. The rest of the photo becomes the
              wall around the new door.
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
            {photoUrl && <PhotoAligner imageUrl={photoUrl} mark={mark} onChange={setMark} />}
            <div className="quote-form">
              <label>
                Other photos, up to 3 (optional)
                <input
                  accept="image/jpeg,image/png,image/webp"
                  disabled={extras.length >= 3}
                  onChange={(event) => {
                    addExtra(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
            </div>
            <p className="planner-note">
              Side, interior, and detail photos are sent with your quote. They are
              not used in the 3D view.
            </p>
            {extras.length > 0 && (
              <ul className="planner-files">
                {extras.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${index}`}>
                    <span>{file.name}</span>
                    <button
                      className="text-action"
                      onClick={() => setExtras(extras.filter((_, item) => item !== index))}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
                opening. {handingLabel(opening)}. Drag to look around, and scroll
                to move closer. On a desktop, Walk uses the mouse and WASD keys.
              </p>
            </div>
            <EntryViewer
              doorImageUrl={door.imageUrl}
              doorOpen={doorOpen}
              mark={mark}
              opening={opening}
              photoUrl={photoUrl}
              viewName={viewName}
              viewNonce={viewNonce}
            />
            <div className="planner-hud">
              <div className="planner-views" role="group" aria-label="Camera views">
                {views.map((view) => (
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
                <button className="planner-view planner-walk" id="planner-walk" type="button">
                  Walk
                </button>
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
              Drag to look and scroll to move closer. On desktop, Walk captures
              the mouse: use WASD, then Escape to stop. Open the door before
              you step through.
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
