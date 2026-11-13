import { business } from "@/lib/business";
import {
  clickIdLine,
  emptyTracking,
  finishName,
  glassName,
  interestDoorNames,
  interestTags,
  topDoorLabel,
  touchLabel,
  type LeadTracking,
} from "@/lib/lead-tracking";

export const ghlFieldIds = {
  door: "PK0Ai5QtLvVs6SzBE2A1",
  glass: "hYPtRh0Yik7MyHOCtxOU",
  handle: "0jVumOur6yFOIBsu8K1W",
  finish: "dRrt5xOac79sc5ciVQ8l",
  summary: "Pz0IOnUAR0GsdYWzxM6n",
  serviceArea: "EzMLpWUuTKfGEidVXlSl",
  mockupEligible: "GvQY0CF4ViOuqhrU3EDg",
  leadType: "uMaq7GNRqRehzsaFYQRd",
  doorImage: "SUkFuAifExggDWD7gUOp",
  doorImageUrl: "Lrq4JtFkAApDRTYB9DBT",
  lock: "yP1bPNDkogATKskSh4W4",
  screen: "RZB0VEckdMPdYIOWoDc3",
  sidelights: "9IBhVcOH3Em5YsCtPN2z",
  jamb: "6gHTr2PTXQAdrpTIXWfu",
} as const;

export type LeadRecord = {
  leadType: "quote" | "catalog" | "contact";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  zip: string;
  customerType: string;
  timeline: string;
  notes: string;
  doorId: string;
  doorName: string;
  configuration: string;
  glassId: string;
  glassName: string;
  handleId: string;
  handleName: string;
  finishId: string;
  finishName: string;
  lockId: string;
  lockName: string;
  screenId: string;
  screenName: string;
  sidelightId: string;
  sidelightName: string;
  jambId: string;
  jambName: string;
  doorImageUrl: string;
  sourceUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  gclid: string;
  entryPhotoName: string;
  inArea: boolean;
  serviceArea: string;
  mockupEligible: boolean;
  tags: string[];
  summary: string;
  consentTimestamp: string;
  tracking: LeadTracking;
};

/**
 * Optional custom fields. The owner creates each one in GHL and puts its id in
 * the matching environment variable; a field whose variable is empty is
 * skipped, so tags and the summary field carry everything until then.
 */
export function optionalGhlFields(
  lead: Pick<LeadRecord, "tracking">,
  env: Record<string, string | undefined> = process.env,
) {
  const t = lead.tracking;
  const glass = glassName(t.interestGlassId);
  const finish = finishName(t.interestFinishId);
  const candidates: Array<[string | undefined, string]> = [
    [env.GHL_FIELD_INTEREST_DOORS, interestDoorNames(t)],
    [env.GHL_FIELD_TOP_DOOR, topDoorLabel(t)],
    [env.GHL_FIELD_INTEREST_GLASS, glass],
    [env.GHL_FIELD_INTEREST_FINISH, finish],
    [env.GHL_FIELD_FIRST_TOUCH, touchLabel(t.firstTouch)],
    [env.GHL_FIELD_LAST_TOUCH, touchLabel(t.lastTouch)],
    [env.GHL_FIELD_GCLID, t.clickIds.gclid],
    [env.GHL_FIELD_GA_CLIENT_ID, t.gaClientId],
  ];
  return candidates
    .filter(([id]) => Boolean(id?.trim()))
    .map(([id, value]) => field((id as string).trim(), value));
}

function field(id: string, value: string) {
  return { id, field_value: value };
}

export function leadTags(
  lead: Pick<LeadRecord, "leadType" | "inArea" | "mockupEligible"> &
    Partial<Pick<LeadRecord, "doorId" | "tracking">>,
) {
  const tags = [
    "website",
    lead.leadType === "quote"
      ? "door-configurator"
      : lead.leadType === "catalog"
        ? "catalog-request"
        : "contact-form",
    lead.inArea ? "greater-las-vegas" : "outside-service-area",
    "sms-consent",
  ];

  if (lead.mockupEligible) tags.push("mockup-eligible");
  if (!lead.inArea) tags.push("conversational-follow-up");
  // Interest and source tags. Only the quote form submits a real door.
  tags.push(
    ...interestTags(
      lead.tracking ?? emptyTracking(),
      lead.leadType === "quote" ? (lead.doorId ?? "") : "",
    ),
  );
  return tags;
}

export function buildSummary(lead: Omit<LeadRecord, "summary" | "tags">) {
  const t = lead.tracking;
  const layoutGlassFinish = [
    t.interestLayout,
    glassName(t.interestGlassId),
    finishName(t.interestFinishId),
  ]
    .filter(Boolean)
    .join(" / ");
  const visitor = [
    t.device,
    t.visitCount ? `visit #${t.visitCount}` : "",
    t.pagePath ? `submitted on ${t.pagePath}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const lines = [
    `Lead type: ${lead.leadType}`,
    `Service area: ${lead.serviceArea}`,
    `Mockup eligible: ${lead.mockupEligible ? "Yes" : "No"}`,
    lead.mockupEligible
      ? "Next step: greater Las Vegas design. A door mockup can be generated after this contact is saved."
      : "Next step: conversational follow-up. Do not send an automated door mockup.",
    lead.doorName ? `Door: ${lead.doorName} (${lead.doorId})` : "",
    lead.configuration ? `Configuration: ${lead.configuration}` : "",
    lead.glassName ? `Glass: ${lead.glassName} (${lead.glassId})` : "",
    lead.handleName ? `Handle: ${lead.handleName} (${lead.handleId})` : "",
    lead.finishName ? `Finish: ${lead.finishName} (${lead.finishId})` : "",
    lead.lockName ? `Lock: ${lead.lockName}` : "",
    lead.screenName ? `Screen: ${lead.screenName}` : "",
    lead.sidelightName ? `Sidelights: ${lead.sidelightName}` : "",
    lead.jambName ? `Door jamb: ${lead.jambName}` : "",
    lead.doorImageUrl ? `Door image: ${lead.doorImageUrl}` : "",
    lead.customerType ? `Customer type: ${lead.customerType}` : "",
    lead.timeline ? `Timeline: ${lead.timeline}` : "",
    `ZIP: ${lead.zip}`,
    lead.notes ? `Notes: ${lead.notes}` : "",
    lead.entryPhotoName ? `Entry photo attached: ${lead.entryPhotoName}` : "",
    lead.sourceUrl ? `Page: ${lead.sourceUrl}` : "",
    lead.utmSource ? `UTM source: ${lead.utmSource}` : "",
    lead.utmMedium ? `UTM medium: ${lead.utmMedium}` : "",
    lead.utmCampaign ? `UTM campaign: ${lead.utmCampaign}` : "",
    lead.gclid ? `GCLID: ${lead.gclid}` : "",
    interestDoorNames(t) ? `Doors of interest: ${interestDoorNames(t)}` : "",
    t.interestDoorsDetail ? `Interest activity: ${t.interestDoorsDetail}` : "",
    topDoorLabel(t) ? `Top door: ${topDoorLabel(t)}` : "",
    layoutGlassFinish ? `Preferred layout / glass / finish: ${layoutGlassFinish}` : "",
    touchLabel(t.firstTouch) ? `First touch: ${touchLabel(t.firstTouch)}` : "",
    touchLabel(t.lastTouch) ? `Last touch: ${touchLabel(t.lastTouch)}` : "",
    clickIdLine(t) ? `Click ids: ${clickIdLine(t)}` : "",
    t.gaClientId || t.gaSessionId
      ? `GA client id / session id: ${t.gaClientId || "-"} / ${t.gaSessionId || "-"}`
      : "",
    visitor ? `Visitor: ${visitor}` : "",
    `SMS consent: yes at ${lead.consentTimestamp}`,
  ];

  return lines.filter(Boolean).join("\n");
}

export async function deliverToGoHighLevel(
  lead: LeadRecord,
  doorImage?: { bytes: Buffer; filename: string },
) {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  if (!token) return { ok: false as const, reason: "missing-token" };

  const response = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    body: JSON.stringify({
      locationId: process.env.GHL_LOCATION_ID || business.ghlLocationId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      postalCode: lead.zip,
      country: "US",
      source: `website-${lead.leadType}`,
      customFields: [
        field(ghlFieldIds.door, lead.doorName ? `${lead.doorName} (${lead.doorId})` : ""),
        field(ghlFieldIds.glass, lead.glassName ? `${lead.glassName} (${lead.glassId})` : ""),
        field(ghlFieldIds.handle, lead.handleName ? `${lead.handleName} (${lead.handleId})` : ""),
        field(ghlFieldIds.finish, lead.finishName ? `${lead.finishName} (${lead.finishId})` : ""),
        field(ghlFieldIds.summary, lead.summary),
        field(ghlFieldIds.serviceArea, lead.serviceArea),
        field(ghlFieldIds.mockupEligible, lead.mockupEligible ? "Yes" : "No"),
        field(ghlFieldIds.leadType, lead.leadType),
        field(ghlFieldIds.doorImageUrl, lead.doorImageUrl),
        field(ghlFieldIds.lock, lead.lockName),
        field(ghlFieldIds.screen, lead.screenName),
        field(ghlFieldIds.sidelights, lead.sidelightName),
        field(ghlFieldIds.jamb, lead.jambName),
        ...optionalGhlFields(lead),
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    return { ok: false as const, reason: `ghl-${response.status}` };
  }

  const body = (await response.json()) as { contact?: { id?: string } };
  const contactId = body.contact?.id;
  if (!contactId) return { ok: false as const, reason: "ghl-no-contact" };

  const tags = await fetch(
    `https://services.leadconnectorhq.com/contacts/${contactId}/tags`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
      body: JSON.stringify({ tags: lead.tags }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!tags.ok) return { ok: false as const, reason: `ghl-tags-${tags.status}` };

  if (doorImage) {
    const uploaded = await uploadDoorImage(token, contactId, doorImage);
    if (!uploaded) return { ok: false as const, reason: "ghl-image", contactId };
  }

  return { ok: true as const, contactId };
}

async function uploadDoorImage(
  token: string,
  contactId: string,
  doorImage: { bytes: Buffer; filename: string },
) {
  const locationId = process.env.GHL_LOCATION_ID || business.ghlLocationId;
  const fileId = crypto.randomUUID();
  const body = new FormData();
  body.append(
    `${ghlFieldIds.doorImage}_${fileId}`,
    new Blob([new Uint8Array(doorImage.bytes)], { type: "image/jpeg" }),
    doorImage.filename,
  );
  const response = await fetch(
    `https://services.leadconnectorhq.com/forms/upload-custom-files?contactId=${encodeURIComponent(contactId)}&locationId=${encodeURIComponent(locationId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        Version: "2021-07-28",
      },
      body,
      signal: AbortSignal.timeout(20_000),
    },
  );
  return response.ok;
}
