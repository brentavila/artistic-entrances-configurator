import Script from "next/script";
import { NumberPoolRefresh } from "@/components/NumberPoolRefresh";

/** Google Ads call-tracking pool from LeadConnector (HighLevel). */
const GOOGLE_ADS_POOL_SRC =
  "https://backend.leadconnectorhq.com/appengine/loc/uK4q8lpwDpm1J32DZxO4/pool/n8dME9VzbHSKFH2Xt4fi/number_pool.js";

const SESSION_SRC =
  process.env.NEXT_PUBLIC_GHL_SESSION_SRC ??
  "https://backend.leadconnectorhq.com/appengine/js/user_session.js";

/** Optional extra pool from GHL > Settings > Phone Numbers > Number Pools. */
const EXTRA_POOL_SRC = process.env.NEXT_PUBLIC_GHL_CALL_TRACKING_SRC ?? "";

const valid = (value: string) => /^https:\/\/[^\s"'<>]+$/.test(value);

function sameSrc(a: string, b: string) {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

/**
 * GoHighLevel call tracking. The Google Ads number-pool script and
 * user_session.js load on every page, in the order LeadConnector provided.
 * Both use afterInteractive so React hydrates before the DOM text is swapped.
 *
 * NEXT_PUBLIC_GHL_CALL_TRACKING_SRC is still honored for a second pool. It is
 * skipped when it is the same URL as the Google Ads pool so the same script
 * is not injected twice.
 */
export function CallTracking() {
  const extraPool =
    valid(EXTRA_POOL_SRC) && !sameSrc(EXTRA_POOL_SRC, GOOGLE_ADS_POOL_SRC)
      ? EXTRA_POOL_SRC
      : "";

  return (
    <>
      <Script
        id="ghl-google-ads-number-pool"
        src={GOOGLE_ADS_POOL_SRC}
        strategy="afterInteractive"
      />
      {valid(SESSION_SRC) ? (
        <Script id="ghl-user-session" src={SESSION_SRC} strategy="afterInteractive" />
      ) : null}
      {extraPool ? (
        <Script id="ghl-call-tracking" src={extraPool} strategy="afterInteractive" />
      ) : null}
      <NumberPoolRefresh />
    </>
  );
}
