import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const catalogPath = path.resolve("src/data/catalog.json");
const prefix =
  "https://slsdmsqylhyknwhqertw.supabase.co/storage/v1/object/public/artistic-entrances-doors/";

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

async function localUrl(url) {
  if (typeof url !== "string" || !url.startsWith(prefix)) return url;
  const relative = url.slice(prefix.length);
  try {
    await access(path.resolve("public/media", relative));
    return `/media/${relative}`;
  } catch {
    return url;
  }
}

for (const door of catalog.doors) {
  door.imageUrl = await localUrl(door.imageUrl);
  door.thumbnailUrl = await localUrl(door.thumbnailUrl);
}

for (const finish of catalog.finishes) {
  finish.textureUrl = await localUrl(finish.textureUrl);
}

const glassCopy = {
  clear: "Maximum light and an open view through the entry.",
  frosted: "Soft, diffused light with privacy for the foyer.",
  rain: "Vertical texture that softens the view and still lets in light.",
  aquatex: "A wavy, water-like texture with a refined, obscured view.",
};

catalog.glass = ["clear", "frosted", "rain", "aquatex"].map((id) => ({
  id,
  name: id === "aquatex" ? "Aquatex" : id.charAt(0).toUpperCase() + id.slice(1),
  description: glassCopy[id],
  thumbnailUrl: `/glass/${id}.svg`,
}));

catalog.handles = [
  {
    id: "square-pull",
    name: "Square Pull",
    description: "A straight, square-profile pull with a clean architectural line.",
    thumbnailUrl: "/handles/square-pull.svg",
  },
  {
    id: "round-pull",
    name: "Round Pull",
    description: "A full-length round pull with a classic iron-door profile.",
    thumbnailUrl: "/handles/round-pull.svg",
  },
  {
    id: "heritage-lever",
    name: "Heritage Lever",
    description: "A traditional lever set for entries that need decorative hardware.",
    thumbnailUrl: "/handles/heritage-lever.svg",
  },
];

catalog.version = "2026-11-02";
catalog.status = "local-media";
catalog.notice =
  "Door and finish photos are served from this website. Glass and handle art are stand-ins until product photos are added at public/media/catalog/handles and public/media/catalog/glass.";

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
const remoteDoors = catalog.doors.filter((door) =>
  String(door.imageUrl).startsWith("http"),
).length;
console.log(
  JSON.stringify({
    doors: catalog.doors.length,
    remoteDoors,
    sample: catalog.doors[0].imageUrl,
    glass: catalog.glass[0].thumbnailUrl,
  }),
);
