// Builds the home page hero assets.
//
//   node scripts/build-hero.mjs            build plates, door cutouts, data, QA
//   node scripts/build-hero.mjs --scan     list curation candidates and write
//                                          contact sheets to the QA folder
//
// Inputs: public/hero/home-{single,double}.webp (3840x2160 plates, never
// modified), src/data/catalog.json, public/media/doors/full/*.webp and
// src/lib/door-render.ts. Outputs: public/hero/plate-*.webp, public/hero/
// doors/**, public/hero/matte-*.webp and src/data/hero-doors.json.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { analyzeDoor, renderDoor } from "../src/lib/door-render.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const QA_DIR =
  process.env.HERO_QA_DIR ??
  "C:/Users/brent/AppData/Local/Temp/claude/baf0893e1dbc51ac/45bfb1ea-1785-41a7-8cf7-174a0a28bd0c/scratchpad/hero";

const PLATE_W = 3840;
const PLATE_H = 2160;

// Inner door openings in plate pixels, measured from luminance profiles and a
// debug overlay: inside the stucco casing, from the casing's inner edge, down
// to the bottom of the threshold (the light sill below stays visible).
const OPENINGS = {
  single: { x: 1694, y: 752, w: 435, h: 933 },
  double: { x: 1571, y: 751, w: 686, h: 921 },
};

// Curated from the --scan contact sheets. Order is the order on the site.
// Picked for range: classic scrollwork, vine and grape work, arched lites
// with spandrels, square grids, X and diamond patterns, and modern slots,
// in a mix of black and dark bronze. Numbers are catalog ids
// ("website-images-N").
const CHOSEN = {
  single: [631, 632, 384, 8, 410, 645, 461, 99, 851, 78],
  double: [52, 598, 101, 34, 559, 382, 346, 130, 580, 413],
};

const PLATE_WIDTHS = [1280, 1920, 2880];
const CUTOUT_SCALE = 1100 / 933; // about 2x the opening at a 1080p view
const THUMB_H = 240;

const catalog = JSON.parse(readFileSync(path.join(root, "src/data/catalog.json"), "utf8"));
const byId = new Map(catalog.doors.map((door) => [door.id, door]));
const publicPath = (url) => path.join(root, "public", url.replace(/^\//, ""));

async function readRgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

const rawSharp = (rgba) =>
  sharp(Buffer.from(rgba.data.buffer, rgba.data.byteOffset, rgba.data.byteLength), {
    raw: { width: rgba.width, height: rgba.height, channels: 4 },
  });

/** Share of the top band of the crop that is door (1 = square top corners). */
function topFill(analysis) {
  const { width: w, height: h, coverage } = analysis;
  const rows = [Math.round(h * 0.006), Math.round(h * 0.015)];
  let worst = 1;
  for (const y of rows) {
    let filled = 0;
    for (let x = 0; x < w; x += 1) if (coverage[y * w + x] > 128) filled += 1;
    worst = Math.min(worst, filled / w);
  }
  // Corners specifically: an arch leaves them empty.
  const cornerY = Math.round(h * 0.03);
  const cx = Math.round(w * 0.03);
  const corners =
    (coverage[cornerY * w + cx] > 128 ? 1 : 0) + (coverage[cornerY * w + (w - 1 - cx)] > 128 ? 1 : 0);
  return corners === 2 ? worst : 0;
}

function ironTone(analysis) {
  // Rough label for the scan listing only; the final mix was judged by eye.
  const [r, , b] = analysis.iron.color;
  return analysis.iron.median > 70 || r - b > 18 ? "bronze" : "black";
}

async function scan() {
  mkdirSync(QA_DIR, { recursive: true });
  const found = { single: [], double: [] };
  for (const door of catalog.doors) {
    const layout = door.layout;
    if (layout !== "single" && layout !== "double") continue;
    const file = publicPath(door.imageUrl);
    if (!existsSync(file)) continue;
    const analysis = analyzeDoor(await readRgba(file));
    if (!analysis || !analysis.hasGlass) continue;
    const o = OPENINGS[layout];
    const aspect = analysis.width / analysis.height;
    const target = o.w / o.h;
    const off = Math.abs(aspect / target - 1);
    if (off > 0.07) continue;
    const fill = topFill(analysis);
    if (fill < 0.97) continue;
    found[layout].push({
      id: door.id,
      aspect: +aspect.toFixed(3),
      off: +off.toFixed(3),
      glass: +analysis.glassShare.toFixed(2),
      tone: ironTone(analysis),
      median: analysis.iron.median,
      analysis,
    });
  }
  for (const layout of ["single", "double"]) {
    const list = found[layout];
    console.log(`${layout}: ${list.length} candidates`);
    for (const item of list) {
      console.log(
        `  ${item.id} aspect=${item.aspect} off=${item.off} glass=${item.glass} tone=${item.tone} median=${item.median}`,
      );
    }
    // Contact sheets, 8 columns of 180 px tiles with the id underneath.
    const tile = 180;
    const cols = 8;
    for (let page = 0; page * 48 < list.length; page += 1) {
      const items = list.slice(page * 48, page * 48 + 48);
      const rows = Math.ceil(items.length / cols);
      const composites = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const rendered = renderDoor(item.analysis, {
          glass: { id: "clear" },
          finish: null,
          scene: "exterior",
        });
        const img = await rawSharp(rendered)
          .resize(tile - 10, tile + 40, { fit: "contain", background: { r: 150, g: 132, b: 112, alpha: 1 } })
          .flatten({ background: { r: 150, g: 132, b: 112 } })
          .png()
          .toBuffer();
        const label = Buffer.from(
          `<svg width="${tile}" height="20"><text x="4" y="14" font-size="12" font-family="Arial" fill="#fff">${item.id.replace("website-images-", "")} ${item.tone[0]} ${item.aspect}</text></svg>`,
        );
        const x = (i % cols) * tile;
        const y = Math.floor(i / cols) * (tile + 64);
        composites.push({ input: img, left: x + 5, top: y + 2 });
        composites.push({ input: label, left: x, top: y + tile + 42 });
      }
      await sharp({
        create: { width: cols * tile, height: rows * (tile + 64), channels: 3, background: "#222" },
      })
        .composite(composites)
        .jpeg({ quality: 82 })
        .toFile(path.join(QA_DIR, `scan-${layout}-${page + 1}.jpg`));
    }
  }
}

if (args.includes("--scan")) {
  await scan();
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Lighting: the entry sits in soft open shade under the porch roof.    */
/* ------------------------------------------------------------------ */

// Tuned against the QA composites. Values are applied in 0..255 space.
const LIGHT = {
  lift: 16, // black iron in shade still picks up bounce light
  topGain: 0.8, // deeper shade under the porch soffit
  bottomGain: 0.95, // ground bounce near the threshold
  tint: [1.03, 1.0, 0.93], // warm stucco bounce
  headShadow: 0.38, // casing and head jamb shadow on the top edge
  headShadowPx: 16,
  sideShadow: 0.22,
  sideShadowPx: 9,
  highlightKnee: 205, // soften studio highlights on the glass
};

function lightDoor(rgba) {
  const { width: w, height: h, data } = rgba;
  const out = Buffer.alloc(w * h * 3);
  const tints = LIGHT.tint;
  for (let y = 0; y < h; y += 1) {
    const v = y / (h - 1);
    const gain = LIGHT.topGain + (LIGHT.bottomGain - LIGHT.topGain) * Math.pow(v, 0.8);
    const head = 1 - LIGHT.headShadow * Math.exp(-y / LIGHT.headShadowPx);
    for (let x = 0; x < w; x += 1) {
      const edge = Math.min(x, w - 1 - x);
      const side = 1 - LIGHT.sideShadow * Math.exp(-edge / LIGHT.sideShadowPx);
      const shade = gain * head * side;
      const i = (y * w + x) * 4;
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        let value = data[i + c];
        if (value > LIGHT.highlightKnee) {
          value = LIGHT.highlightKnee + (value - LIGHT.highlightKnee) * 0.45;
        }
        value = LIGHT.lift + value * (1 - LIGHT.lift / 255);
        out[o + c] = Math.max(0, Math.min(255, Math.round(value * shade * tints[c])));
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Build                                                                */
/* ------------------------------------------------------------------ */

const fileSize = (file) => `${(statSync(file).size / 1024).toFixed(0)} KB`;
const report = [];

async function buildPlates() {
  const plates = {};
  for (const layout of ["single", "double"]) {
    const master = path.join(root, `public/hero/home-${layout}.webp`);
    const sources = [];
    for (const width of PLATE_WIDTHS) {
      const name = `plate-${layout}-${width}.webp`;
      const file = path.join(root, "public/hero", name);
      const quality = width <= 1280 ? 70 : width <= 1920 ? 66 : 62;
      await sharp(master)
        .resize(width)
        .webp({ quality, effort: 6, smartSubsample: true })
        .toFile(file);
      sources.push({ src: `/hero/${name}`, width });
      report.push(`${name} ${fileSize(file)}`);
    }
    plates[layout] = sources;
  }
  return plates;
}

async function buildDoors(textures) {
  const doors = { single: [], double: [] };
  for (const layout of ["single", "double"]) {
    const o = OPENINGS[layout];
    const outW = Math.round(o.w * CUTOUT_SCALE);
    const outH = Math.round(o.h * CUTOUT_SCALE);
    const dir = path.join(root, "public/hero/doors", layout);
    mkdirSync(dir, { recursive: true });
    for (const number of CHOSEN[layout]) {
      const id = `website-images-${number}`;
      const door = byId.get(id);
      if (!door) throw new Error(`missing door ${id}`);
      if (door.layout !== layout) throw new Error(`${id} is ${door.layout}, not ${layout}`);
      const analysis = analyzeDoor(await readRgba(publicPath(door.imageUrl)));
      if (!analysis || !analysis.hasGlass) throw new Error(`${id} has no reliable glass`);
      const off = Math.abs(analysis.width / analysis.height / (o.w / o.h) - 1);
      if (off > 0.07) throw new Error(`${id} aspect is ${(off * 100).toFixed(1)}% off`);
      if (topFill(analysis) < 0.97) throw new Error(`${id} does not have a square top`);
      const rendered = renderDoor(analysis, {
        glass: { id: "clear", texture: textures.clear },
        finish: null,
        scene: "exterior",
      });
      // The door unit fills the opening edge to edge. Open spandrel grilles
      // and soft frame edges are flattened onto a dark frame color so no
      // part of the old door can show through.
      const [r, g, b] = analysis.iron.color.map((value) => Math.round(value * 0.6));
      const fitted = await rawSharp(rendered)
        .flatten({ background: { r, g, b } })
        .resize(outW, outH, { fit: "fill", kernel: "lanczos3" })
        .ensureAlpha()
        .raw()
        .toBuffer();
      const lit = lightDoor({ data: fitted, width: outW, height: outH });
      const litSharp = () => sharp(lit, { raw: { width: outW, height: outH, channels: 3 } });
      const cutout = path.join(dir, `${number}.webp`);
      await litSharp().webp({ quality: 78, effort: 6 }).toFile(cutout);
      const thumb = path.join(dir, `${number}-thumb.webp`);
      await litSharp().resize({ height: THUMB_H }).webp({ quality: 74, effort: 6 }).toFile(thumb);
      report.push(`${layout}/${number}.webp ${fileSize(cutout)}, thumb ${fileSize(thumb)}`);
      doors[layout].push({
        id,
        name: door.name,
        cutout: `/hero/doors/${layout}/${number}.webp`,
        thumb: `/hero/doors/${layout}/${number}-thumb.webp`,
      });
    }
  }
  return doors;
}

/** Mirrors the CSS contact shadow along the threshold (plate pixels). */
function contactShadowSvg(width) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 40}" height="22">
    <defs><filter id="b" x="-10%" y="-100%" width="120%" height="300%"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <rect x="20" y="5" width="${width}" height="6" fill="rgb(20,12,6)" opacity="0.55" filter="url(#b)"/>
  </svg>`;
}

/** Each door on its plate, cropped around the entry, for review. */
async function buildQa(doors) {
  mkdirSync(QA_DIR, { recursive: true });
  for (const layout of ["single", "double"]) {
    const o = OPENINGS[layout];
    const master = path.join(root, `public/hero/home-${layout}.webp`);
    const crop = { left: o.x - 230, top: o.y - 160, width: o.w + 460, height: o.h + 300 };
    const tiles = [];
    for (const door of doors[layout]) {
      const cutout = await sharp(path.join(root, "public", door.cutout))
        .resize(o.w, o.h, { fit: "fill" })
        .png()
        .toBuffer();
      // Crop first, then composite: sharp applies extract before composite.
      const composed = await sharp(await sharp(master).extract(crop).png().toBuffer())
        .composite([
          { input: cutout, left: o.x - crop.left, top: o.y - crop.top },
          {
            input: Buffer.from(contactShadowSvg(o.w)),
            left: o.x - crop.left - 20,
            top: o.y - crop.top + o.h - 6,
          },
        ])
        .jpeg({ quality: 86 })
        .toBuffer();
      const number = door.id.replace("website-images-", "");
      await sharp(composed).toFile(path.join(QA_DIR, `qa-${layout}-${number}.jpg`));
      tiles.push(await sharp(composed).resize({ height: 600 }).toBuffer());
    }
    const meta = await sharp(tiles[0]).metadata();
    const cols = 5;
    await sharp({
      create: {
        width: meta.width * cols,
        height: meta.height * Math.ceil(tiles.length / cols),
        channels: 3,
        background: "#111",
      },
    })
      .composite(
        tiles.map((input, i) => ({
          input,
          left: (i % cols) * meta.width,
          top: Math.floor(i / cols) * meta.height,
        })),
      )
      .jpeg({ quality: 80 })
      .toFile(path.join(QA_DIR, `qa-${layout}-sheet.jpg`));
  }
}

/* ------------------------------------------------------------------ */
/* Foreground matte: the house with the sky removed, so the giant word  */
/* can sit between the sky and the roofline.                            */
/* ------------------------------------------------------------------ */

const MATTE_BAND = 0.42; // top share of the plate the word can overlap
const MATTE_WIDTHS = [1920, 2880];

function isSky(r, g, b) {
  // Clear desert sky: deep blue at the top, near white at the right horizon.
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (b < r) return false;
  if (min < 140) return false;
  return b - r > 6 || (min > 225 && max - min < 16);
}

async function buildMattes() {
  const out = {};
  for (const layout of ["single", "double"]) {
    const master = path.join(root, `public/hero/home-${layout}.webp`);
    const bandH = Math.round(PLATE_H * MATTE_BAND);
    const { data } = await sharp(master)
      .extract({ left: 0, top: 0, width: PLATE_W, height: bandH })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const W = PLATE_W;
    const N = W * bandH;
    const sky = new Uint8Array(N);
    const stack = new Int32Array(N);
    let top = 0;
    const px = (p) => [data[p * 3], data[p * 3 + 1], data[p * 3 + 2]];
    const push = (p, from) => {
      if (sky[p]) return;
      const [r, g, b] = px(p);
      if (!isSky(r, g, b)) return;
      if (from >= 0) {
        const [fr, fg, fb] = px(from);
        if (Math.abs(r - fr) + Math.abs(g - fg) + Math.abs(b - fb) > 14) return;
      }
      sky[p] = 1;
      stack[top++] = p;
    };
    for (let x = 0; x < W; x += 1) push(x, -1);
    while (top > 0) {
      const p = stack[--top];
      const x = p % W;
      if (x > 0) push(p - 1, p);
      if (x < W - 1) push(p + 1, p);
      if (p >= W) push(p - W, p);
      if (p < N - W) push(p + W, p);
    }
    // Keep only foreground connected to the bottom of the band (the house);
    // stray specks in the sky gradient become sky.
    const house = new Uint8Array(N);
    const keep = (p) => {
      if (house[p] || sky[p]) return;
      house[p] = 1;
      stack[top++] = p;
    };
    for (let x = 0; x < W; x += 1) keep(N - W + x);
    while (top > 0) {
      const p = stack[--top];
      const x = p % W;
      if (x > 0) keep(p - 1);
      if (x < W - 1) keep(p + 1);
      if (p >= W) keep(p - W);
      if (p < N - W) keep(p + W);
    }
    for (let p = 0; p < N; p += 1) if (!house[p]) sky[p] = 1;
    // Foreground alpha with a feathered edge.
    const alpha = Buffer.alloc(N);
    for (let p = 0; p < N; p += 1) alpha[p] = sky[p] ? 0 : 255;
    const feathered = await sharp(alpha, { raw: { width: W, height: bandH, channels: 1 } })
      .blur(1.2)
      .extractChannel(0)
      .raw()
      .toBuffer();
    const rgba = Buffer.alloc(N * 4);
    for (let p = 0; p < N; p += 1) {
      rgba[p * 4] = data[p * 3];
      rgba[p * 4 + 1] = data[p * 3 + 1];
      rgba[p * 4 + 2] = data[p * 3 + 2];
      rgba[p * 4 + 3] = sky[p] ? 0 : feathered[p];
    }
    const sources = [];
    for (const width of MATTE_WIDTHS) {
      const name = `matte-${layout}-${width}.webp`;
      const file = path.join(root, "public/hero", name);
      await sharp(rgba, { raw: { width: W, height: bandH, channels: 4 } })
        .resize(width)
        .webp({ quality: 66, alphaQuality: 80, effort: 6 })
        .toFile(file);
      sources.push({ src: `/hero/${name}`, width });
      report.push(`${name} ${fileSize(file)}`);
    }
    // QA: the matte over a loud color reveals any ragged edge.
    const loud = await sharp({
      create: { width: W, height: bandH, channels: 3, background: "#c0186a" },
    })
      .composite([{ input: rgba, raw: { width: W, height: bandH, channels: 4 } }])
      .png()
      .toBuffer();
    await sharp(loud)
      .extract({ left: 0, top: 0, width: W, height: bandH })
      .resize(1920)
      .jpeg({ quality: 85 })
      .toFile(path.join(QA_DIR, `matte-${layout}.jpg`));
    out[layout] = { band: MATTE_BAND, sources };
  }
  return out;
}

const fraction = (value, total) => +(value / total).toFixed(6);

async function main() {
  const clear = path.join(root, "public/media/render/glass/clear.webp");
  const textures = { clear: existsSync(clear) ? await readRgba(clear) : null };
  mkdirSync(QA_DIR, { recursive: true });
  const fast = args.includes("--doors-only");
  if (!fast) await buildPlates();
  const mattes = fast
    ? null
    : await buildMattes();
  const doors = await buildDoors(textures);
  const data = { version: 1, plateWidth: PLATE_W, plateHeight: PLATE_H, layouts: {} };
  for (const layout of ["single", "double"]) {
    const o = OPENINGS[layout];
    data.layouts[layout] = {
      plate: {
        src: `/hero/plate-${layout}-1920.webp`,
        sources: PLATE_WIDTHS.map((width) => ({ src: `/hero/plate-${layout}-${width}.webp`, width })),
      },
      opening: {
        x: fraction(o.x, PLATE_W),
        y: fraction(o.y, PLATE_H),
        w: fraction(o.w, PLATE_W),
        h: fraction(o.h, PLATE_H),
      },
      matte: {
        band: MATTE_BAND,
        sources: MATTE_WIDTHS.map((width) => ({ src: `/hero/matte-${layout}-${width}.webp`, width })),
      },
      doors: doors[layout],
    };
  }
  if (mattes) console.log("mattes built");
  writeFileSync(path.join(root, "src/data/hero-doors.json"), `${JSON.stringify(data, null, 2)}\n`);
  await buildQa(doors);
  console.log(report.join("\n"));
}

await main();
