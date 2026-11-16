/**
 * Server-side handling of the tracking fields the lead forms send along:
 * campaign attribution, GA ids, door interest, and a little visit context.
 * Everything here is untrusted browser input. Nothing throws, every value is
 * trimmed and capped, and anything that should match the catalog is checked
 * against it, so an odd analytics field can never cost us a lead.
 */
import { catalog } from "@/lib/catalog";

export const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid", "fbclid", "msclkid"] as const;
type ClickIdKey = (typeof CLICK_ID_KEYS)[number];

export type TouchInfo = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  landingPage: string;
  referrer: string;
  /** YYYY-MM-DD, or empty. */
  date: string;
};

export type LeadTracking = {
  lastTouch: TouchInfo;
  firstTouch: TouchInfo;
  /** Click ids of the last touch (the one the utm fields come from). */
  clickIds: Record<ClickIdKey, string>;
  /** Click ids of the first touch. */
  firstClickIds: Record<ClickIdKey, string>;
  gaClientId: string;
  gaSessionId: string;
  /** Catalog door ids, most interesting first (max 5). */
  interestDoorIds: string[];
  interestTopDoorId: string;
  interestDoorsDetail: string;
  interestGlassId: string;
  interestFinishId: string;
  interestLayout: "single" | "double" | "";
  pagePath: string;
  device: "mobile" | "tablet" | "desktop" | "";
  visitCount: string;
};

const doorsById = new Map<string, string>(
  catalog.doors.map((door) => [door.id, door.name]),
);
const glassById = new Map<string, string>(catalog.glass.map((g) => [g.id, g.name]));
const finishById = new Map<string, string>(catalog.finishes.map((f) => [f.id, f.name]));

const MAX = 200;
const MAX_DOORS_TEXT = 500;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

/** Trim, drop control characters (no line breaks either), and cap the length. */
export function cleanText(value: unknown, max = MAX): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
}

/** Click ids and similar tokens: letters, digits, and a few separators only. */
function cleanToken(value: unknown) {
  return cleanText(value).replace(/[^A-Za-z0-9._\-~]/g, "").slice(0, MAX);
}

function cleanDate(value: unknown) {
  const text = cleanText(value, 40);
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : "";
}

function cleanPath(value: unknown) {
  const text = cleanText(value);
  // Landing pages can carry click ids in the query string; the path is enough.
  const path = text.split(/[?#]/)[0];
  return path.startsWith("/") ? path : "";
}

function cleanReferrer(value: unknown) {
  const text = cleanText(value, 500);
  if (!text) return "";
  try {
    return new URL(text).host.slice(0, MAX);
  } catch {
    return "";
  }
}

function touch(get: (key: string) => string, prefix: string, dateKey: string): TouchInfo {
  return {
    source: cleanText(get(`${prefix}utm_source`)),
    medium: cleanText(get(`${prefix}utm_medium`)),
    campaign: cleanText(get(`${prefix}utm_campaign`)),
    content: cleanText(get(`${prefix}utm_content`)),
    term: cleanText(get(`${prefix}utm_term`)),
    landingPage: cleanPath(get(`${prefix}landing_page`)),
    referrer: cleanReferrer(get(`${prefix}referrer`)),
    date: cleanDate(get(dateKey)),
  };
}

export function doorNameForId(id: string) {
  return doorsById.get(id) ?? "";
}

export function isCatalogDoor(id: string) {
  return doorsById.has(id);
}

function idList(value: string) {
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const id = part.trim();
    if (doorsById.has(id)) seen.add(id);
    if (seen.size >= 5) break;
  }
  return [...seen];
}

/** Read the tracking fields from any key lookup (FormData, a plain object, ...). */
export function parseTracking(get: (key: string) => unknown): LeadTracking {
  const text = (key: string) => {
    const value = get(key);
    return typeof value === "string" ? value : "";
  };
  const clickIds = {} as LeadTracking["clickIds"];
  const firstClickIds = {} as LeadTracking["clickIds"];
  for (const key of CLICK_ID_KEYS) {
    clickIds[key] = cleanToken(text(key));
    firstClickIds[key] = cleanToken(text(`first_${key}`));
  }

  const topId = cleanText(text("interest_top_door_id"), 100);
  const doorIds = idList(cleanText(text("interest_door_ids"), MAX_DOORS_TEXT));
  const glass = cleanText(text("interest_glass"), 100);
  const finish = cleanText(text("interest_finish"), 100);
  const layout = cleanText(text("interest_layout"), 20);
  const device = cleanText(text("device"), 20);
  const visits = cleanText(text("visit_count"), 6);
  const topDoorId = doorsById.has(topId) ? topId : (doorIds[0] ?? "");

  return {
    lastTouch: touch(text, "", "touch_timestamp"),
    firstTouch: touch(text, "first_", "first_timestamp"),
    clickIds,
    firstClickIds,
    gaClientId: cleanText(text("ga_client_id"), 60).replace(/[^0-9.]/g, ""),
    gaSessionId: cleanText(text("ga_session_id"), 30).replace(/[^0-9]/g, ""),
    interestDoorIds: doorIds.length || !topDoorId ? doorIds : [topDoorId],
    interestTopDoorId: topDoorId,
    interestDoorsDetail: cleanText(text("interest_doors"), MAX_DOORS_TEXT),
    interestGlassId: glassById.has(glass) ? glass : "",
    interestFinishId: finishById.has(finish) ? finish : "",
    interestLayout: layout === "single" || layout === "double" ? layout : "",
    pagePath: cleanPath(text("page_path")),
    device: device === "mobile" || device === "tablet" || device === "desktop" ? device : "",
    visitCount: /^\d{1,5}$/.test(visits) ? visits : "",
  };
}

export function emptyTracking(): LeadTracking {
  return parseTracking(() => "");
}

/* ---------- tags ---------- */

export function tagSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** "Door 8" becomes "8". Falls back to the door id when the name has no number. */
export function doorTagNumber(doorId: string) {
  const match = /\d+/.exec(doorsById.get(doorId) ?? "");
  return tagSlug(match ? match[0] : doorId);
}

/** The last touch's click ids, or the first touch's when the last has none. */
export function sourceClickIds(t: LeadTracking): Record<ClickIdKey, string> {
  return CLICK_ID_KEYS.some((key) => t.clickIds[key]) ? t.clickIds : t.firstClickIds;
}

function hasClickId(ids: Record<ClickIdKey, string>, ...keys: ClickIdKey[]) {
  return keys.some((key) => Boolean(ids[key]));
}

/** At most 1 + 3 + 1 + 1 + 1 + 1 = 8 tags, whatever the browser sends. */
export function interestTags(tracking: LeadTracking, quotedDoorId: string): string[] {
  const tags: string[] = [];
  if (quotedDoorId && doorsById.has(quotedDoorId)) {
    tags.push(`quoted-door-${doorTagNumber(quotedDoorId)}`);
  }
  for (const id of tracking.interestDoorIds.slice(0, 3)) {
    tags.push(`interest-door-${doorTagNumber(id)}`);
  }
  if (tracking.interestLayout) tags.push(`interest-${tracking.interestLayout}-door`);
  if (tracking.interestGlassId) tags.push(`interest-glass-${tagSlug(tracking.interestGlassId)}`);
  if (tracking.interestFinishId) tags.push(`interest-finish-${tagSlug(tracking.interestFinishId)}`);
  const ids = sourceClickIds(tracking);
  if (hasClickId(ids, "gclid", "gbraid", "wbraid")) tags.push("source-google-ads");
  else if (hasClickId(ids, "fbclid")) tags.push("source-meta-ads");
  else if (hasClickId(ids, "msclkid")) tags.push("source-microsoft-ads");
  return [...new Set(tags)];
}

/* ---------- text for the summary and custom fields ---------- */

export function touchLabel(t: TouchInfo) {
  const utm = [t.source, t.medium, t.campaign].filter(Boolean).join(" / ");
  const label = utm || (t.referrer ? `referral ${t.referrer}` : "");
  if (!label) return "";
  const where = [t.landingPage, t.date].filter(Boolean).join(", ");
  return where ? `${label} (${where})` : label;
}

export function interestDoorNames(t: LeadTracking) {
  return t.interestDoorIds.map(doorNameForId).filter(Boolean).join(", ");
}

export function topDoorLabel(t: LeadTracking) {
  const name = doorNameForId(t.interestTopDoorId);
  return name ? `${name} (${t.interestTopDoorId})` : "";
}

export function glassName(id: string) {
  return glassById.get(id) ?? "";
}

export function finishName(id: string) {
  return finishById.get(id) ?? "";
}

function idLine(ids: Record<ClickIdKey, string>) {
  return CLICK_ID_KEYS.filter((key) => ids[key])
    .map((key) => `${key} ${ids[key]}`)
    .join(", ");
}

export function clickIdLine(t: LeadTracking) {
  return idLine(t.clickIds);
}

/** First-touch click ids, only when they exist and differ from the last touch's. */
export function firstClickIdLine(t: LeadTracking) {
  const line = idLine(t.firstClickIds);
  return line && line !== idLine(t.clickIds) ? line : "";
}

/** The cleaned values under stable names, for the n8n webhook form. */
export function trackingFormFields(t: LeadTracking): Record<string, string> {
  const out: Record<string, string> = {
    utm_source: t.lastTouch.source,
    utm_medium: t.lastTouch.medium,
    utm_campaign: t.lastTouch.campaign,
    utm_content: t.lastTouch.content,
    utm_term: t.lastTouch.term,
    landing_page: t.lastTouch.landingPage,
    referrer: t.lastTouch.referrer,
    first_utm_source: t.firstTouch.source,
    first_utm_medium: t.firstTouch.medium,
    first_utm_campaign: t.firstTouch.campaign,
    first_utm_content: t.firstTouch.content,
    first_utm_term: t.firstTouch.term,
    first_landing_page: t.firstTouch.landingPage,
    first_referrer: t.firstTouch.referrer,
    first_timestamp: t.firstTouch.date,
    touch_timestamp: t.lastTouch.date,
    ga_client_id: t.gaClientId,
    ga_session_id: t.gaSessionId,
    interest_door_ids: t.interestDoorIds.join(","),
    interest_door_names: interestDoorNames(t),
    interest_top_door_id: t.interestTopDoorId,
    interest_top_door_name: doorNameForId(t.interestTopDoorId),
    interest_doors: t.interestDoorsDetail,
    interest_glass: t.interestGlassId,
    interest_finish: t.interestFinishId,
    interest_layout: t.interestLayout,
    page_path: t.pagePath,
    device: t.device,
    visit_count: t.visitCount,
    first_touch: touchLabel(t.firstTouch),
    last_touch: touchLabel(t.lastTouch),
  };
  for (const key of CLICK_ID_KEYS) {
    out[key] = t.clickIds[key];
    out[`first_${key}`] = t.firstClickIds[key];
  }
  return out;
}
