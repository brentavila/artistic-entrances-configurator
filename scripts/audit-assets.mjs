import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultSource = "C:\\Users\\brent\\projects\\artistic-entrances-assets\\raw";
const sourceRoot = process.argv[2] || defaultSource;
const outputRoot = path.resolve("asset-audit");
const supportedExtensions = new Set([
  ".avif",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
]);

const files = await walk(sourceRoot);
const rows = [];

for (const file of files) {
  const extension = path.extname(file).toLowerCase();
  if (!supportedExtensions.has(extension)) continue;

  const fileStat = await stat(file);
  rows.push({
    sourcePath: file,
    relativePath: path.relative(sourceRoot, file),
    extension: extension.slice(1),
    bytes: fileStat.size,
    sha256: await hashFile(file),
    proposedId: slug(path.basename(file, extension)),
    reviewStatus: "needs-review",
    duplicateOf: "",
    notes: "",
  });
}

const firstByHash = new Map();
for (const row of rows) {
  const first = firstByHash.get(row.sha256);
  if (first) {
    row.duplicateOf = first.relativePath;
    row.reviewStatus = "duplicate";
  } else {
    firstByHash.set(row.sha256, row);
  }
}

await mkdir(outputRoot, { recursive: true });
await writeFile(
  path.join(outputRoot, "asset-manifest.csv"),
  toCsv(rows),
  "utf8",
);
const byExtension = rows.reduce((counts, row) => {
  counts[row.extension] = (counts[row.extension] || 0) + 1;
  return counts;
}, {});
await writeFile(
  path.join(outputRoot, "summary.json"),
  JSON.stringify(
    {
      sourceRoot,
      generatedAt: new Date().toISOString(),
      supportedFiles: rows.length,
      duplicateFiles: rows.filter((row) => row.duplicateOf).length,
      byExtension,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(
  `Audited ${rows.length} supported files. Results: ${outputRoot}`,
);

async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(entryPath) : [entryPath];
    }),
  );
  return nested.flat();
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

function slug(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function toCsv(items) {
  const headers = [
    "sourcePath",
    "relativePath",
    "extension",
    "bytes",
    "sha256",
    "proposedId",
    "reviewStatus",
    "duplicateOf",
    "notes",
  ];
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return [
    headers.join(","),
    ...items.map((item) => headers.map((key) => quote(item[key])).join(",")),
  ].join("\n");
}
