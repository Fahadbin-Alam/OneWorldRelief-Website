<!-- Author: Fahadbin Alam (fma52), 4/19/26 -->
<!-- Mod by Codex, 4/19/26 -->
<!-- From One World Relief donation backend integration, 4/19/26 -->
# One World Relief Backend Setup

The site is static HTML, CSS, and JS hosted on Cloudflare Pages. The donation backend is a set of Cloudflare Pages Functions in `functions/`. There is no separate server or database to run.

## How a donation works
1. The donor fills in the form on `donate.html` (or starts from the quick form on the homepage).
2. `one-world-relief.js` posts the donation to `POST /charity/donations/checkout`.
3. That function creates a Stripe Checkout Session and returns its URL. The donor is redirected to Stripe-hosted Checkout, so the site never sees card numbers.
4. Stripe sends the donor back to `/charity/thank-you` on success or `/charity/cancelled` if they back out.
5. Stripe calls `POST /charity/webhooks/stripe`. On `checkout.session.completed`, the webhook adds a row to the Google Sheet donation log. Rows whose Stripe Session ID is already in the Sheet are skipped, so resent events don't create duplicates.

Online donations must be between $1 and $10,000. The limits are set in `functions/charity/donations/checkout.js` and repeated in `one-world-relief.js` for the in-page error message.

PayPal is not live yet. The checkout function rejects any payment method other than Stripe/card.

## Functions
| Route | File | Purpose |
| --- | --- | --- |
| `POST /charity/donations/checkout` | `functions/charity/donations/checkout.js` | Validates the donation and creates a Stripe Checkout Session |
| `POST /charity/webhooks/stripe` | `functions/charity/webhooks/stripe.js` | Verifies the Stripe signature and logs completed donations to Google Sheets |
| `GET /charity/thank-you` | `functions/charity/thank-you.js` | Success page after checkout |
| `GET /charity/cancelled` | `functions/charity/cancelled.js` | Page shown when the donor cancels checkout |

## Environment variables (Cloudflare Pages > Settings > Variables and Secrets)
- `OWR_STRIPE_SECRET_KEY`: Stripe secret key. Store it as a secret.
- `OWR_STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret. A comma-separated list is accepted while you rotate secrets.
- `OWR_GOOGLE_SHEET_ID`: ID of the donation log spreadsheet. If this isn't set, the Sheets sync is skipped.
- `OWR_GOOGLE_SHEET_TAB`: Tab name, currently `Donations (2026)`. Defaults to `Donations`.
- `OWR_GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google service account email that has edit access to the Sheet.
- `OWR_GOOGLE_PRIVATE_KEY`: That service account's private key. Store it as a secret.

## Stripe setup checklist
1. Put the secret key in `OWR_STRIPE_SECRET_KEY`. Use a test key until you're ready to go live.
2. In the Stripe Dashboard, add a webhook endpoint at `https://<your-domain>/charity/webhooks/stripe`.
3. Subscribe it to `checkout.session.completed`.
4. Put the endpoint's signing secret in `OWR_STRIPE_WEBHOOK_SECRET`.
5. Redeploy the Pages project so the functions pick up the new variables.

## Google Sheets donation log setup
1. In the spreadsheet, use the tab named in `OWR_GOOGLE_SHEET_TAB`.
2. Add these headers in row 1 (columns A to J):
   `Donation ID | Date | Donor Name | Donor Email | Amount | Campaign | Stripe Session ID | Payment Status | Payment Intent ID | Stripe Checkout URL`
3. In Google Cloud Console, enable the Google Sheets API.
4. Create a service account and a JSON key.
5. Share the spreadsheet with the service account email as an editor.
6. Store the service account email and private key in the Cloudflare Pages variables above.

Keep the Stripe Session ID in column G, because the duplicate check reads that column. If Sheets is down or the credentials are missing, the webhook still returns success to Stripe and logs the error in the Cloudflare function logs.

## Adding projects
Project cards on `projects.html` are generated from `project-data.js`. Use `PROJECT_INTAKE_TEMPLATE.md` to collect the details. Leave `mediaUrl` empty until a real photo or video link is ready, and the card won't show a media link. Set `status` to `Completed`, `Active`, or `Planned`, and the counts at the top of the page will update to match.

## Not built yet
`cloudflare-d1-schema.sql` sketches tables for donors, donations, receipts, and an audit log. It isn't connected to anything yet. If you add a D1 database later, bind it to the Pages project and write to it from the webhook alongside the Sheets log.
