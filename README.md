# Artistic Entrances Door Configurator

Lead-generation website for customers to explore custom iron doors, select glass, hardware, and finish options, and send a complete quote request to Artistic Entrances.

## Local Setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

The form validates locally in development when the n8n webhook is not configured. Production returns an unavailable response instead of silently losing a lead.

## Environment

- `NEXT_PUBLIC_SITE_URL` — canonical site URL
- `N8N_QUOTE_WEBHOOK_URL` — private production webhook. When set, this is the only delivery path. Set it on the host to the published n8n webhook for path `artistic-entrances-quote`. Do not commit that URL.
- `N8N_QUOTE_WEBHOOK_TOKEN` — optional bearer the site sends. The published webhook does not require it.
- `GHL_PRIVATE_INTEGRATION_TOKEN` — used only when the n8n webhook is not set
- `GHL_LOCATION_ID` — Artistic Entrances location `uK4q8lpwDpm1J32DZxO4`
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key (for future client use)
- `SUPABASE_SERVICE_ROLE_KEY` — server-side uploads only; never expose in the browser
- `SUPABASE_STORAGE_BUCKET` — storage bucket name (default: `artistic-entrances-doors`)

Never commit `.env.local`.

Door and finish photos are committed under `public/media` and referenced as `/media/...`. The site no longer depends on the Supabase project staying awake for those images. Supabase remains the upload source for new photography. The free Supabase plan pauses inactive projects, which is what made the old image URLs fail. The Pro plan is $25 per month and does not pause the project. Bill that Supabase Pro subscription to the client if the project is still used for storage uploads or the vector workflow. New handle photos belong at `public/media/catalog/handles/{id}.webp` (and the same object path in the Supabase bucket). New glass photos belong at `public/media/catalog/glass/{id}.webp`. Until those photos are added, the designer uses the SVG samples in `public/handles` and `public/glass`.

## Supabase Storage Setup

1. Create a Supabase project.
2. Create a public bucket named `artistic-entrances-doors`.
3. Add the env vars above to `.env.local`.
4. Keep the service role key out of git and out of MaaxGen Brain.

Suggested bucket layout:

```text
doors/full/{slug}.webp
doors/thumbnails/{slug}.webp
catalog/{option-id}.webp
```

Public URL format:

```text
{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artistic-entrances-doors/doors/full/{slug}.webp
```

## Asset Workflow

Raw and processed media live outside this repository:

`C:\Users\brent\projects\artistic-entrances-assets\`

1. Copy original door images to `raw\doors\`.
2. Copy the source catalog to `raw\catalog\`.
3. Run `npm run audit:assets`.
4. Review `asset-audit\asset-manifest.csv` and assign final catalog IDs.
5. Run `npm run assets:process` to create WebP full images and thumbnails in `processed\`.
6. Add Supabase credentials to `.env.local`.
7. Run `npm run assets:upload` or `npm run assets:sync`.
8. Review `data\supabase-manifest.json` and replace temporary catalog URLs.

Door photos are real catalog images. Glass and handle art are stand-ins until product photos are dropped in. Names and compatibility still need an owner review before the domain is switched.

## Pages

- `/` home, with catalog lead capture and FAQ
- `/design-your-door` door, glass, handle, and finish designer
- `/gallery` searchable door photos
- `/las-vegas-iron-doors` Las Vegas service page
- `/catalog` catalog request
- `/about`, `/contact`, `/privacy`
- `/llms.txt` answer-engine summary

Greater Las Vegas ZIP codes are listed in `src/lib/service-area.ts`. Quote requests in that area are marked mockup-eligible. Requests outside that area are tagged for conversational follow-up and do not receive an automated mockup. Image generation is not called yet. The lead record carries `mockupEligible` so a later n8n step can generate one.

## Lead Delivery

`POST /api/quote` accepts quote, catalog, and contact submissions. It checks SMS consent, computes the service area, and writes the door, glass, handle, finish, summary, service area, mockup flag, and lead type onto the GoHighLevel contact when `GHL_PRIVATE_INTEGRATION_TOKEN` is set. If `N8N_QUOTE_WEBHOOK_URL` is set, that webhook is used instead and should perform the same GoHighLevel write. Tags are added with the add-tags endpoint so existing tags are kept.

GoHighLevel contact fields on location `uK4q8lpwDpm1J32DZxO4`:

- Configurator Door `PK0Ai5QtLvVs6SzBE2A1`
- Configurator Glass `hYPtRh0Yik7MyHOCtxOU`
- Configurator Handle `0jVumOur6yFOIBsu8K1W`
- Configurator Finish `dRrt5xOac79sc5ciVQ8l`
- Configurator Summary `Pz0IOnUAR0GsdYWzxM6n`
- Configurator Service Area `EzMLpWUuTKfGEidVXlSl`
- Mockup Eligible `GvQY0CF4ViOuqhrU3EDg`
- Configurator Lead Type `uMaq7GNRqRehzsaFYQRd`
- Configurator Door Image `SUkFuAifExggDWD7gUOp` (file)
- Configurator Door Image URL `Lrq4JtFkAApDRTYB9DBT`
- Configurator Lock `yP1bPNDkogATKskSh4W4`
- Configurator Screen `RZB0VEckdMPdYIOWoDc3`
- Configurator Sidelights `9IBhVcOH3Em5YsCtPN2z`
- Configurator Jamb `6gHTr2PTXQAdrpTIXWfu`

n8n is the right place for the conversational follow-up outside Las Vegas and, later, the mockup image. It is not required to render the pages. Private platform credentials stay in n8n or the deployment secret store. The upsert must not send a `tags` array, because GoHighLevel replaces every tag on the contact. Add tags with the separate add-tags call.

## Analytics

Google Tag Manager container: `GTM-TPFGF2VM`

Events:

- `configurator_start`
- `configurator_step_view`
- `configurator_option_select`
- `configurator_complete`
- `generate_lead`

No contact information is pushed to the data layer.

## Launch Checklist

- Replace temporary catalog data with owner-reviewed records
- Upload optimized product images to Supabase Storage
- Set `N8N_QUOTE_WEBHOOK_URL` on the host to the published n8n workflow “Artistic Entrances Website Leads”, then send one labeled test lead
- Verify GoHighLevel contact, opportunity, tags, and workflow
- Validate GTM events and conversion deduplication
- Test mobile performance, keyboard navigation, and form error recovery
- Deploy staging for owner approval
- Obtain explicit approval before changing live Google Ads destinations
