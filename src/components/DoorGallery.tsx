"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { catalog } from "@/lib/catalog";

export function DoorGallery() {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(24);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog.doors;
    return catalog.doors.filter((door) =>
      [door.id, door.name, door.slug, door.style, door.configuration]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query]);
  const shown = filtered.slice(0, visible);

  return (
    <section className="gallery-section">
      <label className="door-search">
        Search the iron door gallery
        <input
          type="search"
          value={query}
          placeholder="Search by door number or name"
          onChange={(event) => {
            setQuery(event.target.value);
            setVisible(24);
          }}
        />
      </label>
      <p className="door-results-copy">
        Showing {shown.length} of {filtered.length} doors
      </p>
      <div className="featured-grid">
        {shown.map((door) => (
          <a className="door-card" href={`/design-your-door?door=${door.id}`} key={door.id}>
            <span className="door-thumb">
              <Image alt={door.alt} fill sizes="(max-width: 700px) 46vw, 240px" src={door.thumbnailUrl} unoptimized />
            </span>
            <strong>{door.name}</strong>
            <small>Design this door</small>
          </a>
        ))}
      </div>
      {visible < filtered.length ? (
        <button className="secondary-action" type="button" onClick={() => setVisible((count) => count + 24)}>
          Load More Doors
        </button>
      ) : null}
    </section>
  );
}
