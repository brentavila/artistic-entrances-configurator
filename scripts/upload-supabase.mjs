import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "artistic-entrances-doors";
const sourceRoot =
  process.argv[2] ||
  "C:\\Users\\brent\\projects\\artistic-entrances-assets\\processed";
const allowedExtensions = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
}

const files = (await walk(sourceRoot)).filter((file) =>
  allowedExtensions.has(path.extname(file).toLowerCase()),
);
const uploaded = [];

for (const file of files) {
  const relative = path.relative(sourceRoot, file).split(path.sep).join("/");
  const objectPath = relative;
  const bytes = await readFile(file);
  const contentType = contentTypeFor(file);

  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: bytes,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Supabase upload failed for ${relative}: ${response.status} ${errorText}`,
    );
  }

  uploaded.push({
    relativePath: relative,
    objectPath,
    publicUrl: publicUrl(supabaseUrl, bucket, objectPath),
    bytes: bytes.byteLength,
    contentType,
  });
  console.log(`Uploaded ${relative}`);
}

await writeFile(
  path.resolve("data", "supabase-manifest.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      bucket,
      assets: uploaded,
    },
    null,
    2,
  ),
  "utf8",
);
console.log(`Uploaded ${uploaded.length} assets to Supabase bucket "${bucket}".`);

function publicUrl(baseUrl, bucketName, objectPath) {
  return `${baseUrl}/storage/v1/object/public/${bucketName}/${objectPath}`;
}

function contentTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".webp":
      return "image/webp";
    case ".avif":
      return "image/avif";
    case ".png":
      return "image/png";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

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
