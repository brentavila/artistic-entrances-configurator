export const GTM_ID = "GTM-TPFGF2VM";

/**
 * Real <script> tags, first children of <head>. next/script hid GTM from
 * Tag Assistant because it stored the snippet in a Next.js payload.
 */
export function GoogleTagManagerHead() {
  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`,
        }}
      />
    </>
  );
}

/** Official noscript iframe. Place immediately after `<body>`. */
export function GoogleTagManagerNoscript() {
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
