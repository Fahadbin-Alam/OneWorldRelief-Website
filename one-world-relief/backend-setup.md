<!-- Author: Fahadbin Alam (fma52), 4/19/26 -->
<!-- Mod by Codex, 4/19/26 -->
<!-- From One World Relief donation backend integration, 4/19/26 -->
# One World Relief Backend Setup

## What this backend now does
- Stores donors in SQLite (`charity_donors`)
- Stores donation transactions with date and status (`charity_donations`)
- Auto-generates receipts after successful payment (`charity_receipts`)
- Stores an audit log for payment events (`charity_audit_logs`)
- Supports checkout creation for:
  - PayPal
  - Credit card (via Stripe Checkout)
  - Stripe
- Supports tax CSV export by date/status/email

## Local runtime
Use Python 3.11 for the backend. The Dockerfile already uses Python 3.11.

This local machine currently has Python 3.14, which can fail while installing pinned FastAPI/Pydantic dependencies because some native wheels are not available for that version yet.

## Required env vars (payment providers)
- `OWR_STRIPE_SECRET_KEY` - your Stripe secret key from the Stripe Dashboard
- `OWR_STRIPE_WEBHOOK_SECRET` - your Stripe webhook signing secret for `/charity/webhooks/stripe`
- `OWR_PUBLIC_SITE_URL` - public production URL, currently `https://one-world-relief.org`
- `OWR_GOOGLE_SHEET_ID` - Google Sheet ID for the donation log
- `OWR_GOOGLE_SHEET_TAB` - Google Sheet tab name, currently `Donations (2026)`
- `OWR_GOOGLE_SERVICE_ACCOUNT_EMAIL` - Google service account email shared on the Sheet
- `OWR_GOOGLE_PRIVATE_KEY` - Google service account private key, stored as a secret
- `OWR_GOOGLE_SERVICE_ACCOUNT_JSON` - optional alternative to separate Google email/private key secrets
- `OWR_RESEND_API_KEY` - required for custom OneWorld Relief receipt emails
- `OWR_RECEIPT_FROM_EMAIL` - verified sender, for example `OneWorld Relief <receipts@one-world-relief.org>`
- `OWR_RECEIPT_REPLY_TO` - optional reply-to address for receipt emails
- `OWR_VENMO_URL` - optional Venmo profile/payment URL for external Venmo donations
- `OWR_PAYPAL_CLIENT_ID`
- `OWR_PAYPAL_CLIENT_SECRET`
- `OWR_PAYPAL_BASE_URL` (default sandbox)
- `OWR_SUCCESS_URL` (default: `http://localhost:8000/charity/thank-you`)
- `OWR_CANCEL_URL` (default: `http://localhost:8000/charity/cancelled`)
- `OWR_ADMIN_API_KEY` (optional but recommended for tax/report endpoints)

## Stripe setup checklist
1. In Stripe, use Checkout Sessions for One World Relief donations.
2. Put your test secret key in `OWR_STRIPE_SECRET_KEY`.
3. Add a webhook endpoint pointing to:
   - Local testing with Stripe CLI: `http://localhost:8000/charity/webhooks/stripe`
   - Deployed site: `https://your-domain.com/charity/webhooks/stripe`
4. Listen for these events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.payment_failed`
5. Put the webhook signing secret in `OWR_STRIPE_WEBHOOK_SECRET`.
6. Set `OWR_SUCCESS_URL` and `OWR_CANCEL_URL` to your real deployed domain before going live.
7. Checkout sets `payment_intent_data[receipt_email]` so Stripe can send an email receipt when Stripe receipt emails are enabled.
8. Apple Pay is handled through Stripe Checkout card wallets when the donor/browser is eligible.
9. Cash App Pay is requested through Stripe Checkout with card fallback.
10. Venmo redirects externally when `OWR_VENMO_URL` is configured; manually confirm and record Venmo gifts in the sheet.
11. The Stripe webhook sends the custom OneWorld Relief receipt email through Resend when `OWR_RESEND_API_KEY` and `OWR_RECEIPT_FROM_EMAIL` are configured.

The frontend never collects card numbers. Donors are redirected to Stripe-hosted Checkout.

## Google Sheets donation log setup
1. Use the tab named `Donations (2026)` in the spreadsheet.
2. Add these headers in row 1:
   `Donation ID | Date | Donor Name | Amount ($) | Purpose/Fund | Method | Receipt ID | Notes`
3. In Google Cloud Console, enable the Google Sheets API.
4. Create a service account and JSON key.
5. Share the spreadsheet with the service account email as an editor.
6. Store the service account email and private key in Cloudflare Pages environment variables.

The Stripe webhook sends the custom receipt email and appends completed checkout sessions to Google Sheets in columns A:H. Donor email, Session ID, payment status, payment intent, receipt URL, and receipt email status are stored together in the Notes column so the dashboard layout stays aligned without adding columns. If Sheets has an outage or credentials are missing, the webhook returns `500` so Stripe retries the event instead of silently losing a dashboard row.

## Zakat calculator and donation metadata (2026-08-17 release pending)
The dedicated Zakat experience is designed as an educational Zakat al-mal estimate, not a fatwa or a replacement for advice from a qualified scholar. Its language switcher supports English (`en`), Bangla (`bn`), Urdu (`ur`), and Arabic (`ar`); Urdu and Arabic render right-to-left. The calculation supports:

- a `2.5%` rate for a lunar/Hijri year;
- a `2.577%` rate when a donor deliberately uses a solar year;
- a gold nisab based on the current value of `87.48 g` of gold;
- a silver nisab based on the current value of `612.36 g` of silver; or
- a donor-entered custom threshold where a qualified scholar or trusted authority provides a different applicable value.

The donor supplies the current metal price or threshold. The site must not hard-code a supposedly current USD gold or silver price. The calculator compares net eligible assets with the selected nisab; it does not subtract the nisab from the assets before applying the rate.

All asset, debt, net-asset, metal-price, and nisab-dollar values stay in the donor's browser. They must never be placed in a URL, Stripe metadata, a receipt, logs, or Google Sheets. Only the following exact, non-financial context object may accompany a Zakat checkout:

```json
{
  "version": "owr-zakat-v1",
  "language": "en",
  "year_basis": "hijri",
  "nisab_basis": "gold"
}
```

The four keys are required and no extra keys are allowed. `language` must be `en`, `bn`, `ur`, or `ar`; `year_basis` must be `hijri` or `solar`; and `nisab_basis` must be `gold`, `silver`, or `custom`. The Checkout Function accepts this context only with `program_id: "zakat"`; malformed context, extra keys, or context attached to another program must be rejected before Stripe is called. A normal direct Zakat donation without calculator context remains valid. Zakat uses the existing minimum donation of `$5`.

For a completed Zakat gift, the established Google Sheet contract remains exactly A:H:

`Donation ID | Date | Donor Name | Amount ($) | Purpose/Fund | Method | Receipt ID | Notes`

Column E (`Purpose/Fund`) is `Zakat`. Column H (`Notes`) adds the sanitized donor email plus safe labels for calculator version, language, year basis/rate, and nisab basis. It must not contain any raw calculator amounts. As with all donations, every A:H value is formula-neutralized before the `USER_ENTERED` append. No test payment or live Google Sheets row should be created merely to verify this feature; use mocked webhook coverage and safe invalid-request probes unless the owner explicitly authorizes a real donation.

The public explanatory rules are grounded in Qur'an 9:60 and current guidance from Islamic Relief UK, National Zakat Foundation, and Muslim Hands. The owner's earlier Zakat note files were unavailable during this update; only cached topic titles such as eligible recipients, people who cannot receive Zakat, loans, and Zakat al-Fitr could be recovered. Do not represent the site's wording as a verbatim transcription of those notes, and do not copy any private personal calculations into the website.

## Custom receipt email template
The webhook emails this plain-text receipt after `checkout.session.completed`:

```text
OneWorld Relief
EIN: 41-5079927

Donation Receipt

Receipt ID: R-2026-05-04-001
Donor Name: [Name]
Date: [Date]
Amount: $[Amount]
Method: [Stripe / Venmo]

Thank you for your generous contribution to OneWorld Relief, a 501(c)(3) nonprofit organization.

No goods or services were provided in exchange for this contribution.

This donation may be tax-deductible to the extent allowed by law.

Sincerely,
OneWorld Relief
```

## Production domain checklist
`one-world-relief.org` must have DNS records in Cloudflare before donation links, QR codes, and Stripe redirect URLs can work on the custom domain.

Required records:
- Apex/root: `one-world-relief.org` should point to the active Cloudflare Pages project target. In Cloudflare Pages custom domains this is usually created by adding the custom domain in the Pages dashboard.
- WWW: `www.one-world-relief.org` should be a CNAME to the same Pages target or redirect to the apex domain.

After DNS is active, set:
- `OWR_PUBLIC_SITE_URL=https://one-world-relief.org`
- `OWR_SUCCESS_URL=https://one-world-relief.org/charity/thank-you`
- `OWR_CANCEL_URL=https://one-world-relief.org/charity/cancelled`

## API endpoints added
- `POST /charity/donations/checkout`
- `POST /charity/paypal/capture/{order_id}`
- `POST /charity/webhooks/stripe`
- `POST /charity/webhooks/paypal`
- `POST /charity/donations/{donation_id}/mock-complete` (admin/testing)
- `GET /charity/donations` (admin)
- `GET /charity/donations/export.csv` (admin)
- `GET /charity/receipts/{receipt_number}` (admin)

## Frontend page routes
- `GET /charity`
- `GET /charity/index.html`
- `GET /charity/about.html`
- `GET /charity/projects.html`
- `GET /charity/donate.html`
- `GET /charity/contact.html`
- `GET /one-world-relief.css`
- `GET /one-world-relief.js`
- `GET /project-data.js`

## Adding project photos and videos
Project cards are powered by `project-data.js`. To add a new project, create a new object with:
- `title`
- `category`
- `status`
- `location`
- `date`
- `amountRaised`
- `impact`
- `summary`
- `update`
- `thumbnailUrl`
- `mediaUrl`
- `donationUrl`

For videos, the easiest workflow is to upload to YouTube as public or unlisted and paste the video URL into `mediaUrl`.
For photos, place optimized images in an assets folder later, or use a hosted image URL in `thumbnailUrl`.

## Cloudflare path later (free plan)
1. Keep your schema from `one-world-relief/cloudflare-d1-schema.sql` for D1.
2. Keep using the same table names so migration stays straightforward.
3. Move these backend routes into Cloudflare Workers (or Pages Functions).
4. Replace `sqlite3` calls with D1 prepared statements.
5. Keep webhook endpoints public and protect admin endpoints with `OWR_ADMIN_API_KEY`.
