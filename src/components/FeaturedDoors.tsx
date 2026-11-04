import Image from "next/image";
import { catalog } from "@/lib/catalog";

export function FeaturedDoors() {
  const doors = catalog.doors.filter((door) => door.featured).slice(0, 6);

  return (
    <div className="featured-grid">
      {doors.map((door) => (
        <a className="door-card" href={`/design-your-door?door=${door.id}`} key={door.id}>
          <span className="door-thumb">
            <Image alt={door.alt} fill sizes="(max-width: 700px) 50vw, 280px" src={door.thumbnailUrl} unoptimized />
          </span>
          <strong>{door.name}</strong>
          <small>{door.style}</small>
        </a>
      ))}
    </div>
  );
}
