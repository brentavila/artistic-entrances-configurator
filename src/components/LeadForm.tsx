"use client";

import { FormEvent, useRef, useState } from "react";
import { appendTrackingFields, beginQuote, leadSubmitted, trackFormError } from "@/lib/analytics";
import { isGreaterLasVegasZip, zip5 } from "@/lib/service-area";

export function LeadForm({
  leadType,
  submitLabel,
  notesLabel,
}: {
  leadType: "catalog" | "contact";
  submitLabel: string;
  notesLabel: string;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [zipHint, setZipHint] = useState("");
  const started = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    const form = new FormData(event.currentTarget);
    form.set("leadType", leadType);
    form.set("sourceUrl", window.location.href);
    appendTrackingFields(form);

    try {
      const response = await fetch("/api/quote", { method: "POST", body: form });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Unable to send");
      setStatus("success");
      leadSubmitted({
        leadType,
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
      });
    } catch (error) {
      setStatus("error");
      trackFormError(leadType, error instanceof Error ? error.message.slice(0, 100) : "unknown");
      setMessage(error instanceof Error ? error.message : "Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="success-state" role="status">
        <span>✓</span>
        <p className="eyebrow">Request received</p>
        <h2>Thank You</h2>
        <p>
          Artistic Entrances has your details. A team member will follow up
          during showroom hours.
        </p>
      </div>
    );
  }

  return (
    <form
      className="quote-form"
      onFocus={() => {
        if (started.current) return;
        started.current = true;
        beginQuote(null, {}, leadType);
      }}
      onSubmit={onSubmit}
    >
      <input className="honeypot" name="website" tabIndex={-1} autoComplete="off" />
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
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <div className="field-row">
        <label>
          Phone
          <input name="phone" type="tel" required autoComplete="tel" />
        </label>
        <label>
          ZIP code
          <input
            name="zip"
            inputMode="numeric"
            autoComplete="postal-code"
            pattern="[0-9]{5}(-[0-9]{4})?"
            required
            onChange={(event) => {
              const zip = zip5(event.target.value);
              if (zip.length < 5) {
                setZipHint("");
                return;
              }
              setZipHint(
                isGreaterLasVegasZip(zip)
                  ? "This ZIP is in the greater Las Vegas service area."
                  : "This ZIP is outside greater Las Vegas. The team will follow up by conversation.",
              );
            }}
          />
        </label>
      </div>
      {zipHint ? <p className="zip-hint">{zipHint}</p> : null}
      <label>
        {notesLabel}
        <textarea name="notes" rows={4} />
      </label>
      <label className="consent">
        <input name="smsConsent" required type="checkbox" value="yes" />
        <span>
          I agree to receive calls and text messages about this request. Message
          and data rates may apply. Consent is not a condition of purchase.
        </span>
      </label>
      {status === "error" ? <p className="form-error">{message}</p> : null}
      <button className="primary-action" disabled={status === "sending"} type="submit">
        {status === "sending" ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
