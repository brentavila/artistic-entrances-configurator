import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { business } from "@/lib/business";
import {
  buildSummary,
  deliverToGoHighLevel,
  leadTags,
  optionalGhlFields,
  type LeadRecord,
} from "@/lib/ghl";
import { parseTracking, trackingFormFields } from "@/lib/lead-tracking";
import { serviceAreaForZip, zip5 } from "@/lib/service-area";

export const runtime = "nodejs";

const leadTypes = new Set(["quote", "catalog", "contact"]);

export async function POST(request: Request) {
  const form = await request.formData();
  if (asText(form.get("website"))) return NextResponse.json({ ok: true });

  const leadType = asText(form.get("leadType")) || "quote";
  if (!leadTypes.has(leadType)) {
    return NextResponse.json({ message: "Unknown form type." }, { status: 400 });
  }

  const required = ["firstName", "lastName", "email", "phone", "zip"];
  if (leadType === "quote") {
    required.push("doorId", "glassId", "handleId", "finishId");
  }
  for (const field of required) {
    if (!asText(form.get(field))) {
      return NextResponse.json(
        { message: `Missing required field: ${field}` },
        { status: 400 },
      );
    }
  }

  if (form.get("smsConsent") !== "yes") {
    return NextResponse.json(
      { message: "Consent is required to send this request." },
      { status: 400 },
    );
  }

  for (const field of ["entryPhoto", "entryPhoto2", "entryPhoto3", "entryPhoto4"]) {
    const photoError = photoMessage(form.get(field));
    if (photoError) {
      return NextResponse.json({ message: photoError }, { status: 400 });
    }
  }

  const email = asText(form.get("email"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
  }

  const zip = zip5(asText(form.get("zip")));
  if (zip.length !== 5) {
    return NextResponse.json({ message: "Enter a 5-digit ZIP code." }, { status: 400 });
  }

  const plannerLead = asText(form.get("leadSource")) === "entry-planner";
  const extraPhotoNames = ["entryPhoto", "entryPhoto2", "entryPhoto3", "entryPhoto4"]
    .map((field) => {
      const value = form.get(field);
      return value instanceof File && value.size > 0 ? value.name : "";
    })
    .filter(Boolean);
  const tracking = parseTracking((key) => form.get(key));
  const area = serviceAreaForZip(zip);
  const mockupEligible = leadType === "quote" && area.inArea;
  const partial = {
    leadType: leadType as LeadRecord["leadType"],
    firstName: asText(form.get("firstName")),
    lastName: asText(form.get("lastName")),
    email,
    phone: asText(form.get("phone")),
    zip,
    customerType: asText(form.get("customerType")),
    timeline: asText(form.get("timeline")),
    notes: [asText(form.get("notes")), asText(form.get("plannerSummary"))]
      .filter(Boolean)
      .join("\n"),
    doorId: asText(form.get("doorId")),
    doorName: asText(form.get("doorName")),
    configuration: asText(form.get("configuration")),
    glassId: asText(form.get("glassId")),
    glassName: asText(form.get("glassName")),
    handleId: asText(form.get("handleId")),
    handleName: asText(form.get("handleName")),
    finishId: asText(form.get("finishId")),
    finishName: asText(form.get("finishName")),
    lockId: asText(form.get("lockId")),
    lockName: asText(form.get("lockName")),
    screenId: asText(form.get("screenId")),
    screenName: asText(form.get("screenName")),
    sidelightId: asText(form.get("sidelightId")),
    sidelightName: asText(form.get("sidelightName")),
    jambId: asText(form.get("jambId")),
    jambName: asText(form.get("jambName")),
    doorImageUrl: "",
    sourceUrl: asText(form.get("sourceUrl")),
    utmSource: tracking.lastTouch.source,
    utmMedium: tracking.lastTouch.medium,
    utmCampaign: tracking.lastTouch.campaign,
    utmContent: tracking.lastTouch.content,
    gclid: tracking.clickIds.gclid,
    entryPhotoName: extraPhotoNames.join(", "),
    inArea: area.inArea,
    serviceArea: area.label,
    mockupEligible,
    consentTimestamp: new Date().toISOString(),
    tracking,
  };
  const doorImage = await readDoorImage(asText(form.get("doorImagePath")));
  if (doorImage) partial.doorImageUrl = doorImage.url;
  const lead: LeadRecord = {
    ...partial,
    tags: [...leadTags(partial), ...(plannerLead ? ["entry-planner"] : [])],
    summary: buildSummary(partial),
  };

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[quote] tags=${lead.tags.join(",")} summaryLines=${lead.summary.split("\n").length}`,
    );
  }

  const webhookUrl = process.env.N8N_QUOTE_WEBHOOK_URL;
  const ghlToken = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;

  if (!webhookUrl && !ghlToken) {
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({
        ok: true,
        mode: "development",
        inArea: lead.inArea,
        mockupEligible: lead.mockupEligible,
        message: "Validated locally. Lead delivery is not configured.",
      });
    }
    return NextResponse.json(
      { message: "Quote delivery is temporarily unavailable." },
      { status: 503 },
    );
  }

  if (webhookUrl) {
    form.set("leadType", lead.leadType);
    form.set("zip", lead.zip);
    form.set("serviceArea", lead.serviceArea);
    form.set("inArea", lead.inArea ? "yes" : "no");
    form.set("mockupEligible", lead.mockupEligible ? "yes" : "no");
    form.set("tags", lead.tags.join(","));
    form.set("summary", lead.summary);
    form.set("consentTimestamp", lead.consentTimestamp);
    form.set(
      "leadSource",
      plannerLead ? "entry-planner" : `website-${lead.leadType}`,
    );
    form.set("doorImageUrl", lead.doorImageUrl);
    // Cleaned tracking values under stable names, replacing whatever the
    // browser sent, plus the optional GHL custom fields (ids come from the
    // GHL_FIELD_* environment variables) as one JSON list for the workflow.
    for (const [key, value] of Object.entries(trackingFormFields(tracking))) {
      if (value) form.set(key, value);
      else form.delete(key);
    }
    form.set("ghlExtraFields", JSON.stringify(optionalGhlFields(lead)));
    if (doorImage) {
      form.set(
        "doorImage",
        new File([new Uint8Array(doorImage.jpeg)], doorImage.filename, {
          type: "image/jpeg",
        }),
      );
    }
    const headers = new Headers();
    if (process.env.N8N_QUOTE_WEBHOOK_TOKEN) {
      headers.set("Authorization", `Bearer ${process.env.N8N_QUOTE_WEBHOOK_TOKEN}`);
    }
    const response = await fetch(webhookUrl, {
      method: "POST",
      body: form,
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { message: "Delivery failed. Please try again." },
        { status: 502 },
      );
    }
  } else {
    const delivered = await deliverToGoHighLevel(
      lead,
      doorImage ? { bytes: doorImage.jpeg, filename: doorImage.filename } : undefined,
    );
    if (!delivered.ok) {
      return NextResponse.json(
        { message: "Delivery failed. Please try again." },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    inArea: lead.inArea,
    mockupEligible: lead.mockupEligible,
  });
}

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function photoMessage(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return null;
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(value.type) || value.size > 8 * 1024 * 1024) {
    return "Photos must be JPG, PNG, or WebP and under 8 MB.";
  }
  return null;
}

async function readDoorImage(imagePath: string) {
  if (!/^\/media\/doors\/(?:full|thumbnails)\/[a-z0-9-]+\.webp$/.test(imagePath)) {
    return null;
  }
  const absolute = path.join(process.cwd(), "public", imagePath);
  const bytes = await readFile(absolute);
  const jpeg = await sharp(bytes).jpeg({ quality: 82 }).toBuffer();
  const filename = `${path.basename(imagePath, ".webp")}.jpg`;
  return {
    jpeg,
    filename,
    url: `${business.siteUrl}${imagePath}`,
  };
}
