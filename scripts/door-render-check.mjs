// Contact sheets and a coverage scan for src/lib/door-render.ts.
//
//   node scripts/door-render-check.mjs [outDir] [--only id,id] [--no-scan]
//
// Writes one JPEG sheet per few sampled doors (original, mask, the four glass
// types, five finishes, and exterior rows for some doors), then analyzes all
// catalog doors and prints how many have reliable glass.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { analyzeDoor, renderDoor, swatchMean } from "../src/lib/door-render.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const outDir =
  args.find((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--only")) ??
  path.join(
    "C:/Users/brent/AppData/Local/Temp/claude/baf0893e1dbc51ac/45bfb1ea-1785-41a7-8cf7-174a0a28bd0c/scratchpad",
    "door-render",
  );
mkdirSync(outDir, { recursive: true });

const catalog = JSON.parse(readFileSync(path.join(root, "src/data/catalog.json"), "utf8"));
const publicPath = (url) => path.join(root, "public", url.replace(/^\//, ""));

async function readRgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

// Glass textures (optional; the renderer falls back to procedural relief).
const glassIds = catalog.glass.map((item) => item.id);
const textures = {};
for (const id of glassIds) {
  const file = path.join(root, "public/media/render/glass", `${id}.webp`);
  textures[id] = existsSync(file) ? await readRgba(file) : null;
}
console.log(
  "glass textures:",
  glassIds.map((id) => `${id}=${textures[id] ? "file" : "procedural"}`).join(" "),
);

// Finishes, using the swatch photo mean when there is one.
const finishes = {};
for (const finish of catalog.finishes) {
  let textureMean = null;
  if (finish.textureUrl) {
    textureMean = swatchMean(await readRgba(publicPath(finish.textureUrl)));
  }
  finishes[finish.id] = { hex: finish.hex, textureMean };
}
console.log(
  "swatch means:",
  Object.entries(finishes)
    .map(([id, value]) => `${id}=${value.textureMean ? value.textureMean.join(",") : value.hex}`)
    .join(" "),
);

const TILE = 220;
const STUDIO_BG = { r: 244, g: 239, b: 230 };
const EXTERIOR_BG = { r: 176, g: 160, b: 138 };

async function tileFromRgba(rgba, background) {
  return sharp(Buffer.from(rgba.data.buffer, rgba.data.byteOffset, rgba.data.byteLength), {
    raw: { width: rgba.width, height: rgba.height, channels: 4 },
  })
    .resize(TILE - 8, TILE - 24, { fit: "contain", background: { ...background, alpha: 0 } })
    .flatten({ background })
    .extend({ top: 4, bottom: 20, left: 4, right: 4, background })
    .png()
    .toBuffer();
}

function maskImage(analysis) {
  const { width, height, coverage, glass } = analysis;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const o = p * 4;
    const cover = coverage[p] / 255;
    // Without reliable glass, show where the finish goes instead: dark gray
    // gets the finish, amber stays as photographed.
    const a = analysis.hasGlass ? glass[p] / 255 : 1 - analysis.finishWeight[p] / 255;
    // Background magenta, iron dark gray, glass cyan (amber when unreliable).
    const gr = analysis.hasGlass ? 40 : 250;
    const gg = analysis.hasGlass ? 210 : 170;
    const gb = analysis.hasGlass ? 230 : 40;
    const ir = 60;
    const r = ir + (gr - ir) * a;
    const g = ir + (gg - ir) * a;
    const b = ir + (gb - ir) * a;
    data[o] = 230 + (r - 230) * cover;
    data[o + 1] = 60 + (g - 60) * cover;
    data[o + 2] = 200 + (b - 200) * cover;
    data[o + 3] = 255;
  }
  return { data, width, height };
}

function labelSvg(text, width) {
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(
    `<svg width="${width}" height="16" xmlns="http://www.w3.org/2000/svg"><text x="4" y="12" font-family="Arial" font-size="11" fill="#333">${safe}</text></svg>`,
  );
}

const SAMPLE_REQUIRED = [
  "website-images-1",
  "website-images-4",
  "website-images-500",
  "website-images-250",
  "website-images-1000",
  "website-images-47",
  "website-images-61",
];
const EXTERIOR_DOORS = new Set([
  "website-images-1",
  "website-images-250",
  "website-images-61",
  "website-images-765",
]);

function pickSample() {
  const only = option("--only");
  if (only) return only.split(",");
  const picked = new Set(SAMPLE_REQUIRED.filter((id) => catalog.doors.some((d) => d.id === id)));
  // Deterministic spread over singles and doubles.
  const singles = catalog.doors.filter((d) => d.layout === "single");
  const doubles = catalog.doors.filter((d) => d.layout === "double");
  for (let i = 0; picked.size < 22 && i < 40; i += 1) {
    picked.add(doubles[Math.floor((i * 37 + 5) % doubles.length)].id);
  }
  for (let i = 0; picked.size < 34 && i < 40; i += 1) {
    picked.add(singles[Math.floor((i * 23 + 3) % singles.length)].id);
  }
  [
    "website-images-765",
    "website-images-140",
    "website-images-1014",
    "website-images-163",
    // Doors without reliable glass, to check the iron-only finish.
    "website-images-126",
    "website-images-489",
    "website-images-95",
    "website-images-679",
    "website-images-6",
    "website-images-42",
    "website-images-50",
    "website-images-41",
    "website-images-428",
  ].forEach(
    (id) => catalog.doors.some((d) => d.id === id) && picked.add(id),
  );
  return [...picked];
}

const studioFinishes = ["white", "off-white", "gold", "red", "walnut", "matte-black"];

async function doorRow(door) {
  const source = await readRgba(publicPath(door.imageUrl));
  const started = performance.now();
  const analysis = analyzeDoor(source);
  const analyzeMs = performance.now() - started;
  const tiles = [];
  const labels = [];
  tiles.push(await tileFromRgba(source, STUDIO_BG));
  labels.push(`${door.id} (${door.layout})`);
  if (!analysis) {
    labels.push("analysis failed");
    return { tiles, labels, rows: 1, door, analysis, analyzeMs, renderMs: 0 };
  }
  tiles.push(await tileFromRgba(maskImage(analysis), STUDIO_BG));
  labels.push(
    `mask ${analysis.hasGlass ? "glass" : analysis.reason}${analysis.finishable ? "" : " NO-FINISH"} ${(analysis.glassShare * 100).toFixed(0)}%`,
  );
  let renderMs = 0;
  const render = (glassId, finishId, scene) => {
    const t = performance.now();
    const result = renderDoor(analysis, {
      glass: glassId ? { id: glassId, texture: textures[glassId] } : null,
      finish: finishId && finishId !== "as-shown" ? finishes[finishId] : null,
      scene,
    });
    renderMs = Math.max(renderMs, performance.now() - t);
    return result;
  };
  for (const id of glassIds) {
    tiles.push(await tileFromRgba(render(id, null, "studio"), STUDIO_BG));
    labels.push(`${id}`);
  }
  for (const id of studioFinishes) {
    tiles.push(await tileFromRgba(render("clear", id, "studio"), STUDIO_BG));
    labels.push(`${id}`);
  }
  let rows = 1;
  if (EXTERIOR_DOORS.has(door.id)) {
    rows = 2;
    tiles.push(await tileFromRgba(source, EXTERIOR_BG));
    labels.push("exterior");
    tiles.push(await tileFromRgba(render(null, null, "exterior"), EXTERIOR_BG));
    labels.push("cutout as shown");
    for (const id of glassIds) {
      tiles.push(await tileFromRgba(render(id, null, "exterior"), EXTERIOR_BG));
      labels.push(`ext ${id}`);
    }
    for (const id of studioFinishes) {
      tiles.push(await tileFromRgba(render(id === "gold" ? "rain" : "clear", id, "exterior"), EXTERIOR_BG));
      labels.push(`ext ${id}`);
    }
  }
  return { tiles, labels, rows, door, analysis, analyzeMs, renderMs };
}

const COLS = 12;
async function writeSheet(rows, name) {
  const totalRows = rows.reduce((sum, row) => sum + row.rows, 0);
  const composites = [];
  let rowIndex = 0;
  for (const row of rows) {
    row.tiles.forEach((tile, index) => {
      const left = (index % COLS) * TILE;
      const top = (rowIndex + Math.floor(index / COLS)) * TILE;
      composites.push({ input: tile, left, top });
      composites.push({ input: labelSvg(row.labels[index] ?? "", TILE), left, top: top + TILE - 18 });
    });
    if (row.tiles.length === 1 && row.labels[1]) {
      composites.push({ input: labelSvg(row.labels[1], TILE), left: TILE, top: rowIndex * TILE + 10 });
    }
    rowIndex += row.rows;
  }
  const file = path.join(outDir, name);
  await sharp({
    create: { width: COLS * TILE, height: totalRows * TILE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toFile(file);
  return file;
}

const sample = pickSample();
console.log(`sampling ${sample.length} doors`);
const rows = [];
for (const id of sample) {
  const door = catalog.doors.find((item) => item.id === id);
  if (!door) {
    console.log(`  ${id}: not in catalog`);
    continue;
  }
  const row = await doorRow(door);
  rows.push(row);
  const a = row.analysis;
  console.log(
    `  ${id.padEnd(20)} ${door.layout.padEnd(6)} ${
      a
        ? `${a.hasGlass ? "glass" : a.reason.padEnd(5)} share=${(a.glassShare * 100).toFixed(1)}% iron=${a.iron.median}/${a.iron.low}-${a.iron.high} crop=${a.width}x${a.height}`
        : "FAILED"
    } analyze=${row.analyzeMs.toFixed(0)}ms render=${row.renderMs.toFixed(0)}ms`,
  );
}
const sheets = [];
const PER_SHEET = 5;
for (let i = 0; i < rows.length; i += PER_SHEET) {
  const name = `sheet-${String(i / PER_SHEET + 1).padStart(2, "0")}.jpg`;
  sheets.push(await writeSheet(rows.slice(i, i + PER_SHEET), name));
}
console.log("sheets:");
sheets.forEach((file) => console.log(`  ${file}`));

if (!flag("--no-scan")) {
  const counts = { glass: 0, noGlass: 0, failed: 0, noFinish: 0 };
  const noFinish = [];
  const reasons = {};
  const failed = [];
  let slowest = 0;
  let total = 0;
  for (const door of catalog.doors) {
    const source = await readRgba(publicPath(door.imageUrl));
    const t = performance.now();
    const analysis = analyzeDoor(source);
    const ms = performance.now() - t;
    total += ms;
    slowest = Math.max(slowest, ms);
    if (!analysis) {
      counts.failed += 1;
      failed.push(door.id);
    } else if (analysis.hasGlass) {
      counts.glass += 1;
    } else {
      counts.noGlass += 1;
      if (!analysis.finishable) {
        counts.noFinish += 1;
        noFinish.push(door.id);
      }
      reasons[analysis.reason] = reasons[analysis.reason] ?? [];
      reasons[analysis.reason].push(door.id);
    }
  }
  console.log(
    `scan of ${catalog.doors.length} doors: hasGlass true=${counts.glass} false=${counts.noGlass} failed=${counts.failed}`,
  );
  for (const [reason, ids] of Object.entries(reasons)) {
    console.log(`  ${reason}: ${ids.length} (${ids.slice(0, 12).join(", ")}${ids.length > 12 ? ", ..." : ""})`);
  }
  console.log(
    `  finish not drawable (no glass and iron unclear): ${counts.noFinish} (${noFinish.slice(0, 20).join(", ")})`,
  );
  if (failed.length) console.log(`  failed: ${failed.join(", ")}`);
  console.log(`  analyze time avg=${(total / catalog.doors.length).toFixed(0)}ms max=${slowest.toFixed(0)}ms`);
}
