/**
 * The one analytics module. Every surface calls these helpers; nothing else
 * should push to the dataLayer directly.
 *
 * Each event is sent two ways:
 *  1. A GTM-standard object `{ event, ...params }` so Tag Manager triggers
 *     (Google Ads conversions, future pixels) can listen for it.
 *  2. A gtag-style push (`gtag('event', name, params)`), which the Google tag
 *     that GTM already loads delivers to GA4. No second gtag.js script.
 */
import { attributionFields, deviceClass, gaIds, visitCount } from "./attribution";
import { interestFields, recordInterest } from "./interest";

declare global {
  interface Window {
    dataLayer?: unknown[];
    fbq?: (...args: unknown[]) => void;
  }
}

function layer(): unknown[] {
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
}

export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID || "G-4CTB6N724J";
const ENHANCED_CONVERSIONS = process.env.NEXT_PUBLIC_ENHANCED_CONVERSIONS === "1";
/** Google Ads lead conversion, "AW-17928892397/<label>". Off when empty. */
const ADS_LEAD_SEND_TO = process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_SEND_TO ?? "";

/** GA4 event -> Meta standard event. Lead carries the shared event id for CAPI dedup. */
const META_EVENTS: Record<string, string> = {
  view_item: "ViewContent",
  add_to_wishlist: "AddToWishlist",
  add_to_cart: "CustomizeProduct",
  begin_checkout: "InitiateCheckout",
  generate_lead: "Lead",
};

function sendToMeta(name: string, params: Params) {
  const fbq = window.fbq;
  if (!fbq) return;
  let metaName = META_EVENTS[name];
  if (name === "contact_click") metaName = "Contact";
  if (!metaName) return;
  const items = Array.isArray(params.items) ? (params.items as DoorItem[]) : [];
  const data: Params = {};
  if (items.length) {
    data.content_type = "product";
    data.content_ids = items.map((item) => item.item_id);
    data.content_name = items[0].item_name;
  }
  if (params.value !== undefined) data.value = params.value;
  if (params.currency !== undefined) data.currency = params.currency;
  if (params.lead_type) data.lead_type = params.lead_type;
  if (params.method) data.method = params.method;
  const eventId = typeof params.event_id === "string" ? params.event_id : "";
  if (eventId) fbq("track", metaName, data, { eventID: eventId });
  else fbq("track", metaName, data);
}

/** One id per lead, shared by the browser pixel, Meta CAPI, Google Ads and GA4. */
export function newEventId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function cookie(name: string) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}
const BRAND = "Artistic Entrances";

export type Params = Record<string, unknown>;

export type PageType =
  | "home"
  | "catalog"
  | "designer"
  | "planner"
  | "gallery"
  | "projects"
  | "contact"
  | "about"
  | "landing"
  | "other";

export function pageTypeFor(pathname: string): PageType {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  const first = path.split("/")[1];
  switch (first) {
    case "catalog":
      return "catalog";
    case "design-your-door":
      return "designer";
    case "planner":
      return "planner";
    case "gallery":
      return "gallery";
    case "projects":
      return "projects";
    case "contact":
      return "contact";
    case "about":
      return "about";
    case "las-vegas-iron-doors":
      return "landing";
    default:
      return "other";
  }
}

export function currentPageType(): PageType {
  if (typeof window === "undefined") return "other";
  return pageTypeFor(window.location.pathname);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]) {
  // GA4 only recognises the real `arguments` object, not an array.
  // eslint-disable-next-line prefer-rest-params
  layer().push(arguments);
}

export function track(name: string, params: Params = {}) {
  try {
    if (typeof window === "undefined") return;
    const base: Params = { page_type: currentPageType(), ...params };
    const items = base.items;
    if (Array.isArray(items)) {
      const ecommerce: Params = { items };
      if (base.value !== undefined) ecommerce.value = base.value;
      if (base.currency !== undefined) ecommerce.currency = base.currency;
      layer().push({ ecommerce: null });
      layer().push({ event: name, ...base, ecommerce });
    } else {
      layer().push({ event: name, ...base });
    }
    gtag("event", name, { ...base, send_to: GA4_ID });
    sendToMeta(name, base);
  } catch {
    /* analytics must never break the page */
  }
}

/* ---------- Door items (GA4 `items` schema) ---------- */

export type DoorLike = {
  id: string;
  name: string;
  configuration?: string;
  layout?: string;
};

type Named = { id: string; name: string };

export type DoorOpts = {
  glass?: Named;
  finish?: Named;
  handle?: Named;
  listId?: string;
  listName?: string;
  index?: number;
  funnelStage?: string;
  /** Set to false when the caller records its own interest action for the same moment. */
  interest?: boolean;
  /** Extra custom parameters for this event. */
  params?: Params;
};

export type DoorList = { id: string; name: string };

export type DoorItem = Record<string, string | number>;

function clean<T extends Record<string, unknown>>(value: T) {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== "") out[key] = item;
  }
  return out as DoorItem;
}

export function doorItem(door: DoorLike, opts: DoorOpts = {}): DoorItem {
  return clean({
    item_id: door.id,
    item_name: door.name,
    item_brand: BRAND,
    item_category: door.configuration,
    item_category2: opts.glass?.name,
    item_category3: opts.finish?.name,
    item_category4: opts.handle?.name,
    item_variant:
      opts.glass || opts.finish
        ? `${opts.glass?.id ?? ""}/${opts.finish?.id ?? ""}`
        : undefined,
    item_list_id: opts.listId,
    item_list_name: opts.listName,
    index: opts.index,
  });
}

function stage(opts: DoorOpts | undefined, fallback: string): Params {
  return { funnel_stage: opts?.funnelStage ?? fallback, ...(opts?.params ?? {}) };
}

function interestOpts(opts?: DoorOpts) {
  return { glassId: opts?.glass?.id, finishId: opts?.finish?.id };
}

/* ---------- GA4 recommended events ---------- */

const LIST_CAP = 12;

export function viewDoorList(listId: string, listName: string, doors: DoorLike[]) {
  if (!doors.length) return;
  const items = doors
    .slice(0, LIST_CAP)
    .map((door, index) => doorItem(door, { listId, listName, index }));
  track("view_item_list", {
    item_list_id: listId,
    item_list_name: listName,
    funnel_stage: "browse",
    items,
  });
}

export function selectDoor(door: DoorLike, list?: DoorList, opts: DoorOpts = {}) {
  const merged: DoorOpts = {
    ...opts,
    listId: list?.id ?? opts.listId,
    listName: list?.name ?? opts.listName,
  };
  track("select_item", {
    item_list_id: merged.listId,
    item_list_name: merged.listName,
    ...stage(opts, "browse"),
    items: [doorItem(door, merged)],
  });
  recordInterest("select", door, interestOpts(opts));
}

export function viewDoor(door: DoorLike, opts: DoorOpts = {}) {
  track("view_item", { ...stage(opts, "consider"), items: [doorItem(door, opts)] });
  if (opts.interest !== false) recordInterest("view", door, interestOpts(opts));
}

export function saveDesign(door: DoorLike, opts: DoorOpts = {}) {
  track("add_to_wishlist", { ...stage(opts, "consider"), items: [doorItem(door, opts)] });
  recordInterest("save", door, interestOpts(opts));
}

/** The designer's "design finished, go to review" moment. */
export function completeDesign(door: DoorLike, opts: DoorOpts = {}) {
  track("add_to_cart", { ...stage(opts, "design"), items: [doorItem(door, opts)] });
  recordInterest("design", door, interestOpts(opts));
}

/** First interaction with a quote or lead form. */
export function beginQuote(door: DoorLike | null, opts: DoorOpts = {}, leadType = "") {
  track("begin_checkout", {
    lead_type: leadType || undefined,
    ...stage(opts, "quote"),
    ...(door ? { items: [doorItem(door, opts)] } : {}),
  });
}

export function leadSubmitted(input: {
  leadType: string;
  door?: DoorLike | null;
  opts?: DoorOpts;
  value?: number;
  /** The id returned by appendTrackingFields for this submission. */
  eventId?: string;
  /** Only used when NEXT_PUBLIC_ENHANCED_CONVERSIONS is "1". */
  email?: string;
  phone?: string;
}) {
  try {
    if (typeof window === "undefined") return;
    if (ENHANCED_CONVERSIONS && (input.email || input.phone)) {
      gtag("set", "user_data", clean({ email: input.email, phone_number: input.phone }));
    }
    const value = input.value ?? 0;
    if (ADS_LEAD_SEND_TO) {
      // transaction_id lets Google Ads drop a duplicate of the same lead.
      gtag("event", "conversion", clean({
        send_to: ADS_LEAD_SEND_TO,
        value,
        currency: "USD",
        transaction_id: input.eventId,
      }));
    }
    track("generate_lead", {
      lead_type: input.leadType,
      event_id: input.eventId,
      currency: "USD",
      value,
      ...stage(input.opts, "lead"),
      ...(input.door ? { items: [doorItem(input.door, input.opts)] } : {}),
    });
    if (input.door) recordInterest("quote", input.door, interestOpts(input.opts));
  } catch {
    /* never throw */
  }
}

/* ---------- Custom events ---------- */

export type OptionType =
  | "glass"
  | "finish"
  | "handle"
  | "lock"
  | "screen"
  | "sidelight"
  | "jamb"
  | "layout";

export function trackOption(optionType: OptionType, optionId: string, door?: DoorLike | null) {
  track("select_option", {
    option_type: optionType,
    option_id: optionId,
    ...(door ? { item_id: door.id, item_name: door.name } : {}),
  });
}

export function trackStep(flow: string, step: string, index: number) {
  track("funnel_step", { flow, step, step_index: index });
}

export function trackCta(ctaId: string, location: string, destination?: string) {
  track("cta_click", { cta_id: ctaId, cta_location: location, destination });
}

export type ContactMethod = "phone" | "email" | "sms" | "directions";

export function trackContact(method: ContactMethod, location: string) {
  track("contact_click", { method, cta_location: location });
}

/** A click through to the Shopify store for in-stock doors. */
export function trackShopClick(destination: string, location: string) {
  track("shop_click", { destination, cta_location: location });
}

export function trackFormError(form: string, reason: string) {
  track("form_error", { form, reason });
}

/** A failed lead request. `reason` comes from a small fixed vocabulary. */
export class FormFailure extends Error {
  reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** network, bad_response, http_<status>, or rejected; never free text. */
export function formErrorReason(error: unknown) {
  return error instanceof FormFailure ? error.reason : "network";
}

/**
 * Read the JSON body of an /api/quote response, or throw a FormFailure whose
 * message is exactly what the customer has always seen.
 */
export async function readJsonResponse<T extends { message?: string }>(
  response: Response,
  fallback: string,
): Promise<T> {
  let result: T;
  try {
    result = (await response.json()) as T;
  } catch (error) {
    throw new FormFailure("bad_response", error instanceof Error ? error.message : fallback);
  }
  if (!response.ok) {
    const message = result?.message;
    throw new FormFailure(message ? "rejected" : `http_${response.status}`, message || fallback);
  }
  return result;
}

/**
 * Attribution, GA ids, and door-interest as flat fields for a lead FormData.
 * Empty values are skipped, and existing form fields are never overwritten.
 */
export function appendTrackingFields(form: FormData): string {
  const eventId = newEventId();
  try {
    const fields: Record<string, string> = {
      event_id: eventId,
      fbp: cookie("_fbp"),
      fbc: cookie("_fbc"),
      ...attributionFields(),
      ...gaIds(),
      ...interestFields(),
      page_path: window.location.pathname,
      device: deviceClass(window.innerWidth),
      visit_count: visitCount(),
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value && !form.has(key)) form.set(key, value);
    }
  } catch {
    /* never block a lead */
  }
  return eventId;
}
