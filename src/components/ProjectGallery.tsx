import Image from "next/image";
import { TrackedDoorList } from "@/components/TrackedDoorList";
import { projectPhotos } from "@/content/projects";

export function ProjectGallery({ limit }: { limit?: number }) {
  const photos = limit ? projectPhotos.slice(0, limit) : projectPhotos;
  const items = photos.map((photo) => ({
    id: photo.src.split("/").pop()?.replace(/.[a-z0-9]+$/i, "") ?? photo.src,
    name: photo.title,
    configuration: "Project photo",
  }));
  return (
    <TrackedDoorList
      className="project-grid"
      doors={items}
      listId="project_gallery"
      listName="Project gallery"
    >
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
    </TrackedDoorList>
  );
}
