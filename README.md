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
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` — public Cloudinary cloud name
- `CLOUDINARY_API_KEY` — server or local upload script only
- `CLOUDINARY_API_SECRET` — server or local upload script only

Never commit `.env.local`.

## Asset Workflow

Raw and processed media live outside this repository:

`C:\Users\brent\projects\artistic-entrances-assets\`

1. Copy original door images to `raw\doors\`.
2. Copy the source catalog to `raw\catalog\`.
3. Run `npm run audit:assets`.
4. Review `asset-audit\asset-manifest.csv` and assign final catalog IDs.
5. Crop catalog options and export optimized files to `processed\`.
6. Add Cloudinary credentials to `.env.local`.
7. Run `npm run cdn:upload`.
8. Review `data\cloudinary-manifest.json` and replace temporary catalog URLs.

The current catalog contains five temporary public images referenced by the existing Artistic Entrances site. All option names and compatibility must be reviewed by the owners before launch.

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
- Upload optimized product images to the production CDN
- Configure and test the n8n webhook
- Verify GoHighLevel contact, opportunity, tags, and workflow
- Validate GTM events and conversion deduplication
- Test mobile performance, keyboard navigation, and form error recovery
- Deploy staging for owner approval
- Obtain explicit approval before changing live Google Ads destinations
