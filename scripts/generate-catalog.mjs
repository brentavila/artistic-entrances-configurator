import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestPath =
  process.argv[2] ||
  path.resolve("data", "supabase-manifest.json");
const outputPath =
  process.argv[3] || path.resolve("src", "data", "catalog.json");
const optionsSourcePath =
  process.argv[4] || path.resolve("src", "data", "catalog.json");
const reviewCsvPath = path.resolve("data", "catalog-doors-review.csv");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
let optionsSource = { glass: [], handles: [], finishes: [] };

try {
  optionsSource = JSON.parse(await readFile(optionsSourcePath, "utf8"));
} catch {
  console.warn(`Could not read options from ${optionsSourcePath}; using defaults.`);
}

const fullAssets = new Map();
const thumbAssets = new Map();

for (const asset of manifest.assets) {
  const slug = slugFromAssetPath(asset.relativePath);
  if (!slug) continue;

  const siteUrl = `/media/${asset.relativePath.replace(/^\/+/, "")}`;
  if (asset.relativePath.startsWith("doors/full/")) {
    fullAssets.set(slug, siteUrl);
  } else if (asset.relativePath.startsWith("doors/thumbnails/")) {
    thumbAssets.set(slug, siteUrl);
  }
}

const slugs = [...fullAssets.keys()].sort(naturalCompare);
const defaultGlassIds = optionsSource.glass?.map((item) => item.id) ?? [
  "clear",
  "frosted",
  "rain",
  "aquatex",
];
const defaultHandleIds = optionsSource.handles?.map((item) => item.id) ?? [
  "square-pull",
  "round-pull",
  "heritage-lever",
];
const defaultFinishIds = optionsSource.finishes?.map((item) => item.id) ?? [
  "midnight-black",
  "aged-bronze",
  "charcoal",
  "copper-patina",
];

const doors = [];
const reviewRows = [
  [
    "id",
    "name",
    "slug",
    "imageUrl",
    "thumbnailUrl",
    "reviewStatus",
    "notes",
  ].join(","),
];

for (const slug of slugs) {
  const imageUrl = fullAssets.get(slug);
  const thumbnailUrl = thumbAssets.get(slug) ?? imageUrl;

  if (!imageUrl) continue;

  const name = humanName(slug);
  const door = {
    id: slug,
    name,
    slug,
    style: "Custom Iron",
    configuration: "Custom Door",
    imageUrl,
    thumbnailUrl,
    alt: `${name} custom iron entry door`,
    availableGlassIds: [...defaultGlassIds],
    availableHandleIds: [...defaultHandleIds],
    availableFinishIds: [...defaultFinishIds],
    featured: doors.length < 6,
  };

  doors.push(door);
  reviewRows.push(
    [
      slug,
      name,
      slug,
      imageUrl,
      thumbnailUrl,
      "needs-owner-review",
      "Rename style/configuration after catalog review",
    ]
      .map(csvCell)
      .join(","),
  );
}

if (doors.length === 0) {
  throw new Error(
    "No door records generated. Confirm supabase-manifest.json contains doors/full/*.webp entries.",
  );
}

const catalog = {
  version: new Date().toISOString().slice(0, 10),
  status: "generated-from-supabase-manifest",
  notice:
    "Door records were generated automatically from Supabase upload manifest. Review names, styles, and featured doors before launch.",
  sourceManifest: path.basename(manifestPath),
  doorCount: doors.length,
  doors,
  glass: optionsSource.glass ?? [],
  handles: optionsSource.handles ?? [],
  finishes: optionsSource.finishes ?? [],
};

await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await writeFile(reviewCsvPath, `${reviewRows.join("\n")}\n`, "utf8");

console.log(`Generated ${doors.length} door records.`);
console.log(`Catalog: ${outputPath}`);
console.log(`Review CSV: ${reviewCsvPath}`);

function slugFromAssetPath(relativePath) {
  const match = relativePath.match(/^doors\/(?:full|thumbnails)\/(.+)\.webp$/i);
  return match?.[1] ?? null;
}

function humanName(slug) {
  const trimmed = slug
    .replace(/^website-images-/i, "")
    .replace(/-/g, " ")
    .trim();

  if (/^\d+$/.test(trimmed)) {
    return `Door ${trimmed}`;
  }

  return trimmed
    .split(/\s+/)
    .map((part) =>
      /^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
