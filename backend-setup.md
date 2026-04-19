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

## Required env vars (payment providers)
- `OWR_STRIPE_SECRET_KEY`
- `OWR_STRIPE_WEBHOOK_SECRET`
- `OWR_PAYPAL_CLIENT_ID`
- `OWR_PAYPAL_CLIENT_SECRET`
- `OWR_PAYPAL_BASE_URL` (default sandbox)
- `OWR_SUCCESS_URL` (default: `http://localhost:8000/charity/thank-you`)
- `OWR_CANCEL_URL` (default: `http://localhost:8000/charity/cancelled`)
- `OWR_ADMIN_API_KEY` (optional but recommended for tax/report endpoints)

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
- `GET /one-world-relief.css`
- `GET /one-world-relief.js`

## Cloudflare path later (free plan)
1. Keep your schema from `one-world-relief/cloudflare-d1-schema.sql` for D1.
2. Keep using the same table names so migration stays straightforward.
3. Move these backend routes into Cloudflare Workers (or Pages Functions).
4. Replace `sqlite3` calls with D1 prepared statements.
5. Keep webhook endpoints public and protect admin endpoints with `OWR_ADMIN_API_KEY`.
