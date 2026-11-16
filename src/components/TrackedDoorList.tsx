"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { selectDoor, viewDoorList, type DoorLike } from "@/lib/analytics";

/**
 * Wraps a grid of doors. Fires view_item_list once when the grid scrolls into
 * view, and select_item when a child marked with data-door-id is clicked.
 * Server components can pass their already-rendered grid in as children.
 */
export function TrackedDoorList({
  listId,
  listName,
  doors,
  className,
  children,
}: {
  listId: string;
  listName: string;
  doors: DoorLike[];
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const doorsRef = useRef(doors);

  useEffect(() => {
    doorsRef.current = doors;
  }, [doors]);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        viewDoorList(listId, listName, doorsRef.current);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [listId, listName]);

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const hit = target.closest("[data-door-id]");
    const id = hit?.getAttribute("data-door-id");
    if (!id) return;
    const index = doorsRef.current.findIndex((door) => door.id === id);
    if (index < 0) return;
    selectDoor(doorsRef.current[index], { id: listId, name: listName }, { index });
  }

  return (
    <div ref={ref} className={className} onClick={onClick}>
      {children}
    </div>
  );
}
