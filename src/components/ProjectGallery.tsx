import Image from "next/image";
import { projectPhotos } from "@/content/projects";

export function ProjectGallery({ limit }: { limit?: number }) {
  const photos = limit ? projectPhotos.slice(0, limit) : projectPhotos;
  return (
    <div className="project-grid">
      {photos.map((photo) => (
        <figure key={photo.src}>
          <span className="project-frame">
            <Image
              alt={photo.alt}
              fill
              sizes="(max-width: 700px) 100vw, 33vw"
              src={photo.src}
            />
          </span>
          <figcaption>
            <strong>{photo.title}</strong>
            <span>{photo.caption}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
