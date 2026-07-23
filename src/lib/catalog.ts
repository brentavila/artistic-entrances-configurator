import catalogData from "@/data/catalog.json";

export type Door = (typeof catalogData.doors)[number];
export type GlassOption = (typeof catalogData.glass)[number];
export type HandleOption = (typeof catalogData.handles)[number];
export type FinishOption = (typeof catalogData.finishes)[number];

export const catalog = catalogData;

export function optionById<T extends { id: string }>(
  options: readonly T[],
  id: string,
) {
  return options.find((option) => option.id === id);
}
