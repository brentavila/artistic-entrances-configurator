import { catalog, optionById, type Door } from "@/lib/catalog";
import { jambOptions, lockOptions, screenOptions, sidelightOptions } from "@/lib/design-options";

export const currentDesignKey = "ae-current-design";
export const savedDesignsKey = "ae-saved-doors";

export type SavedDesign = {
  id: string;
  savedAt: string;
  doorId: string;
  doorName: string;
  glassId: string;
  handleId: string;
  finishId: string;
  lockId: string;
  screenId: string;
  sidelightId: string;
  jambId: string;
};

/** The part of a design the planner can show on a photo. */
export type DoorDesign = {
  doorId: string;
  glassId: string;
  finishId: string;
  handleId: string;
};

type ParamsLike = { get(name: string): string | null };

function has<T extends { id: string }>(options: readonly T[], id: string | null | undefined) {
  return id ? options.some((option) => option.id === id) : false;
}

export function findDoor(idOrSlug: string | null | undefined): Door | undefined {
  if (!idOrSlug) return undefined;
  return catalog.doors.find((item) => item.id === idOrSlug || item.slug === idOrSlug);
}

/** Parses a stored design, returning null unless every id exists in the catalog. */
export function parseDesign(raw: string | null): SavedDesign | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedDesign> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (
      !has(catalog.doors, parsed.doorId) ||
      !has(catalog.glass, parsed.glassId) ||
      !has(catalog.finishes, parsed.finishId) ||
      !has(catalog.handles, parsed.handleId)
    ) {
      return null;
    }
    const known = <T extends { id: string }>(options: readonly T[], id: string | undefined) =>
      has(options, id) ? (id as string) : options[0].id;
    return {
      id: typeof parsed.id === "string" ? parsed.id : "current",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      doorId: parsed.doorId as string,
      doorName: findDoor(parsed.doorId)?.name ?? "",
      glassId: parsed.glassId as string,
      handleId: parsed.handleId as string,
      finishId: parsed.finishId as string,
      lockId: known(lockOptions, parsed.lockId),
      screenId: known(screenOptions, parsed.screenId),
      sidelightId: known(sidelightOptions, parsed.sidelightId),
      jambId: known(jambOptions, parsed.jambId),
    };
  } catch {
    return null;
  }
}

export function readCurrentDesign(): SavedDesign | null {
  if (typeof window === "undefined") return null;
  try {
    return parseDesign(window.localStorage.getItem(currentDesignKey));
  } catch {
    return null;
  }
}

/** Only ids that exist in the catalog; the door may be an id or a slug. */
export function designFromParams(params: ParamsLike): Partial<DoorDesign> {
  const result: Partial<DoorDesign> = {};
  const door = findDoor(params.get("door"));
  if (door) result.doorId = door.id;
  const glass = params.get("glass");
  if (has(catalog.glass, glass)) result.glassId = glass as string;
  const finish = params.get("finish");
  if (has(catalog.finishes, finish)) result.finishId = finish as string;
  const handle = params.get("handle");
  if (has(catalog.handles, handle)) result.handleId = handle as string;
  return result;
}

export function designQuery(
  design: Partial<DoorDesign> & {
    lockId?: string;
    screenId?: string;
    sidelightId?: string;
    jambId?: string;
  },
): string {
  const query = new URLSearchParams();
  if (design.doorId) query.set("door", design.doorId);
  if (design.glassId) query.set("glass", design.glassId);
  if (design.finishId) query.set("finish", design.finishId);
  if (design.handleId) query.set("handle", design.handleId);
  if (design.lockId) query.set("lock", design.lockId);
  if (design.screenId) query.set("screen", design.screenId);
  if (design.sidelightId) query.set("sidelight", design.sidelightId);
  if (design.jambId) query.set("jamb", design.jambId);
  return query.toString();
}

/**
 * Glass, finish, and handle that are valid for this door. A wanted id is kept
 * when the door offers it; otherwise the door's first available one is used.
 */
export function resolveDesign(
  door: Door,
  wanted: Partial<Omit<DoorDesign, "doorId">> = {},
): DoorDesign {
  const pick = (available: readonly string[], want: string | undefined, all: readonly { id: string }[]) =>
    want && available.includes(want) ? want : (available[0] ?? all[0].id);
  return {
    doorId: door.id,
    glassId: pick(door.availableGlassIds, wanted.glassId, catalog.glass),
    finishId: pick(door.availableFinishIds, wanted.finishId, catalog.finishes),
    handleId: pick(door.availableHandleIds, wanted.handleId, catalog.handles),
  };
}

export function designOption<T extends { id: string }>(options: readonly T[], id: string) {
  return optionById(options, id) ?? options[0];
}
