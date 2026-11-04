import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const manifest = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile(path.resolve("data/supabase-manifest.json"), "utf8"),
  ),
);

const outRoot = path.resolve("public/media");
const concurrency = 16;
let index = 0;
let ok = 0;
let failed = 0;
const failures = [];

async function download(asset) {
  const destination = path.join(outRoot, asset.objectPath);
  await mkdir(path.dirname(destination), { recursive: true });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(asset.publicUrl, {
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(destination, bytes);
      ok += 1;
      return;
    } catch (error) {
      if (attempt === 3) {
        failed += 1;
        failures.push({
          path: asset.objectPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

const queue = manifest.assets.slice();

async function worker() {
  while (queue.length) {
    const asset = queue.shift();
    index += 1;
    if (!asset) return;
    await download(asset);
    if (index % 100 === 0) {
      console.log(`mirrored ${ok} ok, ${failed} failed, ${queue.length} left`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(JSON.stringify({ ok, failed, failures: failures.slice(0, 20) }, null, 2));
if (failed) process.exitCode = 1;
