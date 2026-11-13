# Analytics event dictionary

All tracking goes through `src/lib/analytics.ts`. Every event is sent twice: as a Tag Manager object (`{ event, ...params }`, so GTM triggers can listen) and as a gtag-style push that the Google tag loaded by GTM delivers to GA4 property `G-4CTB6N724J`. There is no second gtag.js script.

Every event also carries `page_type` (home, catalog, designer, planner, gallery, projects, contact, about, landing, other). Door events carry the GA4 `items` array, so GA4's built-in item reports show most-viewed, most-selected, and most-quoted doors with no custom setup. Item fields: `item_id` (door id), `item_name`, `item_brand`, `item_category` (Single door / Double door), `item_category2` (glass), `item_category3` (finish), `item_category4` (handle), `item_variant` (`glassId/finishId`), `item_list_id`, `item_list_name`, `index`.

## Events

| Event | Fires when | File | Parameters | GA4 type | Key event? |
|---|---|---|---|---|---|
| `view_item_list` | A door grid first scrolls into view (once per mount). Lists: `featured_doors`, `door_gallery`, `designer_door_grid`, `project_gallery` (project photos, not doors) | `TrackedDoorList.tsx` (used by `FeaturedDoors`, `DoorGallery`, `ProjectGallery`, `DoorConfigurator`) | `item_list_id`, `item_list_name`, `funnel_stage=browse`, `items` (first 12) | Recommended | No |
| `select_item` | A door card is clicked in a list, or a hero button takes the visitor to the designer or planner with that door | `TrackedDoorList.tsx`, `HeroShowcase.tsx`, `DoorConfigurator.tsx` (door pick) | `item_list_id`, `item_list_name`, `funnel_stage=browse`, `items` | Recommended | No |
| `view_item` | The hero shows a door, the designer opens on a door, a door is picked in the designer, or glass/finish/handle changes (new variant) | `HeroShowcase.tsx`, `DoorConfigurator.tsx` | `funnel_stage=consider`, `items` | Recommended | No |
| `add_to_wishlist` | "Save This Door" in the designer | `DoorConfigurator.tsx` | `funnel_stage=consider`, `items` | Recommended | No |
| `add_to_cart` | "Review My Design" (design finished, moving to review) | `DoorConfigurator.tsx` | `funnel_stage=design`, `items` | Recommended | Optional (strong intent signal) |
| `begin_checkout` | First focus inside a quote or lead form | `DoorConfigurator.tsx`, `LeadForm.tsx` | `lead_type`, `funnel_stage=quote`, `items` (designer only) | Recommended | No |
| `generate_lead` | A quote or lead form submits successfully | `DoorConfigurator.tsx`, `LeadForm.tsx` | `lead_type` (`custom_door`, `catalog`, `contact`), `currency=USD`, `value` (0 unless given), `funnel_stage=lead`, `items` (designer only) | Recommended | **Yes** |
| `select_option` | An option is chosen: glass, finish, handle, lock, screen, sidelight, jamb, or the hero single/double toggle | `DoorConfigurator.tsx`, `HeroShowcase.tsx` | `option_type`, `option_id`, `item_id`, `item_name` | Custom | No |
| `funnel_step` | A designer step opens (`start`, `details`, `review`, `quote`) | `DoorConfigurator.tsx` | `flow`, `step`, `step_index` | Custom | No |
| `cta_click` | Any element with a `data-cta` attribute is clicked | `AnalyticsProvider.tsx` | `cta_id`, `cta_location` (nearest `data-cta-location`, else page type), `destination` | Custom | No |
| `contact_click` | A `tel:`, `mailto:`, `sms:`, or Google/Apple Maps link is clicked | `AnalyticsProvider.tsx` | `method` (phone, email, sms, directions), `cta_location` | Custom | Optional (phone is worth marking) |
| `form_error` | A quote or lead form fails to send | `DoorConfigurator.tsx`, `LeadForm.tsx` | `form` (`designer_quote`, `catalog`, `contact`), `reason` | Custom | No |
| `hero_door_change` | A visitor changes the door in the home page hero | `HeroShowcase.tsx` | `door_id`, `layout`, `method` (button, card, rail, keyboard, wheel, swipe) | Custom | No |
| `hero_layout_toggle` | The hero single/double toggle changes | `HeroShowcase.tsx` | `layout` | Custom | No |

The planner (`src/components/planner/PlannerApp.tsx`) still uses its own local tracking and is not on this module yet.

## GA4 admin checklist

1. **Custom dimensions** (Admin > Custom definitions > Create custom dimension, scope Event): `page_type`, `funnel_stage`, `lead_type`, `option_type`, `option_id`, `flow`, `step`, `cta_id`, `cta_location`, `method`. Parameters only appear in reports after they are registered, and only for data collected after that.
2. **Key events**: Admin > Events, mark `generate_lead` as a key event. Optionally also `add_to_cart` and `contact_click`.
3. **BigQuery export**: Admin > Product links > BigQuery links, enable daily export. This keeps raw `items` and every parameter.
4. Item reports: Reports > Monetization > Ecommerce purchases and Item views / Items added to cart. In this site "add to cart" means a finished design and "view item" means a door view. Item-scoped fields can be filtered by `item_category2` (glass) and `item_category3` (finish).

## Google Ads

`generate_lead` is also pushed to the Tag Manager dataLayer as `{ event: "generate_lead", ... }`. In GTM, create a Custom Event trigger named `generate_lead` and attach it to the existing Ads conversion tag. Avoid also importing the GA4 `generate_lead` key event into Ads as a primary conversion, or leads will be counted twice.

Enhanced conversions are off by default. Set `NEXT_PUBLIC_ENHANCED_CONVERSIONS=1` (and rebuild) to let `leadSubmitted` call `gtag('set', 'user_data', { email, phone_number })` before the event. Email and phone are never placed in event parameters or in the dataLayer event object. Turn on enhanced conversions for leads in the Google Ads conversion settings at the same time.

## Data sent with each lead

Both lead forms append these to the `/api/quote` form data, and the API reads, cleans, and forwards them (see "What reaches the CRM"). Empty values are skipped.

- **Attribution** (`src/lib/attribution.ts`, stored in `localStorage` key `ae-attribution`): `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `landing_page`, `referrer`, all taken from ONE touch (the last touch when it has a campaign parameter or an outside referrer, otherwise the first touch, so a `utm_source` from one visit is never paired with a click id from another); plus the first touch as `first_utm_source` ... `first_timestamp`. First touch is kept forever once set. Last touch is replaced when a visit arrives with any campaign parameter, or with a new external referrer.
- **GA identifiers**: `ga_client_id` and `ga_session_id`, read from the `_ga` and `_ga_4CTB6N724J` cookies. Useful for joining a CRM lead to GA4 or BigQuery sessions.
- **Door interest** (`src/lib/interest.ts`, stored in `localStorage` key `ae-interest`, capped at 40 doors): `interest_top_door_id`, `interest_top_door_name`, `interest_doors` (a readable line such as `Door 8 (single) ×7 viewed, designed, previewed; Door 21 (single) ×3 viewed`), `interest_door_ids` (up to 5, comma separated), `interest_glass`, `interest_finish`, `interest_layout`. Score weights: view 1, select 3, design 5, save 6, preview 8, quote 10. A door's score is weighted by age: full weight for 14 days after its last activity, then halved every further 14 days, so stale interest fades. Door views are only counted when the visitor chose the door (a `door` link parameter, a restored saved design, a pick in the designer, or a deliberate hero change), never for the designer's default first door.
- **Visit context**: `page_path` (where the form was submitted), `device` (`mobile` under 768px, `tablet` under 1100px, else `desktop`), `visit_count` (browser sessions on this device, localStorage `ae-visits`). The planner should call `recordInterest("preview", door)` when it renders a door on the visitor's photo.

## Adding a new event

1. Add a typed helper to `src/lib/analytics.ts` that calls `track(name, params)`. Prefer a GA4 recommended event name; otherwise use a short snake_case custom name.
2. If the event is about a door, build the payload with `doorItem()` and pass it as `items`.
3. Call the helper from the component. Never push to `window.dataLayer` directly and never declare a local `track()`.
4. For a plain link or button click, you often need no code: add `data-cta="my_cta_id"` (and optionally `data-cta-location="section_name"` on the element or a parent).
5. Add a row to the table above, and register any new parameter as a custom dimension in GA4.

## What reaches the CRM

`/api/quote` treats every tracking field as untrusted: values are trimmed, stripped of control characters, and capped at 200 characters (500 for the door list). Door ids must exist in the catalog, door names come from the catalog (never from the browser), and unknown glass or finish ids are dropped. A malformed analytics field is ignored; it never blocks a lead.

### Tags (work today, no GHL changes needed)

| Tag pattern | Example | Meaning and use |
|---|---|---|
| `quoted-door-<n>` | `quoted-door-8` | The door actually submitted on the designer quote form. Best-seller counts; "your Door 8 quote" follow-ups. |
| `interest-door-<n>` (up to 3) | `interest-door-8`, `interest-door-3` | Top doors by weighted, age-decayed interest. Works for contact and catalog forms too. SMS/email such as "still thinking about Door 8?" or a smart list of everyone interested in Door 8. |
| `interest-single-door` / `interest-double-door` | `interest-single-door` | Preferred layout. Segment single vs double offers. |
| `interest-glass-<id>` | `interest-glass-clear` | Favorite glass. "Door 8 with Clear glass" messages and glass popularity. |
| `interest-finish-<id>` | `interest-finish-matte-black` | Favorite finish. Same idea for finishes. |
| `source-google-ads` | `source-google-ads` | Last touch had gclid, gbraid, or wbraid. |
| `source-meta-ads` | `source-meta-ads` | Last touch had fbclid. |
| `source-microsoft-ads` | `source-microsoft-ads` | Last touch had msclkid. |

`<n>` is the number in the catalog name ("Door 8" is `8`); a door whose name has no number uses its id. At most 8 interest and source tags are added per lead. Existing tags (`website`, `door-configurator`, `sms-consent`, ...) are unchanged. Example tag list for a Google Ads visitor who quoted Door 8 after browsing three doors:

`website, door-configurator, greater-las-vegas, sms-consent, mockup-eligible, quoted-door-8, interest-door-8, interest-door-3, interest-door-21, interest-single-door, interest-glass-clear, interest-finish-matte-black, source-google-ads`

### Summary field

The existing summary field gets extra labelled lines (empty ones are skipped): `Doors of interest`, `Interest activity`, `Top door`, `Preferred layout / glass / finish`, `First touch`, `Last touch`, `Click ids`, `GA client id / session id`, `Visitor` (device, visit number, page). Anyone can read these in the contact record and use them as merge text.

### Optional GHL custom fields

Dedicated fields make segmentation and merge fields easier than parsing tags. To create one: GHL > Settings > Custom Fields > Add Field (single line text), then open the field and copy its id (the Custom Field key's id, a ~20 character string). Put the id in the matching environment variable (Vercel project settings, then redeploy). A variable that is empty or missing is skipped silently.

| Env var | Field content | Example |
|---|---|---|
| `GHL_FIELD_INTEREST_DOORS` | Doors of interest | `Door 8, Door 3, Door 21` |
| `GHL_FIELD_TOP_DOOR` | Top door | `Door 8 (website-images-8)` |
| `GHL_FIELD_INTEREST_GLASS` | Favorite glass name | `Clear` |
| `GHL_FIELD_INTEREST_FINISH` | Favorite finish name | `Matte Black` |
| `GHL_FIELD_FIRST_TOUCH` | First touch | `facebook / paid (/, 2026-10-20)` |
| `GHL_FIELD_LAST_TOUCH` | Last touch | `google / cpc / iron-doors-vegas (/door-designer)` |
| `GHL_FIELD_GCLID` | Google click id, for offline conversion import | `Cj0KCQ...` |
| `GHL_FIELD_GA_CLIENT_ID` | GA4 client id, to join the lead to GA4 or BigQuery | `123456.1700000000` |

### n8n

When `N8N_QUOTE_WEBHOOK_URL` is set, the site still computes `tags` and `summary` itself and forwards them, so tags and the summary lines reach GHL through the **currently deployed** workflow with no change. The forwarded form also carries the cleaned tracking values under stable names (`utm_*`, `first_*`, `gclid` and the other click ids, `ga_client_id`, `ga_session_id`, `interest_door_ids`, `interest_door_names`, `interest_top_door_id`, `interest_top_door_name`, `interest_glass`, `interest_finish`, `interest_layout`, `first_touch`, `last_touch`, `page_path`, `device`, `visit_count`) and `ghlExtraFields`, a JSON list of `{ id, field_value }` for whichever `GHL_FIELD_*` variables are set. The optional custom fields only reach GHL after the owner **republishes** the updated workflow from `n8n/artistic-entrances-website-leads.mjs`, which appends `ghlExtraFields` to the upsert's `customFields`.

## Reports you can build

- **Best sellers**: contacts tagged `quoted-door-<n>` counted per tag in GHL (Contacts > filter by tag), or GA4 > Explore with item name by `generate_lead` event count.
- **Trending doors**: GA4 Explore, item name vs Items viewed / Item list clicks, comparing the last 7 days with the previous 28 days; doors whose 7-day rate per day is well above the 28-day rate are trending.
- **Glass and finish popularity**: GA4 item reports broken down by `item_category2` (glass) and `item_category3` (finish), plus the `interest-glass-*` and `interest-finish-*` tag counts in GHL.
- **Funnel**: GA4 Explore > Funnel exploration using `funnel_stage` (browse, consider, design, quote, lead), or events `view_item_list` > `view_item` > `add_to_cart` > `begin_checkout` > `generate_lead`.
- **Lead source, first vs last touch**: compare the `First touch` and `Last touch` lines (or the two custom fields) per lead; a lead whose first touch was Meta but last touch was Google Ads shows which channel starts and which closes. Use `GA client id` to join leads to GA4 BigQuery export sessions.
