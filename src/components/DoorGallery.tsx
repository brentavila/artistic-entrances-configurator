"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { TrackedDoorList } from "@/components/TrackedDoorList";
import { catalog } from "@/lib/catalog";

export function DoorGallery() {
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<"all" | "single" | "double">("all");
  const [visible, setVisible] = useState(24);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.doors.filter((door) => {
      if (layout !== "all" && door.layout !== layout) return false;
      if (!needle) return true;
      return [door.id, door.name, door.slug, door.style, door.configuration, door.layout]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [layout, query]);
  const shown = filtered.slice(0, visible);

  return (
    <section className="gallery-section">
      <div className="layout-filter" role="group" aria-label="Door type">
        {(
          [
            ["all", "All doors"],
            ["single", "Single doors"],
            ["double", "Double doors"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-pressed={layout === id}
            className={layout === id ? "selected" : ""}
            key={id}
            onClick={() => {
              setLayout(id);
              setVisible(24);
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="door-results-copy">
        Single and double groups come from the catalog photo. A wide single
        door can sit with the doubles until the list is reviewed.
      </p>
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
      <TrackedDoorList
        className="featured-grid"
        doors={shown}
        listId="door_gallery"
        listName="Door gallery"
      >
        {shown.map((door) => (
          <a className="door-card" data-door-id={door.id} href={`/design-your-door?door=${door.id}`} key={door.id}>
            <span className="door-thumb">
              <Image alt={door.alt} fill sizes="(max-width: 700px) 46vw, 240px" src={door.thumbnailUrl} unoptimized />
            </span>
            <strong>{door.name}</strong>
            <small>Design this door</small>
          </a>
        ))}
      </TrackedDoorList>
      {visible < filtered.length ? (
        <button className="secondary-action" type="button" onClick={() => setVisible((count) => count + 24)}>
          Load More Doors
        </button>
      ) : null}
    </section>
  );
}
