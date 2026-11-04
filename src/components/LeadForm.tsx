"use client";

import { FormEvent, useState } from "react";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    const form = new FormData(event.currentTarget);
    form.set("leadType", leadType);
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
      if (!response.ok) throw new Error(result.message || "Unable to send");
      setStatus("success");
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "generate_lead", lead_type: leadType });
    } catch (error) {
      setStatus("error");
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
    <form className="quote-form" onSubmit={onSubmit}>
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
