import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const sourceRoot =
  process.argv[2] ||
  "C:\\Users\\brent\\projects\\artistic-entrances-assets\\processed";
const allowedExtensions = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);

if (!cloudName || !apiKey || !apiSecret) {
  throw new Error(
    "Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.local.",
  );
}

const files = (await walk(sourceRoot)).filter((file) =>
  allowedExtensions.has(path.extname(file).toLowerCase()),
);
const uploaded = [];

for (const file of files) {
  const relative = path.relative(sourceRoot, file);
  const publicId = withoutExtension(relative)
    .split(path.sep)
    .map(slug)
    .join("/");
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(
    `folder=artistic-entrances&overwrite=false&public_id=${publicId}&timestamp=${timestamp}`,
    apiSecret,
  );
  const form = new FormData();
  const bytes = await readFile(file);

  form.set("file", new Blob([bytes]), path.basename(file));
  form.set("api_key", apiKey);
  form.set("timestamp", String(timestamp));
  form.set("folder", "artistic-entrances");
  form.set("public_id", publicId);
  form.set("overwrite", "false");
  form.set("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: form },
  );
  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `Cloudinary upload failed for ${relative}: ${result.error?.message || response.statusText}`,
    );
  }

  uploaded.push({
    relativePath: relative,
    publicId: result.public_id,
    secureUrl: result.secure_url,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format,
  });
  console.log(`Uploaded ${relative}`);
}

await writeFile(
  path.resolve("data", "cloudinary-manifest.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), assets: uploaded }, null, 2),
  "utf8",
);
console.log(`Uploaded ${uploaded.length} assets.`);

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

function sign(value, secret) {
  return createHash("sha1").update(`${value}${secret}`).digest("hex");
}

function withoutExtension(value) {
  return value.slice(0, -path.extname(value).length);
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
