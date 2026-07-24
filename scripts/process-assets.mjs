import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourceRoot =
  process.argv[2] ||
  "C:\\Users\\brent\\projects\\artistic-entrances-assets\\raw\\doors";
const outputRoot =
  process.argv[3] ||
  "C:\\Users\\brent\\projects\\artistic-entrances-assets\\processed";
const allowedExtensions = new Set([".jpeg", ".jpg", ".png", ".webp"]);
const fullMaxWidth = 1600;
const thumbSize = 400;

const files = (await walk(sourceRoot)).filter((file) =>
  allowedExtensions.has(path.extname(file).toLowerCase()),
);

if (files.length === 0) {
  console.log(`No supported images found in ${sourceRoot}`);
  process.exit(0);
}

const processed = [];

for (const file of files) {
  const relative = path.relative(sourceRoot, file);
  const slug = slugFromPath(relative);
  const fullPath = path.join(outputRoot, "doors", "full", `${slug}.webp`);
  const thumbPath = path.join(outputRoot, "doors", "thumbnails", `${slug}.webp`);

  await mkdir(path.dirname(fullPath), { recursive: true });
  await mkdir(path.dirname(thumbPath), { recursive: true });

  const image = sharp(file, { failOn: "none" }).rotate();
  const metadata = await image.metadata();

  await sharp(file, { failOn: "none" })
    .rotate()
    .resize({ width: fullMaxWidth, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(fullPath);

  await sharp(file, { failOn: "none" })
    .rotate()
    .resize(thumbSize, thumbSize, { fit: "cover", position: "centre" })
    .webp({ quality: 80 })
    .toFile(thumbPath);

  processed.push({
    sourcePath: file,
    relativePath: relative,
    slug,
    fullPath,
    thumbPath,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  });
  console.log(`Processed ${relative} -> ${slug}.webp`);
}

await writeFile(
  path.resolve("data", "process-manifest.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceRoot,
      outputRoot,
      count: processed.length,
      assets: processed,
    },
    null,
    2,
  ),
  "utf8",
);
console.log(`Processed ${processed.length} images.`);

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

function slugFromPath(relativePath) {
  const base = path.basename(relativePath, path.extname(relativePath));
  const parent = path.dirname(relativePath);
  const parentSlug =
    parent === "."
      ? ""
      : parent
          .split(path.sep)
          .map((part) => slug(part))
          .filter(Boolean)
          .join("-");

  const fileSlug = slug(base);
  return parentSlug ? `${parentSlug}-${fileSlug}` : fileSlug;
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
