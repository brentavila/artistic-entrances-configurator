import Script from "next/script";

const SRC = process.env.NEXT_PUBLIC_GHL_CALL_TRACKING_SRC ?? "";

/**
 * GoHighLevel number-pool script (dynamic number insertion). Off until
 * NEXT_PUBLIC_GHL_CALL_TRACKING_SRC is set to the script URL from
 * GHL > Settings > Phone Numbers > Number Pools. It swaps the showroom number
 * shown on the page, (725) 302-1391, for a pool number per visitor, so each
 * call is tied to that visitor's source in GHL. It loads after React has
 * rendered so the swap is not undone.
 */
export function CallTracking() {
  if (!/^https:\/\/[^\s"'<>]+$/.test(SRC)) return null;
  return <Script id="ghl-call-tracking" src={SRC} strategy="afterInteractive" />;
}
