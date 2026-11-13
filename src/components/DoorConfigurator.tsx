"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DoorPreview } from "@/components/DoorPreview";
import { catalog, optionById } from "@/lib/catalog";
import {
  choiceById,
  jambOptions,
  lockOptions,
  screenOptions,
  sidelightOptions,
} from "@/lib/design-options";
import { isGreaterLasVegasZip, zip5 } from "@/lib/service-area";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

type Step = "door" | "details" | "review" | "quote";
type DoorLayout = "all" | "single" | "double";

type SavedDesign = {
  id: string;
  savedAt: string;
  doorId: string;
  doorName: string;
  glassId: string;
  handleId: string;
  finishId: string;
  lockId: string;
  screenId: string;
  sidelightId: string;
  jambId: string;
};

const currentDesignKey = "ae-current-design";
const savedDesignsKey = "ae-saved-doors";

const steps: Array<{ id: Step; label: string }> = [
  { id: "door", label: "Door" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
  { id: "quote", label: "Quote" },
];

function track(event: string, values: Record<string, unknown> = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...values });
}

export function DoorConfigurator() {
  const params = useSearchParams();
  const requestedDoor = params.get("door");
  const startingDoor =
    catalog.doors.find(
      (item) => item.id === requestedDoor || item.slug === requestedDoor,
    ) ?? catalog.doors[0];
  const [step, setStep] = useState<Step>("door");
  const [doorId, setDoorId] = useState(startingDoor.id);
  const [glassId, setGlassId] = useState(
    knownId(catalog.glass, params.get("glass")) ?? catalog.glass[0].id,
  );
  const [handleId, setHandleId] = useState(
    knownId(catalog.handles, params.get("handle")) ?? catalog.handles[0].id,
  );
  const [finishId, setFinishId] = useState(
    knownId(catalog.finishes, params.get("finish")) ?? catalog.finishes[0].id,
  );
  const [lockId, setLockId] = useState(
    knownId(lockOptions, params.get("lock")) ?? lockOptions[0].id,
  );
  const [screenId, setScreenId] = useState(
    knownId(screenOptions, params.get("screen")) ?? screenOptions[0].id,
  );
  const [sidelightId, setSidelightId] = useState(
    knownId(sidelightOptions, params.get("sidelight")) ?? sidelightOptions[0].id,
  );
  const [jambId, setJambId] = useState(
    knownId(jambOptions, params.get("jamb")) ?? jambOptions[0].id,
  );
  const [layoutFilter, setLayoutFilter] = useState<DoorLayout>("all");
  const [savedDoors, setSavedDoors] = useState<SavedDesign[]>([]);
  const [saveNote, setSaveNote] = useState("");
  const hydrated = useRef(false);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [mockupEligible, setMockupEligible] = useState(false);
  const [zipHint, setZipHint] = useState("");
  const [doorQuery, setDoorQuery] = useState(requestedDoor ? startingDoor.name : "");
  const [visibleDoors, setVisibleDoors] = useState(24);

  const door = useMemo(
    () => catalog.doors.find((item) => item.id === doorId) ?? catalog.doors[0],
    [doorId],
  );
  const glass = optionById(catalog.glass, glassId) ?? catalog.glass[0];
  const handle = optionById(catalog.handles, handleId) ?? catalog.handles[0];
  const finish = optionById(catalog.finishes, finishId) ?? catalog.finishes[0];
  const lock = choiceById(lockOptions, lockId);
  const screen = choiceById(screenOptions, screenId);
  const sidelight = choiceById(sidelightOptions, sidelightId);
  const jamb = choiceById(jambOptions, jambId);
  const currentStepIndex = steps.findIndex((item) => item.id === step);
  const filteredDoors = useMemo(() => {
    const query = doorQuery.trim().toLowerCase();
    return catalog.doors.filter((item) => {
      if (layoutFilter !== "all" && item.layout !== layoutFilter) return false;
      if (!query) return true;
      const haystack = [
        item.id,
        item.name,
        item.slug,
        item.style,
        item.configuration,
        item.layout,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [doorQuery, layoutFilter]);

  useEffect(() => {
    const saved = readSavedDesigns();
    setSavedDoors(saved);
    const hasDesignParams = ["glass", "handle", "finish", "lock", "screen", "sidelight", "jamb"].some(
      (key) => params.get(key),
    );
    if (!hasDesignParams) {
      const current = readCurrentDesign();
      // A door named in the link (for example from the home page) always
      // wins; the saved options still come back with it.
      const doorFromLink =
        startingDoor.id === requestedDoor || startingDoor.slug === requestedDoor;
      if (current) applyDesign(doorFromLink ? { ...current, doorId: undefined } : current);
    }
    hydrated.current = true;
    // Restore once. Later edits write the current design back to this browser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const current: SavedDesign = {
      id: "current",
      savedAt: new Date().toISOString(),
      doorId,
      doorName: door.name,
      glassId,
      handleId,
      finishId,
      lockId,
      screenId,
      sidelightId,
      jambId,
    };
    window.localStorage.setItem(currentDesignKey, JSON.stringify(current));
    const query = new URLSearchParams(window.location.search);
    query.set("door", doorId);
    query.set("glass", glassId);
    query.set("handle", handleId);
    query.set("finish", finishId);
    query.set("lock", lockId);
    query.set("screen", screenId);
    query.set("sidelight", sidelightId);
    query.set("jamb", jambId);
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [
    door.name,
    doorId,
    finishId,
    glassId,
    handleId,
    jambId,
    lockId,
    screenId,
    sidelightId,
  ]);

  function applyDesign(design: Partial<SavedDesign>) {
    if (design.doorId && catalog.doors.some((item) => item.id === design.doorId)) {
      setDoorId(design.doorId);
    }
    if (design.glassId && knownId(catalog.glass, design.glassId)) setGlassId(design.glassId);
    if (design.handleId && knownId(catalog.handles, design.handleId)) setHandleId(design.handleId);
    if (design.finishId && knownId(catalog.finishes, design.finishId)) setFinishId(design.finishId);
    if (design.lockId && knownId(lockOptions, design.lockId)) setLockId(design.lockId);
    if (design.screenId && knownId(screenOptions, design.screenId)) setScreenId(design.screenId);
    if (design.sidelightId && knownId(sidelightOptions, design.sidelightId)) {
      setSidelightId(design.sidelightId);
    }
    if (design.jambId && knownId(jambOptions, design.jambId)) setJambId(design.jambId);
  }

  function saveDesign() {
    const entry: SavedDesign = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      doorId,
      doorName: door.name,
      glassId,
      handleId,
      finishId,
      lockId,
      screenId,
      sidelightId,
      jambId,
    };
    const next = [entry, ...savedDoors.filter((item) => item.doorId !== entry.doorId)].slice(0, 12);
    setSavedDoors(next);
    window.localStorage.setItem(savedDesignsKey, JSON.stringify(next));
    setSaveNote("Saved on this browser. Open Design Your Door on this device to see it again.");
  }
  const displayedDoors = filteredDoors.slice(0, visibleDoors);

  function selectDoor(id: string) {
    const nextDoor = catalog.doors.find((item) => item.id === id);
    if (!nextDoor) return;

    setDoorId(id);
    if (!nextDoor.availableGlassIds.includes(glassId)) {
      setGlassId(nextDoor.availableGlassIds[0]);
    }
    if (!nextDoor.availableHandleIds.includes(handleId)) {
      setHandleId(nextDoor.availableHandleIds[0]);
    }
    if (!nextDoor.availableFinishIds.includes(finishId)) {
      setFinishId(nextDoor.availableFinishIds[0]);
    }
    track("configurator_option_select", {
      option_type: "door",
      option_id: id,
    });
  }

  function goTo(nextStep: Step) {
    if (step === "door" && nextStep === "details") {
      track("configurator_start", { source_page: window.location.pathname });
    }
    setStep(nextStep);
    track("configurator_step_view", {
      step_name: nextStep,
      step_number: steps.findIndex((item) => item.id === nextStep) + 1,
    });
    document
      .getElementById("configurator")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    form.set("lockId", lock.id);
    form.set("lockName", lock.name);
    form.set("screenId", screen.id);
    form.set("screenName", screen.name);
    form.set("sidelightId", sidelight.id);
    form.set("sidelightName", sidelight.name);
    form.set("jambId", jamb.id);
    form.set("jambName", jamb.name);
    form.set("doorImagePath", door.imageUrl);
    form.set("sourceUrl", window.location.href);

    const query = new URLSearchParams(window.location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "gclid"].forEach(
      (key) => {
        const value = query.get(key);
        if (value) form.set(key, value);
      },
    );

    try {
      const response = await fetch("/api/quote", { method: "POST", body: form });
      const result = (await response.json()) as {
        message?: string;
        mockupEligible?: boolean;
      };
      if (!response.ok) throw new Error(result.message || "Unable to send quote");

      setMockupEligible(Boolean(result.mockupEligible));
      setStatus("success");
      track("generate_lead", { door_id: door.id, lead_type: "custom_door" });
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
    <section className="configurator-shell" id="configurator">
      <div className="stepper" aria-label="Configurator progress">
        {steps.map((item, index) => (
          <button
            className={index <= currentStepIndex ? "step active" : "step"}
            key={item.id}
            onClick={() => index < currentStepIndex && setStep(item.id)}
            type="button"
          >
            <span>{index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="configurator-grid">
        <aside className="preview-panel">
          <div className="preview-image">
            <DoorPreview
              door={door}
              finish={finish}
              glass={glass}
              sizes="(max-width: 900px) 100vw, 45vw"
            />
            <div className="preview-label">
              <p>{door.style}</p>
              <h2>{door.name}</h2>
            </div>
          </div>
          <div className="selection-ribbon">
            <span>
              <FinishThumb finish={finish} size="sm" />
              {finish.name}
            </span>
            <span>
              <OptionThumb src={glass.thumbnailUrl} />
              {glass.name} Glass
            </span>
            <span>
              <OptionThumb src={handle.thumbnailUrl} />
              {handle.name}
            </span>
          </div>
          <p className="preview-disclaimer">
            The image is an illustration: your selected glass and finish drawn
            on the catalog photo of this door. Handle, lock, screen,
            sidelights, and jamb are recorded with your request but not drawn.
            Hand-forged iron varies from piece to piece, and a custom order
            follows the drawing you approve.
          </p>
          <Link
            className="preview-planner-link"
            href={`/planner?door=${encodeURIComponent(door.id)}`}
          >
            Preview this door on your entry
          </Link>
        </aside>

        <div className="options-panel">
          {step === "door" && (
            <>
              <p className="eyebrow">Step 1 of 4</p>
              <h2>Choose Your Door Style</h2>
              <p className="section-copy">
                Start with the silhouette and ironwork that feels right for your
                home.
              </p>
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
                    }}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="door-results-copy">
                Single and double groups come from the catalog photo. A wide
                single door can sit with the doubles until the list is reviewed.
              </p>
              <label className="door-search">
                Search doors
                <input
                  name="doorSearch"
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
                Showing {displayedDoors.length} of {filteredDoors.length} doors
              </p>
              <div className="door-grid">
                {displayedDoors.map((item) => (
                  <button
                    aria-pressed={item.id === door.id}
                    className={item.id === door.id ? "door-card selected" : "door-card"}
                    key={item.id}
                    onClick={() => selectDoor(item.id)}
                    type="button"
                  >
                    <span className="door-thumb">
                      <Image
                        alt={item.alt}
                        fill
                        sizes="(max-width: 600px) 42vw, 150px"
                        src={item.thumbnailUrl}
                        unoptimized
                      />
                    </span>
                    <strong>{item.name}</strong>
                    <small>{item.configuration}</small>
                  </button>
                ))}
              </div>
              <SavedDoorList
                doors={savedDoors}
                onOpen={(design) => {
                  applyDesign(design);
                  setSaveNote(`Opened ${design.doorName}.`);
                }}
              />
              {visibleDoors < filteredDoors.length && (
                <button
                  className="secondary-action"
                  onClick={() => setVisibleDoors((count) => count + 24)}
                  type="button"
                >
                  Load More Doors
                </button>
              )}
              <button
                className="primary-action"
                onClick={() => goTo("details")}
                type="button"
              >
                Customize This Door
              </button>
            </>
          )}

          {step === "details" && (
            <>
              <p className="eyebrow">Step 2 of 4</p>
              <h2>Make It Yours</h2>
              <OptionGroup
                label="Glass"
                onSelect={(id) => {
                  setGlassId(id);
                  track("configurator_option_select", {
                    option_type: "glass",
                    option_id: id,
                  });
                }}
                options={catalog.glass.filter((item) =>
                  door.availableGlassIds.includes(item.id),
                )}
                selectedId={glassId}
              />
              <OptionGroup
                label="Handle"
                onSelect={(id) => {
                  setHandleId(id);
                  track("configurator_option_select", {
                    option_type: "handle",
                    option_id: id,
                  });
                }}
                options={catalog.handles.filter((item) =>
                  door.availableHandleIds.includes(item.id),
                )}
                selectedId={handleId}
              />
              <fieldset className="option-group">
                <legend>Finish</legend>
                <div className="finish-preview" aria-live="polite">
                  <FinishThumb finish={finish} size="lg" />
                  <div>
                    <span>Selected Finish</span>
                    <strong>{finish.name}</strong>
                    <p>{finish.description}</p>
                  </div>
                </div>
                <div className="swatch-row">
                  {catalog.finishes
                    .filter((item) => door.availableFinishIds.includes(item.id))
                    .map((item) => (
                      <button
                        aria-label={`Select ${item.name}`}
                        aria-pressed={item.id === finishId}
                        className={
                          item.id === finishId ? "swatch selected" : "swatch"
                        }
                        key={item.id}
                        onClick={() => {
                          setFinishId(item.id);
                          track("configurator_option_select", {
                            option_type: "finish",
                            option_id: item.id,
                          });
                        }}
                        type="button"
                      >
                        <FinishThumb finish={item} size="md" />
                        <span>{item.name}</span>
                      </button>
                    ))}
                </div>
              </fieldset>
              <OptionGroup
                label="Lock"
                onSelect={setLockId}
                options={lockOptions}
                selectedId={lockId}
              />
              <OptionGroup
                label="Screen"
                onSelect={setScreenId}
                options={screenOptions}
                selectedId={screenId}
              />
              <OptionGroup
                label="Sidelights"
                onSelect={setSidelightId}
                options={sidelightOptions}
                selectedId={sidelightId}
              />
              <OptionGroup
                label="Door jamb"
                onSelect={setJambId}
                options={jambOptions}
                selectedId={jambId}
              />
              <div className="button-row">
                <button className="text-action" onClick={() => goTo("door")}>
                  Back
                </button>
                <button
                  className="primary-action"
                  onClick={() => {
                    track("configurator_complete", { door_id: door.id });
                    goTo("review");
                  }}
                >
                  Review My Design
                </button>
              </div>
            </>
          )}

          {step === "review" && (
            <>
              <p className="eyebrow">Step 3 of 4</p>
              <h2>Your Custom Door</h2>
              <div className="summary-card">
                <SummaryRow label="Door" value={`${door.name} · ${door.configuration}`} />
                <SummaryRow label="Style" value={door.style} />
                <SummaryRow label="Glass" value={glass.name} />
                <SummaryRow label="Handle" value={handle.name} />
                <div className="summary-finish-row">
                  <span>Finish</span>
                  <strong>
                    <FinishThumb finish={finish} size="sm" />
                    {finish.name}
                  </strong>
                </div>
                <SummaryRow label="Lock" value={lock.name} />
                <SummaryRow label="Screen" value={screen.name} />
                <SummaryRow label="Sidelights" value={sidelight.name} />
                <SummaryRow label="Door jamb" value={jamb.name} />
              </div>
              <p className="section-copy">
                After the drawing is approved, a custom door usually takes 8 to
                16 weeks. Doors already in stock are at artisticentrances.shop.
                An expert confirms measurements, compatibility, and price before
                anything is built.
              </p>
              <div className="save-row">
                <button className="secondary-action" onClick={saveDesign} type="button">
                  Save This Door
                </button>
                <button
                  className="text-action"
                  onClick={() => {
                    navigator.clipboard?.writeText(window.location.href);
                    setSaveNote("Link copied. Open it on this browser to return to the design.");
                  }}
                  type="button"
                >
                  Copy Link
                </button>
              </div>
              {saveNote ? <p className="save-note">{saveNote}</p> : null}
              <div className="button-row">
                <button className="text-action" onClick={() => goTo("details")}>
                  Edit Design
                </button>
                <button
                  className="primary-action"
                  onClick={() => goTo("quote")}
                >
                  Get My Custom Quote
                </button>
              </div>
            </>
          )}

          {step === "quote" && status !== "success" && (
            <>
              <p className="eyebrow">Step 4 of 4</p>
              <h2>Request Your Quote</h2>
              <p className="section-copy">
                Tell us about your project. Your design selections will be sent
                with your request.
              </p>
              <form className="quote-form" onSubmit={submitQuote}>
                <input
                  aria-hidden="true"
                  className="honeypot"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                />
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
                      inputMode="numeric"
                      name="zip"
                      pattern="[0-9]{5}(-[0-9]{4})?"
                      required
                      autoComplete="postal-code"
                      onChange={(event) => {
                        const zip = zip5(event.target.value);
                        if (zip.length < 5) {
                          setZipHint("");
                          return;
                        }
                        setZipHint(
                          isGreaterLasVegasZip(zip)
                            ? "Greater Las Vegas — this request can include a door mockup after you submit."
                            : "Outside greater Las Vegas — the team will follow up by conversation instead of an automated mockup.",
                        );
                      }}
                    />
                  </label>
                </div>
                {zipHint ? <p className="zip-hint">{zipHint}</p> : null}
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
                    placeholder="Measurements, sidelights, installation questions, or anything else we should know"
                  />
                </label>
                <label>
                  Photo of your current entry (optional)
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    name="entryPhoto"
                    type="file"
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
                <button
                  className="primary-action"
                  disabled={status === "sending"}
                  type="submit"
                >
                  {status === "sending" ? "Sending Request…" : "Request My Quote"}
                </button>
              </form>
            </>
          )}

          {status === "success" && (
            <div className="success-state" role="status">
              <span>✓</span>
              <p className="eyebrow">Design received</p>
              <h2>Thank You</h2>
              <p>
                {mockupEligible
                  ? "Your door photo, glass, handle, finish, and the other choices are with Artistic Entrances. This greater Las Vegas request is eligible for a mockup of the design you submitted."
                  : "Your door photo and selections are with Artistic Entrances. Projects outside greater Las Vegas are followed up in a conversation, without an automated mockup."}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function OptionGroup({
  label,
  options,
  selectedId,
  onSelect,
}: {
  label: string;
  options: Array<{
    id: string;
    name: string;
    description: string;
    thumbnailUrl?: string | null;
  }>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset className="option-group">
      <legend>{label}</legend>
      <div className="option-list">
        {options.map((option) => (
          <button
            aria-pressed={option.id === selectedId}
            className={option.id === selectedId ? "option selected" : "option"}
            key={option.id}
            onClick={() => onSelect(option.id)}
            type="button"
          >
            <span className="option-copy">
              {option.thumbnailUrl ? <OptionThumb src={option.thumbnailUrl} /> : null}
              <strong>{option.name}</strong>
              <small>{option.description}</small>
            </span>
            <i>{option.id === selectedId ? "✓" : ""}</i>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function FinishThumb({
  finish,
  size,
}: {
  finish: { name: string; hex: string; textureUrl: string | null };
  size: "sm" | "md" | "lg";
}) {
  if (finish.textureUrl) {
    return (
      <span className={`finish-thumb finish-thumb-${size}`}>
        <Image
          alt=""
          aria-hidden
          fill
          sizes={size === "sm" ? "16px" : size === "md" ? "88px" : "220px"}
          src={finish.textureUrl}
          unoptimized
        />
      </span>
    );
  }

  return (
    <i
      aria-hidden
      className={`finish-thumb finish-thumb-${size} finish-thumb-hex`}
      style={{ backgroundColor: finish.hex }}
    />
  );
}

function OptionThumb({ src }: { src?: string | null }) {
  if (!src) return null;
  return (
    <span className="option-thumb">
      <Image alt="" fill sizes="54px" src={src} unoptimized />
    </span>
  );
}

function knownId<T extends { id: string }>(options: readonly T[], id: string | null) {
  if (!id) return undefined;
  return options.some((option) => option.id === id) ? id : undefined;
}

function readSavedDesigns(): SavedDesign[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(savedDesignsKey) || "[]") as SavedDesign[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readCurrentDesign(): SavedDesign | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(currentDesignKey) || "null") as SavedDesign | null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function SavedDoorList({
  doors,
  onOpen,
}: {
  doors: SavedDesign[];
  onOpen: (design: SavedDesign) => void;
}) {
  if (doors.length === 0) return null;
  return (
    <div className="saved-doors">
      <h3>Saved on this browser</h3>
      <ul>
        {doors.map((design) => (
          <li key={design.id}>
            <button onClick={() => onOpen(design)} type="button">
              <strong>{design.doorName}</strong>
              <small>
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "America/Denver",
                }).format(new Date(design.savedAt))}{" "}
                MT
              </small>
            </button>
          </li>
        ))}
      </ul>
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
