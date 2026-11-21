"use client";

import { memo, useLayoutEffect, useRef, type RefObject } from "react";
import { business } from "@/lib/business";

const ORIGINAL_HREF = `tel:${business.phoneTel}`;
const ORIGINAL_TEXT = business.phoneDisplay;
const STORAGE_KEY = "ae-ghl-swapped-phone";

type Swapped = { text: string; href: string };

function readSwapped(): Swapped | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Swapped;
    if (parsed?.text && parsed.text !== ORIGINAL_TEXT) return parsed;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

function writeSwapped(partial: Partial<Swapped>) {
  try {
    const prev = readSwapped() ?? { text: ORIGINAL_TEXT, href: ORIGINAL_HREF };
    const next: Swapped = {
      text:
        partial.text && partial.text !== ORIGINAL_TEXT ? partial.text : prev.text,
      href:
        partial.href && partial.href !== ORIGINAL_HREF ? partial.href : prev.href,
    };
    if (next.text === ORIGINAL_TEXT && next.href === ORIGINAL_HREF) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * LeadConnector mutates phone text and tel: hrefs after paint. React must not
 * write the original showroom number back on a later render (header menu,
 * remount, hydration). Persist the swap for this tab and restore it before
 * the browser paints.
 */
function useKeepSwappedNumber(elRef: RefObject<HTMLElement | null>, isAnchor: boolean) {
  const swapped = useRef<Swapped | null>(null);

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;

    swapped.current = swapped.current ?? readSwapped();

    const apply = (value: Swapped) => {
      if (el.textContent !== value.text) el.textContent = value.text;
      if (isAnchor && value.href && el.getAttribute("href") !== value.href) {
        el.setAttribute("href", value.href);
      }
    };

    const capture = () => {
      const text = (el.textContent ?? "").trim();
      const href = isAnchor ? (el.getAttribute("href") ?? "") : "";
      const partial: Partial<Swapped> = {};
      if (text && text !== ORIGINAL_TEXT) partial.text = text;
      if (isAnchor && href && href !== ORIGINAL_HREF) partial.href = href;
      if (!partial.text && !partial.href) return;
      writeSwapped(partial);
      swapped.current = readSwapped() ?? swapped.current;
    };

    if (swapped.current) apply(swapped.current);
    capture();

    const observer = new MutationObserver(capture);
    observer.observe(el, {
      subtree: true,
      characterData: true,
      childList: true,
      attributes: isAnchor,
      attributeFilter: isAnchor ? ["href"] : undefined,
    });
    return () => observer.disconnect();
  });
}

type TrackedPhoneProps = {
  className?: string;
  location?: string;
};

/** Clickable showroom number. GHL swaps the visible text and the tel: href. */
export const TrackedPhone = memo(function TrackedPhone({
  className,
  location,
}: TrackedPhoneProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  useKeepSwappedNumber(ref, true);

  return (
    <a
      ref={ref}
      className={className}
      data-cta-location={location}
      href={ORIGINAL_HREF}
      suppressHydrationWarning
    >
      {ORIGINAL_TEXT}
    </a>
  );
});

/** Inline showroom number in a paragraph or other text. */
export const TrackedPhoneText = memo(function TrackedPhoneText() {
  const ref = useRef<HTMLSpanElement>(null);
  useKeepSwappedNumber(ref, false);

  return (
    <span ref={ref} suppressHydrationWarning>
      {ORIGINAL_TEXT}
    </span>
  );
});
