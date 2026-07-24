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

- `N8N_QUOTE_WEBHOOK_URL` — private production webhook
- `N8N_QUOTE_WEBHOOK_TOKEN` — bearer token checked by n8n
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key (for future client use)
- `SUPABASE_SERVICE_ROLE_KEY` — server-side uploads only; never expose in the browser
- `SUPABASE_STORAGE_BUCKET` — storage bucket name (default: `artistic-entrances-doors`)

Never commit `.env.local`.

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

The current catalog contains placeholder SVG door previews. All option names and compatibility must be reviewed by the owners before launch.

## Lead Delivery

`POST /api/quote` accepts multipart form data, validates required fields, enforces SMS consent, and forwards the complete design and optional entry photo to n8n. n8n is responsible for:

1. Creating or updating the GoHighLevel contact
2. Creating a custom-door opportunity
3. Storing the readable configuration summary
4. Applying the configurator source tag
5. Starting the approved response workflow

Private platform credentials must remain in n8n or the deployment secret store.

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
- Configure and test the n8n webhook
- Verify GoHighLevel contact, opportunity, tags, and workflow
- Validate GTM events and conversion deduplication
- Test mobile performance, keyboard navigation, and form error recovery
- Deploy staging for owner approval
- Obtain explicit approval before changing live Google Ads destinations
