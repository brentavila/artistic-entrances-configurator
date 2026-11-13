/**
 * Durable campaign attribution. First touch is kept forever once set; last
 * touch is replaced whenever a visit arrives with campaign parameters or from a
 * different external site. Everything is best effort and never throws.
 */

export const TOUCH_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
] as const;

export type Touch = Record<(typeof TOUCH_KEYS)[number], string> & {
  referrer: string;
  landing_page: string;
  timestamp: string;
};

export type Attribution = { first: Touch | null; last: Touch | null };

const STORAGE_KEY = "ae-attribution";
const SESSION_KEY = "ae-attribution-session";
const GA_MEASUREMENT = (process.env.NEXT_PUBLIC_GA4_ID || "G-4CTB6N724J").replace(
  /^G-/,
  "",
);

export type Visit = {
  search: string;
  referrer: string;
  host: string;
  landingPage: string;
  now: string;
};

export function buildTouch(visit: Visit): Touch {
  const query = new URLSearchParams(visit.search);
  const touch = {
    referrer: visit.referrer,
    landing_page: visit.landingPage,
    timestamp: visit.now,
  } as Touch;
  for (const key of TOUCH_KEYS) touch[key] = query.get(key) ?? "";
  return touch;
}

function hasCampaign(touch: Touch) {
  return TOUCH_KEYS.some((key) => touch[key]);
}

function externalReferrer(referrer: string, host: string) {
  if (!referrer) return false;
  try {
    return new URL(referrer).host !== host;
  } catch {
    return false;
  }
}

/**
 * Pure rule for the next stored attribution. `sessionSeen` is true when this
 * browser tab session has already been counted.
 */
export function nextAttribution(
  prev: Attribution,
  visit: Visit,
  sessionSeen: boolean,
): Attribution {
  const touch = buildTouch(visit);
  const campaign = hasCampaign(touch);
  const external = externalReferrer(visit.referrer, visit.host);
  const first = prev.first ?? touch;
  if (campaign || (external && !sessionSeen)) return { first, last: touch };
  // Direct or internal visit: nothing new to learn, but seed an empty store.
  return { first, last: prev.last ?? touch };
}

function readStore(): Attribution {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { first: null, last: null };
    const parsed = JSON.parse(raw) as Partial<Attribution>;
    return { first: parsed.first ?? null, last: parsed.last ?? null };
  } catch {
    return { first: null, last: null };
  }
}

const VISITS_KEY = "ae-visits";

/** Counts browser sessions on this device. Called once per session. */
function bumpVisitCount() {
  try {
    const count = Number.parseInt(window.localStorage.getItem(VISITS_KEY) ?? "", 10);
    window.localStorage.setItem(VISITS_KEY, String((Number.isFinite(count) ? count : 0) + 1));
  } catch {
    /* storage blocked */
  }
}

export function visitCount() {
  try {
    const count = Number.parseInt(window.localStorage.getItem(VISITS_KEY) ?? "", 10);
    return Number.isFinite(count) && count > 0 ? String(count) : "";
  } catch {
    return "";
  }
}

export function deviceClass(width: number): "mobile" | "tablet" | "desktop" {
  return width < 768 ? "mobile" : width < 1100 ? "tablet" : "desktop";
}

export function captureAttribution() {
  try {
    if (typeof window === "undefined") return;
    let sessionSeen = false;
    try {
      sessionSeen = window.sessionStorage.getItem(SESSION_KEY) === "1";
      window.sessionStorage.setItem(SESSION_KEY, "1");
      if (!sessionSeen) bumpVisitCount();
    } catch {
      /* storage blocked */
    }
    const next = nextAttribution(
      readStore(),
      {
        search: window.location.search,
        referrer: document.referrer,
        host: window.location.host,
        landingPage: window.location.pathname + window.location.search,
        now: new Date().toISOString(),
      },
      sessionSeen,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* never throw into the page */
  }
}

export function getAttribution(): Attribution {
  try {
    if (typeof window === "undefined") return { first: null, last: null };
    return readStore();
  } catch {
    return { first: null, last: null };
  }
}

/** Flat string map ready for a FormData. Empty values are left out. */
export function attributionFieldsFor(
  attribution: Attribution,
  host = "",
): Record<string, string> {
  const { first, last } = attribution;
  const out: Record<string, string> = {};
  // The un-prefixed fields all come from ONE touch, so a utm_source from one
  // visit is never paired with a gclid from another: the last touch when it
  // carries a campaign parameter or an outside referrer, otherwise the first.
  const lastCounts =
    last && (hasCampaign(last) || externalReferrer(last.referrer, host));
  const source = lastCounts ? last : (first ?? last);
  if (source) {
    for (const key of [...TOUCH_KEYS, "landing_page", "referrer"] as const) {
      out[key] = source[key];
    }
  }
  if (first) {
    for (const key of [...TOUCH_KEYS, "referrer", "landing_page", "timestamp"] as const) {
      out[`first_${key}`] = first[key];
    }
  }
  for (const key of Object.keys(out)) if (!out[key]) delete out[key];
  return out;
}

export function attributionFields(): Record<string, string> {
  const host = typeof window === "undefined" ? "" : window.location.host;
  return attributionFieldsFor(getAttribution(), host);
}

function cookie(name: string) {
  try {
    const match = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
  } catch {
    return "";
  }
}

export function parseGaClientId(value: string) {
  // GA1.1.<random>.<timestamp>
  const parts = value.split(".");
  return parts.length >= 4 ? `${parts[2]}.${parts[3]}` : "";
}

export function parseGaSessionId(value: string) {
  // GS2.1.s<id>$o1$g1... or GS1.1.<id>.1.1...
  const modern = /\.s(\d+)/.exec(value);
  if (modern) return modern[1];
  const parts = value.split(".");
  return parts.length >= 3 && /^\d+$/.test(parts[2]) ? parts[2] : "";
}

export function gaIds(): { ga_client_id: string; ga_session_id: string } {
  if (typeof document === "undefined") return { ga_client_id: "", ga_session_id: "" };
  return {
    ga_client_id: parseGaClientId(cookie("_ga")),
    ga_session_id: parseGaSessionId(cookie(`_ga_${GA_MEASUREMENT}`)),
  };
}
