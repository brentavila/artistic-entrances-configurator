# Launch runbook: artisticentrances.co

Step-by-step for moving the domain to the new site and making attribution and conversion tracking airtight. Work top to bottom. Every step says where to click and what "done" looks like.

## What exists today (checked 2026-11-16)

| Item | Where it is | Touch it? |
|---|---|---|
| Current website | GoHighLevel site builder (`www` → `sites.ludicrous.cloud`, apex → `162.159.140.166`) | Replace at cutover |
| Domain registration and DNS | GoDaddy (`ns13/ns14.domaincontrol.com`) | Change 2 records only |
| Email | Google Workspace (MX `aspmx.l.google.com` …) | **Do not touch** |
| Email sending (GHL / Mailgun) | SPF TXT includes `spf.leadconnectorhq.com` and `mailgun.org` | **Do not touch** |
| Google verification | Two `google-site-verification` TXT records | **Do not touch** |
| Shopify store | `artisticentrances.shop` (Shopify) | Add tracking only |
| Tag Manager | GTM-TPFGF2VM loads GA4 `G-4CTB6N724J` and Google Ads `AW-17928892397` | Keep |

The old site has only three URLs: `/`, `/privacy-policy`, `/terms-of-services`. The new site permanently redirects the last two to `/privacy`.

## Hosting decision

**Host on Vercel. Keep GoDaddy for the domain and DNS. Keep GoHighLevel for the CRM.**

- The new site needs a server (lead form API, the planner's door removal, image processing). The GoHighLevel site builder and GoDaddy shared hosting can't run it; Vercel is built for this stack and already deploys every branch as a preview.
- Use **Vercel Pro**. The Hobby plan is for non-commercial use.
- Don't cancel anything at GoDaddy: the domain and its DNS stay there. "Shutting down" only means pointing two DNS records at Vercel, then later removing the domain from the GoHighLevel website.

## Phase 1: accounts and keys (before launch, no visitor impact)

### 1. Google Analytics 4 (property with stream `G-4CTB6N724J`)

1. **Admin → Data streams → Web stream:**
   - Confirm the URL is `https://artisticentrances.co` and Enhanced measurement is on.
   - Open **Measurement Protocol API secrets → Create**, name it `website-server`, and copy the value into Vercel as `GA4_API_SECRET`.
2. **Same stream → Configure tag settings → Configure your domains.** Add *contains* `artisticentrances.co` and `artisticentrances.shop`. This turns on cross-domain linking: clicks between the two sites carry a `_gl` parameter and stay one visitor.
3. **Configure tag settings → List unwanted referrals.** Add `artisticentrances.co`, `artisticentrances.shop`, `checkout.shopify.com` and `shop.app`.
4. **Configure tag settings → Define internal traffic.** Add the showroom's public IP. Then go to **Admin → Data filters** and set the Internal traffic filter to *Active*.
5. **Admin → Custom definitions → Create custom dimension** (scope: Event) for each of:
   `page_type, funnel_stage, lead_type, option_type, option_id, flow, step, cta_id, cta_location, method, destination, event_id`.
6. **Admin → Events:**
   - Mark `generate_lead` as a **key event**.
   - Do **not** mark `lead_received`. It is the server-side backup used for reconciliation; marking both would count every lead twice.
7. **Admin → Data retention:** set event data to **14 months**.
8. **Admin → Product links:**
   - Link **Google Ads** (account with `AW-17928892397`).
   - Link **Search Console** (after Phase 4).
   - Link **BigQuery** with daily export. It is free at this volume and keeps raw data forever.
9. Optional cleanup: my test traffic used `utm_source=conductor_test`. Exclude it in Explorations.

### 2. Google Ads

1. **Goals → Conversions → New conversion action → Website**. Category *Submit lead form*, name `Website lead`, Count *One*, value *use the same value for each conversion* (an average job value is fine, or 0).
   - Under **Tag setup → Use Google tag**, copy the "send to" value (`AW-17928892397/XXXXXXXX`) into Vercel as `NEXT_PUBLIC_GOOGLE_ADS_LEAD_SEND_TO`.
   - The site fires it on each lead with the lead's event id as `transaction_id`, so a lead is never counted twice.
2. **Enhanced conversions for leads.** In the conversion action settings, turn on enhanced conversions (method: Google tag), then set `NEXT_PUBLIC_ENHANCED_CONVERSIONS=1` in Vercel. The privacy page already discloses this.
3. **Tag Manager check (important):** GTM-TPFGF2VM already contains a Google Ads conversion tag (label `3LWsCKbShfcbEO3flOVC`).
   - Open GTM, find what triggers it, and make sure it does **not** also count leads; otherwise every lead counts twice.
   - If it is the old site's lead conversion, pause it after cutover and make the new `Website lead` action the primary goal.
   - Keep the **Conversion Linker** tag.
4. **Goals → Summary:**
   - Set `Website lead` and *Calls from ads* (below) as **Primary**.
   - Set GA4-imported conversions to **Secondary**, so Ads doesn't double count.
5. **Settings → Auto-tagging: on.** This adds `gclid` to ad clicks, which the site stores for the lead.
6. **Offline conversions (closes the loop).** Every lead stores its `gclid`, also in a GHL field if `GHL_FIELD_GCLID` is set. Send *qualified* and *sold* stages back to Google Ads, either with GoHighLevel's Google Ads conversion integration (check what your GHL plan offers under Integrations / workflow actions) or by uploading through **Google Ads → Goals → Uploads** (Data Manager). Sold-job values let Smart Bidding optimize for revenue, not form fills.
7. **Calls from ads:** put a GoHighLevel tracking number (Step 4) on your call assets, or use Google's own call reporting. Pick one per campaign so calls aren't counted by both.

### 3. Meta (Facebook / Instagram)

1. **Events Manager → Data sources.**
   - Use **one** pixel (dataset) for both the website and Shopify. If Shopify already created one, use that pixel's id.
   - Put its id in Vercel as `NEXT_PUBLIC_META_PIXEL_ID`.
2. **Settings → Conversions API → Generate access token.** Put it in Vercel as `META_CAPI_ACCESS_TOKEN`. Server only; never in a `NEXT_PUBLIC_` variable.
3. **Business settings → Brand safety → Domains.** Verify `artisticentrances.co` (a TXT record at GoDaddy; add it, don't replace anything) and `artisticentrances.shop`.
4. **Testing:**
   - Events Manager → Test events: copy the test code into `META_TEST_EVENT_CODE`, then submit a test lead.
   - You should see `Lead` from **Browser** and from **Server**, marked *Deduplicated*.
   - **Remove `META_TEST_EVENT_CODE` afterwards.**
5. **Event match quality.** After a week, check that `Lead` scores "Good" or better. The site sends hashed email, phone, name and ZIP, plus IP, browser, `fbp` and `fbc`.
6. **Ads:** optimize lead campaigns for `Lead`. Add URL parameters to every ad: `utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`.

Browser events the site sends to Meta: `PageView`, `ViewContent` (door views), `AddToWishlist` (saved design), `CustomizeProduct` (finished design), `InitiateCheckout` (started a form), `Contact` (phone/email click), `Lead` (form sent; also from the server).

### 4. GoHighLevel: call tracking and leads

1. **Settings → Phone numbers → Number pools.**
   - Create a pool for website visitors with about 4–6 local 725/702 numbers.
   - Set the *swap number* to the showroom number exactly as the site shows it: `(725) 302-1391`.
   - Forward to the showroom line.
   - Copy the pool script URL (the one ending `number_pool.js`) into Vercel as `NEXT_PUBLIC_GHL_CALL_TRACKING_SRC`. The site also loads GoHighLevel's `user_session.js` automatically, which GHL's instructions require alongside it.
   - The site loads it on every page; each visitor sees a pool number, and the call lands in GHL with that visitor's source.
   - If GHL gives you a code snippet instead of a single URL, send it to me and I'll wire it in exactly as given.
2. **Static tracking numbers** (one per channel), shown only in that channel:
   - Google Business Profile
   - Google Ads call assets
   - Meta ads
   - Print and direct mail
   - Yard signs and vehicle wraps
   - Shopify site

   Name each number after its channel in GHL.
3. **Google Business Profile number.** Use the GBP tracking number as the *primary* phone and keep `(725) 302-1391` as an *additional* phone, so the business name, address and phone stay consistent everywhere.
4. **Call recording.** If recording is on, keep the "calls may be recorded" notice; the privacy page already says it. Nevada is a one-party-consent state, but callers can be in two-party states, so a short greeting announcement is the safe choice.
5. **SMS (A2P 10DLC).** Confirm the brand and campaign registration is approved in GHL. Use `https://artisticentrances.co/privacy` as the privacy URL. It has the consent, STOP and HELP wording.
6. **Lead delivery** (Vercel env):
   - Either `N8N_QUOTE_WEBHOOK_URL` (+ `N8N_QUOTE_WEBHOOK_TOKEN`) or `GHL_PRIVATE_INTEGRATION_TOKEN` + `GHL_LOCATION_ID`.
   - Without one of them, production forms answer "temporarily unavailable" on purpose, so no lead is silently lost.
7. **n8n:** republish the workflow from `n8n/artistic-entrances-website-leads.mjs` if you add the optional `GHL_FIELD_*` custom fields. Tags and the summary already flow through the current workflow.
8. **Pipeline:** make sure a workflow moves leads into stages (New → Qualified → Quoted → Sold), so offline conversions (Step 2.6) have stages to report.

### 5. Shopify (`artisticentrances.shop`): cross-domain

1. Install the **Google & YouTube** app and connect the **same** GA4 property and the same Google Ads account. In GA4 the Shopify traffic then shows as the same stream family; the domains list from Step 1.2 links the visitors.
2. Install the **Facebook & Instagram** app and connect the **same** pixel. Set data sharing to *Maximum*, which turns on Shopify's own Conversions API for purchases.
3. On Shopify use the Shopify tracking number from Step 4.2.
4. Links from the new site to the shop are tracked as `shop_click`. Purchases are tracked by Shopify's apps as `purchase`, in the same GA4 property and pixel.

## Phase 2: Vercel production setup

1. **Production branch.** In Vercel → Project → Settings → Git, set the production branch. The new site lives on `fable-5.2-high-v.01-updates` (plus this `conversion-tracking` branch once merged). Either merge into `main` or set the production branch to the branch you launch from.
2. **Environment variables** (Production). Values come from Phase 1.

   | Variable | From |
   |---|---|
   | `NEXT_PUBLIC_SITE_URL` | `https://artisticentrances.co` |
   | `N8N_QUOTE_WEBHOOK_URL`, `N8N_QUOTE_WEBHOOK_TOKEN` *or* `GHL_PRIVATE_INTEGRATION_TOKEN`, `GHL_LOCATION_ID` | Step 4.6 |
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Supabase project |
   | `REPLICATE_API_TOKEN` | Replicate (planner door removal) |
   | `GA4_API_SECRET` | Step 1.1 |
   | `NEXT_PUBLIC_GOOGLE_ADS_LEAD_SEND_TO` | Step 2.1 |
   | `NEXT_PUBLIC_ENHANCED_CONVERSIONS` | `1` (Step 2.2) |
   | `NEXT_PUBLIC_META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN` | Step 3 |
   | `NEXT_PUBLIC_GHL_CALL_TRACKING_SRC` | Step 4.1 |
   | `GHL_FIELD_*` (optional) | GHL custom field ids |

   `NEXT_PUBLIC_` values are built into the page, so **redeploy after changing them**.
3. **Full test on the Vercel URL before touching DNS.** Run the Phase 5 checklist on the `*.vercel.app` production URL. The Meta and GA4 server events work there; the Google Ads conversion works too.
4. **Domains.** Vercel → Project → Settings → Domains: add `artisticentrances.co` and `www.artisticentrances.co`, with `www` redirecting to the apex. Vercel then shows the exact DNS records to create; use those values.

## Phase 3: DNS cutover at GoDaddy (about 15 minutes, best on a weekday morning)

1. **The day before:** in GoDaddy → DNS, lower the TTL of the `@` A record and the `www` CNAME to 600 seconds.
2. **Cutover:**
   - Change the **A `@`** record from `162.159.140.166` to the IP Vercel shows (usually `76.76.21.21`).
   - Change the **CNAME `www`** from `sites.ludicrous.cloud` to the target Vercel shows (usually `cname.vercel-dns.com`).
   - Change **nothing else**: MX, TXT, DKIM, `_dmarc` and every Mailgun/GHL email record stay as they are.
3. **Wait** until Vercel shows both domains as *Valid* with an SSL certificate issued (minutes to an hour).
4. **Check:**
   - `https://artisticentrances.co`, `https://www.artisticentrances.co` (redirects to apex), `/privacy-policy` (redirects to `/privacy`).
   - Send a test email to `sales@artisticentrances.co` to confirm email still works.
5. **In GoHighLevel → Sites → Domains:** remove `artisticentrances.co` from the old website, so GHL stops trying to serve it. Keep the GHL account, CRM, numbers and workflows.
6. **Rollback** if anything is wrong: put the two old record values back.

## Phase 4: after cutover

1. **Search Console** (the domain is already verified by the existing TXT record):
   - Submit `https://artisticentrances.co/sitemap.xml`.
   - URL-inspect `/`, `/design-your-door`, `/planner`, `/las-vegas-iron-doors` and request indexing.
   - Watch Pages and Core Web Vitals for two weeks.
2. **Search Console → Settings → Associations:** link the GA4 property.
3. **Bing Webmaster Tools:** import the site from Search Console.
4. **Google Business Profile:**
   - Set the website to `https://artisticentrances.co/?utm_source=google&utm_medium=organic&utm_campaign=gbp`.
   - Set the phone number as in Step 4.3.
5. **Google Ads final URLs:** check every ad and sitelink still lands on a real page (no 404s). Update any that pointed at old GHL funnel paths.
6. **GTM:** pause any old-site tags that no longer apply (Step 2.3). Then **Submit and publish** the container.

## Phase 5: verification checklist (do it once on the Vercel URL, again on the live domain)

Use an incognito window and add `?utm_source=launch_test&utm_medium=qa` to the first URL.

| # | Action | Where to check | Pass when |
|---|---|---|---|
| 1 | Open home, click a door, open the designer | GA4 → Admin → DebugView (with Google Tag Assistant connected) | `view_item`, `select_item`, `funnel_step` appear with item data |
| 2 | Pick glass/finish, save, review | DebugView | `select_option`, `add_to_wishlist`, `add_to_cart` |
| 3 | Submit the designer quote form (test name) | DebugView + GHL | `generate_lead` once; GHL contact with tags `quoted-door-…`, `interest-…`, and a summary with first/last touch |
| 4 | Same lead | Meta Events Manager → Test events | `Lead` from Browser **and** Server, *Deduplicated* |
| 5 | Same lead | GA4 → Realtime | `lead_received` (server) and `generate_lead` (browser) |
| 6 | Same lead | Google Ads → Goals → Conversions → action → Diagnostics (takes up to 3 hours) | `Website lead` recorded once |
| 7 | Click a link to artisticentrances.shop | Address bar on the shop | URL carries `_gl=…`; GA4 shows one user across both sites |
| 8 | Look at the phone number on the site | Page | Shows a pool number, not `(725) 302-1391` |
| 9 | Call that number from a mobile phone | GHL → Conversations / Call reporting | Call logged with source `launch_test` |
| 10 | Planner: upload a photo, look at a door for 3+ seconds, send a quote | DebugView + GHL | `view_item` (list `planner_home_preview`), lead tags include `entry-planner` |
| 11 | Catalog and contact forms | GHL | Leads with tags `catalog-request` / `contact-form` |
| 12 | Send a form without the consent box | Page | Form refuses; no lead |

Delete the test contacts in GHL afterwards.

## Ongoing: weekly reconciliation (10 minutes)

Compare the same 7 days in each tool:

- **GHL** new website contacts: the source of truth.
- **GA4** `generate_lead`: browser, typically 5–15% lower because of ad blockers.
- **GA4** `lead_received`: server, should match GHL closely.
- **Meta** `Lead`: browser plus server, deduplicated.
- **Google Ads** `Website lead`: only ad-attributed leads.

If `lead_received` is far below the GHL count, check the Vercel logs for `[conversions]` warnings. If `generate_lead` is far below `lead_received`, more visitors than usual block tracking; the server events still cover them.

## Where things live in the code

- `src/lib/analytics.ts`: every browser event, the Meta event mapping, and the Google Ads lead conversion.
- `src/lib/server-conversions.ts`: Meta Conversions API and the GA4 Measurement Protocol, sent after the lead reaches the CRM.
- `src/components/MetaPixel.tsx`, `src/components/CallTracking.tsx`: the pixel and the GHL number pool script, each off until its env variable is set.
- `src/app/api/quote/route.ts`: lead validation, CRM delivery, then the server conversions.
- `docs/analytics.md`: the event dictionary.
