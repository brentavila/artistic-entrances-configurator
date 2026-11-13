/**
 * First-party door-interest profile, kept in this browser only. It records
 * which doors a visitor looked at, picked, designed, saved, previewed, or
 * requested a quote on, so the sales team can see what they care about.
 */

export type InterestAction = "view" | "select" | "design" | "save" | "preview" | "quote";

export type InterestDoor = {
  id: string;
  name: string;
  layout?: string;
  configuration?: string;
};

export type InterestOpts = { glassId?: string; finishId?: string };

type CounterKey = "views" | "selects" | "designs" | "saves" | "previews" | "quotes";

export type DoorInterest = {
  name: string;
  layout: string;
  views: number;
  selects: number;
  designs: number;
  saves: number;
  previews: number;
  quotes: number;
  lastAt: string;
  glassId?: string;
  finishId?: string;
};

export type InterestProfile = {
  doors: Record<string, DoorInterest>;
  glass: Record<string, number>;
  finish: Record<string, number>;
  layout: { single: number; double: number };
  updatedAt: string;
};

export const INTEREST_KEY = "ae-interest";
export const MAX_DOORS = 40;

export const WEIGHTS: Record<InterestAction, number> = {
  view: 1,
  select: 3,
  design: 5,
  save: 6,
  preview: 8,
  quote: 10,
};

const COUNTER: Record<InterestAction, CounterKey> = {
  view: "views",
  select: "selects",
  design: "designs",
  save: "saves",
  preview: "previews",
  quote: "quotes",
};

const VERBS: Array<[CounterKey, string]> = [
  ["views", "viewed"],
  ["selects", "selected"],
  ["designs", "designed"],
  ["saves", "saved"],
  ["previews", "previewed"],
  ["quotes", "quoted"],
];

export function emptyProfile(): InterestProfile {
  return { doors: {}, glass: {}, finish: {}, layout: { single: 0, double: 0 }, updatedAt: "" };
}

function totalOf(d: DoorInterest) {
  return d.views + d.selects + d.designs + d.saves + d.previews + d.quotes;
}

export function doorScore(d: DoorInterest) {
  return (
    d.views * WEIGHTS.view +
    d.selects * WEIGHTS.select +
    d.designs * WEIGHTS.design +
    d.saves * WEIGHTS.save +
    d.previews * WEIGHTS.preview +
    d.quotes * WEIGHTS.quote
  );
}

function layoutOf(door: InterestDoor): "single" | "double" | "" {
  if (door.layout === "single" || door.layout === "double") return door.layout;
  const text = (door.configuration ?? "").toLowerCase();
  if (text.includes("double")) return "double";
  if (text.includes("single")) return "single";
  return "";
}

/** Pure update, used by recordInterest and testable on its own. */
export function applyInterest(
  profile: InterestProfile,
  action: InterestAction,
  door: InterestDoor,
  opts: InterestOpts = {},
  now = new Date().toISOString(),
): InterestProfile {
  const layout = layoutOf(door);
  const existing = profile.doors[door.id];
  const entry: DoorInterest = existing
    ? { ...existing }
    : {
        name: door.name,
        layout,
        views: 0,
        selects: 0,
        designs: 0,
        saves: 0,
        previews: 0,
        quotes: 0,
        lastAt: now,
      };
  entry.name = door.name;
  if (layout) entry.layout = layout;
  entry[COUNTER[action]] += 1;
  entry.lastAt = now;
  // Plain views carry the default options, so only deliberate actions count
  // toward favorite glass and finish.
  const deliberate = action !== "view";
  if (deliberate && opts.glassId) entry.glassId = opts.glassId;
  if (deliberate && opts.finishId) entry.finishId = opts.finishId;

  const next: InterestProfile = {
    doors: { ...profile.doors, [door.id]: entry },
    glass: { ...profile.glass },
    finish: { ...profile.finish },
    layout: { ...profile.layout },
    updatedAt: now,
  };
  if (deliberate && opts.glassId) next.glass[opts.glassId] = (next.glass[opts.glassId] ?? 0) + 1;
  if (deliberate && opts.finishId) next.finish[opts.finishId] = (next.finish[opts.finishId] ?? 0) + 1;
  if (layout) next.layout[layout] += 1;

  const ids = Object.keys(next.doors);
  if (ids.length > MAX_DOORS) {
    const evict = ids
      .filter((id) => id !== door.id)
      .sort((a, b) => {
        const diff = doorScore(next.doors[a]) - doorScore(next.doors[b]);
        return diff !== 0 ? diff : next.doors[a].lastAt.localeCompare(next.doors[b].lastAt);
      })
      .slice(0, ids.length - MAX_DOORS);
    for (const id of evict) delete next.doors[id];
  }
  return next;
}

function read(): InterestProfile {
  try {
    const raw = window.localStorage.getItem(INTEREST_KEY);
    if (!raw) return emptyProfile();
    const parsed = JSON.parse(raw) as Partial<InterestProfile>;
    return {
      doors: parsed.doors ?? {},
      glass: parsed.glass ?? {},
      finish: parsed.finish ?? {},
      layout: { single: parsed.layout?.single ?? 0, double: parsed.layout?.double ?? 0 },
      updatedAt: parsed.updatedAt ?? "",
    };
  } catch {
    return emptyProfile();
  }
}

export function recordInterest(
  action: InterestAction,
  door: InterestDoor,
  opts?: InterestOpts,
) {
  try {
    if (typeof window === "undefined") return;
    const next = applyInterest(read(), action, door, opts);
    window.localStorage.setItem(INTEREST_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked or full */
  }
}

export type InterestSummary = {
  topDoors: Array<{
    id: string;
    name: string;
    layout: string;
    score: number;
    actions: string[];
  }>;
  favoriteGlassId: string;
  favoriteFinishId: string;
  preferredLayout: "single" | "double" | "";
};

function topKey(counts: Record<string, number>) {
  let best = "";
  let bestCount = 0;
  for (const [key, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FULL_WEIGHT_DAYS = 14;
const HALF_LIFE_DAYS = 14;

/** Full weight for 14 days, then halves every further 14 days. */
export function decayFactor(lastAt: string, now: number = Date.now()) {
  const then = Date.parse(lastAt);
  if (!Number.isFinite(then)) return 1;
  const days = (now - then) / DAY_MS;
  if (days <= FULL_WEIGHT_DAYS) return 1;
  return Math.pow(0.5, (days - FULL_WEIGHT_DAYS) / HALF_LIFE_DAYS);
}

export function decayedScore(d: DoorInterest, now: number = Date.now()) {
  return doorScore(d) * decayFactor(d.lastAt, now);
}

function rankedDoors(profile: InterestProfile, now: number) {
  return Object.entries(profile.doors)
    .map(([id, d]) => ({ id, d, score: decayedScore(d, now) }))
    .sort((a, b) => b.score - a.score || b.d.lastAt.localeCompare(a.d.lastAt))
    .slice(0, 5);
}

export function summarize(profile: InterestProfile, now: number = Date.now()): InterestSummary {
  const { single, double } = profile.layout;
  return {
    topDoors: rankedDoors(profile, now).map(({ id, d, score }) => ({
      id,
      name: d.name,
      layout: d.layout,
      score: Math.round(score * 100) / 100,
      actions: VERBS.filter(([key]) => d[key] > 0).map(([, verb]) => verb),
    })),
    favoriteGlassId: topKey(profile.glass),
    favoriteFinishId: topKey(profile.finish),
    preferredLayout: single === 0 && double === 0 ? "" : single >= double ? "single" : "double",
  };
}

export function interestSummary(): InterestSummary {
  try {
    if (typeof window === "undefined") return summarize(emptyProfile());
    return summarize(read());
  } catch {
    return summarize(emptyProfile());
  }
}

export function interestFieldsFor(profile: InterestProfile): Record<string, string> {
  const summary = summarize(profile);
  const out: Record<string, string> = {};
  const top = summary.topDoors[0];
  if (!top) return out;
  out.interest_top_door_id = top.id;
  out.interest_top_door_name = top.name;
  out.interest_doors = summary.topDoors
    .map((d) => {
      const layout = d.layout ? ` (${d.layout})` : "";
      return `${d.name}${layout} ×${totalOf(profile.doors[d.id])} ${d.actions.join(", ")}`;
    })
    .join("; ");
  out.interest_door_ids = summary.topDoors.map((d) => d.id).join(",");
  if (summary.favoriteGlassId) out.interest_glass = summary.favoriteGlassId;
  if (summary.favoriteFinishId) out.interest_finish = summary.favoriteFinishId;
  if (summary.preferredLayout) out.interest_layout = summary.preferredLayout;
  return out;
}

export function interestFields(): Record<string, string> {
  try {
    if (typeof window === "undefined") return {};
    return interestFieldsFor(read());
  } catch {
    return {};
  }
}
