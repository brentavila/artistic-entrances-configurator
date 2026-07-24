"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import { catalog, optionById } from "@/lib/catalog";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

type Step = "door" | "details" | "review" | "quote";

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
  const [step, setStep] = useState<Step>("door");
  const [doorId, setDoorId] = useState(catalog.doors[0].id);
  const [glassId, setGlassId] = useState(catalog.glass[0].id);
  const [handleId, setHandleId] = useState(catalog.handles[0].id);
  const [finishId, setFinishId] = useState(catalog.finishes[0].id);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [doorQuery, setDoorQuery] = useState("");
  const [visibleDoors, setVisibleDoors] = useState(24);

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
    if (!query) return catalog.doors;

    return catalog.doors.filter((item) => {
      const haystack = [
        item.id,
        item.name,
        item.slug,
        item.style,
        item.configuration,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [doorQuery]);
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
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Unable to send quote");

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
            <Image
              alt={door.alt}
              fill
              priority
              sizes="(max-width: 900px) 100vw, 45vw"
              src={door.imageUrl}
            />
            <div className="preview-label">
              <p>{door.style}</p>
              <h2>{door.name}</h2>
            </div>
          </div>
          <div className="selection-ribbon">
            <span>
              <i style={{ backgroundColor: finish.hex }} />
              {finish.name}
            </span>
            <span>{glass.name} Glass</span>
            <span>{handle.name}</span>
          </div>
          <p className="preview-disclaimer">
            Preview shows the selected door style. Finish, glass, and hardware
            selections are confirmed by the Artistic Entrances team.
          </p>
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
                      />
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
                        <i style={{ backgroundColor: item.hex }} />
                        <span>{item.name}</span>
                      </button>
                    ))}
                </div>
              </fieldset>
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
                <SummaryRow label="Finish" value={finish.name} />
              </div>
              <p className="section-copy">
                An expert will confirm measurements, compatibility, delivery,
                and final pricing with you.
              </p>
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
                Your custom door selections have been sent to Artistic
                Entrances. A team member will review the details and contact you.
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
  options: Array<{ id: string; name: string; description: string }>;
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
            <span>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
