"use client";

import { useEffect } from "react";
import { trackContact, trackCta, currentPageType, type ContactMethod } from "@/lib/analytics";
import { captureAttribution } from "@/lib/attribution";

function contactMethod(href: string): ContactMethod | null {
  const lower = href.toLowerCase();
  if (lower.startsWith("tel:")) return "phone";
  if (lower.startsWith("mailto:")) return "email";
  if (lower.startsWith("sms:")) return "sms";
  if (
    /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com)/.test(
      lower,
    )
  ) {
    return "directions";
  }
  return null;
}

/** Captures campaign attribution once, then tracks clicks site-wide. */
export function AnalyticsProvider() {
  useEffect(() => {
    captureAttribution();

    function onClick(event: MouseEvent) {
      try {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const locationOf = (el: Element) =>
          el.closest("[data-cta-location]")?.getAttribute("data-cta-location") ||
          currentPageType();

        const link = target.closest("a[href]");
        const method = link ? contactMethod(link.getAttribute("href") ?? "") : null;
        if (link && method) trackContact(method, locationOf(link));

        const cta = target.closest("[data-cta]");
        if (cta) {
          const destination = cta.getAttribute("href") ?? undefined;
          trackCta(cta.getAttribute("data-cta") ?? "unknown", locationOf(cta), destination);
        }
      } catch {
        /* never throw from a click handler */
      }
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
