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

Both lead forms append these to the `/api/quote` form data (the API ignores unknown fields until a later task reads them). Empty values are skipped.

- **Attribution** (`src/lib/attribution.ts`, stored in `localStorage` key `ae-attribution`): `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `gclid` filled from the last touch, falling back to the first touch; plus `gbraid`, `wbraid`, `fbclid`, `msclkid`, `landing_page`, `referrer`; plus the first touch as `first_utm_source` ... `first_timestamp`. First touch is kept forever once set. Last touch is replaced when a visit arrives with any campaign parameter, or with a new external referrer.
- **GA identifiers**: `ga_client_id` and `ga_session_id`, read from the `_ga` and `_ga_4CTB6N724J` cookies. Useful for joining a CRM lead to GA4 or BigQuery sessions.
- **Door interest** (`src/lib/interest.ts`, stored in `localStorage` key `ae-interest`, capped at 40 doors): `interest_top_door_id`, `interest_top_door_name`, `interest_doors` (a readable line such as `Door 8 (single) ×7 viewed, designed, previewed; Door 21 (single) ×3 viewed`), `interest_door_ids` (up to 5, comma separated), `interest_glass`, `interest_finish`, `interest_layout`. Score weights: view 1, select 3, design 5, save 6, preview 8, quote 10. The planner should call `recordInterest("preview", door)` when it renders a door on the visitor's photo.

## Adding a new event

1. Add a typed helper to `src/lib/analytics.ts` that calls `track(name, params)`. Prefer a GA4 recommended event name; otherwise use a short snake_case custom name.
2. If the event is about a door, build the payload with `doorItem()` and pass it as `items`.
3. Call the helper from the component. Never push to `window.dataLayer` directly and never declare a local `track()`.
4. For a plain link or button click, you often need no code: add `data-cta="my_cta_id"` (and optionally `data-cta-location="section_name"` on the element or a parent).
5. Add a row to the table above, and register any new parameter as a custom dimension in GA4.
