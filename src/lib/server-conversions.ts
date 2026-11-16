/**
 * Server-side conversions, sent after a lead has been delivered to the CRM.
 *
 * - Meta Conversions API: a `Lead` event with the same event id the browser
 *   pixel used, so Meta counts the lead once even when both arrive, and still
 *   counts it when an ad blocker stopped the pixel.
 * - GA4 Measurement Protocol: a `lead_received` event on the visitor's own GA
 *   client id. It is a server-side record for reconciling GA4 against the CRM;
 *   the browser's `generate_lead` stays the key event, so nothing is counted
 *   twice.
 *
 * Both are off until their environment variables are set. Nothing here throws,
 * and a failed or slow call never affects the lead.
 */
import { createHash } from "node:crypto";

const TIMEOUT_MS = 4000;

export type ServerLead = {
  eventId: string;
  leadType: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  zip: string;
  sourceUrl: string;
  ip: string;
  userAgent: string;
  fbp: string;
  fbc: string;
  /** Used to build `fbc` when the browser had no `_fbc` cookie. */
  fbclid: string;
  gaClientId: string;
  gaSessionId: string;
  doorId: string;
  value: number;
};

export type ServerResult = { meta: string; ga4: string };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function hashed(value: string) {
  const clean = value.trim().toLowerCase();
  return clean ? [sha256(clean)] : undefined;
}

/** Meta wants digits only, with the country code. US numbers get a leading 1. */
function hashedPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return undefined;
  return [sha256(digits.length === 10 ? `1${digits}` : digits)];
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== ""),
  );
}

export function metaPayload(lead: ServerLead, now = Date.now()) {
  const fbc =
    lead.fbc || (lead.fbclid ? `fb.1.${now}.${lead.fbclid}` : "");
  return {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(now / 1000),
        event_id: lead.eventId,
        action_source: "website",
        event_source_url: lead.sourceUrl || undefined,
        user_data: compact({
          em: hashed(lead.email),
          ph: hashedPhone(lead.phone),
          fn: hashed(lead.firstName),
          ln: hashed(lead.lastName),
          zp: hashed(lead.zip.slice(0, 5)),
          country: hashed("us"),
          client_ip_address: lead.ip,
          client_user_agent: lead.userAgent,
          fbp: lead.fbp,
          fbc,
        }),
        custom_data: compact({
          lead_type: lead.leadType,
          currency: "USD",
          value: lead.value,
          content_type: lead.doorId ? "product" : undefined,
          content_ids: lead.doorId ? [lead.doorId] : undefined,
        }),
      },
    ],
    ...(process.env.META_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_TEST_EVENT_CODE }
      : {}),
  };
}

async function sendMeta(lead: ServerLead) {
  const pixel = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixel || !token) return "off";
  const version = process.env.META_GRAPH_VERSION || "v22.0";
  const response = await fetch(
    `https://graph.facebook.com/${version}/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metaPayload(lead)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Meta ${response.status} ${detail}`);
  }
  return "sent";
}

export function ga4Payload(lead: ServerLead, now = Date.now()) {
  const clientId =
    lead.gaClientId || `${Math.floor(Math.random() * 1e9)}.${Math.floor(now / 1000)}`;
  return {
    client_id: clientId,
    events: [
      {
        name: "lead_received",
        params: compact({
          lead_type: lead.leadType,
          event_id: lead.eventId,
          session_id: lead.gaSessionId,
          engagement_time_msec: 1,
          currency: "USD",
          value: lead.value,
          item_id: lead.doorId,
          ga_client_known: lead.gaClientId ? "yes" : "no",
        }),
      },
    ],
  };
}

async function sendGa4(lead: ServerLead) {
  const id = process.env.NEXT_PUBLIC_GA4_ID || "G-4CTB6N724J";
  const secret = process.env.GA4_API_SECRET;
  if (!secret) return "off";
  const response = await fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ga4Payload(lead)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`GA4 ${response.status}`);
  return "sent";
}

export async function sendServerConversions(lead: ServerLead): Promise<ServerResult> {
  const [meta, ga4] = await Promise.allSettled([sendMeta(lead), sendGa4(lead)]);
  const label = (result: PromiseSettledResult<string>, name: string) => {
    if (result.status === "fulfilled") return result.value;
    console.warn(`[conversions] ${name} failed:`, String(result.reason).slice(0, 300));
    return "failed";
  };
  return { meta: label(meta, "meta"), ga4: label(ga4, "ga4") };
}

/** Accepts only ids the browser could have made; anything else gets a new one. */
export function cleanEventId(value: string) {
  return /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : crypto.randomUUID();
}

/** `_fbp` / `_fbc` cookie values look like fb.1.<time>.<id>. */
export function cleanFbCookie(value: string) {
  return /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_.-]{1,250}$/.test(value) ? value : "";
}
