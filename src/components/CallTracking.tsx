import Script from "next/script";

const POOL_SRC = process.env.NEXT_PUBLIC_GHL_CALL_TRACKING_SRC ?? "";
// GoHighLevel's session script. It records the visitor's source so each call
// in GHL is tied to it. The pool script below swaps the number on the page.
const SESSION_SRC =
  process.env.NEXT_PUBLIC_GHL_SESSION_SRC ??
  "https://backend.leadconnectorhq.com/appengine/js/user_session.js";

const valid = (value: string) => /^https:\/\/[^\s"'<>]+$/.test(value);

/**
 * GoHighLevel call tracking: the visitor-session script plus the number-pool
 * script (dynamic number insertion). Off until NEXT_PUBLIC_GHL_CALL_TRACKING_SRC
 * is set to the pool script URL from GHL > Settings > Phone Numbers > Number
 * Pools. It swaps the showroom number shown on the page, (725) 302-1391, for a
 * pool number per visitor. Both load after React has rendered, so the swap is
 * not undone, and in the order GoHighLevel's instructions give.
 */
export function CallTracking() {
  if (!valid(POOL_SRC)) return null;
  return (
    <>
      {valid(SESSION_SRC) && (
        <Script id="ghl-user-session" src={SESSION_SRC} strategy="afterInteractive" />
      )}
      <Script id="ghl-call-tracking" src={POOL_SRC} strategy="afterInteractive" />
    </>
  );
}
