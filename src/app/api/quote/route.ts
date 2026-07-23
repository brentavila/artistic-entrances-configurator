import { NextResponse } from "next/server";

export const runtime = "nodejs";

const requiredFields = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "zip",
  "customerType",
  "timeline",
  "doorId",
  "glassId",
  "handleId",
  "finishId",
] as const;

export async function POST(request: Request) {
  const form = await request.formData();

  if (form.get("website")) {
    return NextResponse.json({ ok: true });
  }

  for (const field of requiredFields) {
    if (!asText(form.get(field))) {
      return NextResponse.json(
        { message: `Missing required field: ${field}` },
        { status: 400 },
      );
    }
  }

  if (form.get("smsConsent") !== "yes") {
    return NextResponse.json(
      { message: "Consent is required to send this quote request." },
      { status: 400 },
    );
  }

  const email = asText(form.get("email"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { message: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const photo = form.get("entryPhoto");
  if (photo instanceof File && photo.size > 0) {
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(photo.type) || photo.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        { message: "Photos must be JPG, PNG, or WebP and under 8 MB." },
        { status: 400 },
      );
    }
  }

  form.set("consentTimestamp", new Date().toISOString());
  form.set("leadSource", "door-configurator");

  const webhookUrl = process.env.N8N_QUOTE_WEBHOOK_URL;
  const webhookToken = process.env.N8N_QUOTE_WEBHOOK_TOKEN;

  if (!webhookUrl) {
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({
        ok: true,
        mode: "development",
        message: "Validated locally; webhook is not configured.",
      });
    }

    return NextResponse.json(
      { message: "Quote delivery is temporarily unavailable." },
      { status: 503 },
    );
  }

  const headers = new Headers();
  if (webhookToken) {
    headers.set("Authorization", `Bearer ${webhookToken}`);
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    body: form,
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    return NextResponse.json(
      { message: "Quote delivery failed. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
