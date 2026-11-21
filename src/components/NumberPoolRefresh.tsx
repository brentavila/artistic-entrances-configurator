"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    initNumberPool?: () => void;
  }
}

/**
 * number_pool.js runs once on load. App Router client navigations (next/link)
 * replace page HTML without reloading, so re-run the swap after the new route
 * has committed.
 */
export function NumberPoolRefresh() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const run = () => window.initNumberPool?.();
    const ids = [0, 250, 1000].map((ms) => window.setTimeout(run, ms));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [pathname]);

  return null;
}
