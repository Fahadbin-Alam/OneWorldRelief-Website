# One World Relief - AI Handoff Documentation
**Last Updated**: May 11, 2026  
**Created By**: Codex AI  
**For**: Future AI Sessions & Development  

---

## Executive Summary
This document provides a complete technical reference for the One World Relief non-profit website. It captures current implementation state, design decisions, integrations, and setup procedures so future AI sessions can continue work efficiently without losing context.

**Current Status**: Active Development - Stripe payment integration complete, share/QR donation UX refinement in progress.

### Standing User Instructions Logged May 4, 2026
- Keep this AI handoff document updated during One World Relief work.
- Do not include this handoff document in GitLab pushes; keep it for GitHub/personal project context only.
- Keep GitHub, GitLab, and Cloudflare synchronized after changes, while respecting the GitLab exclusion above.
- Keep One World Relief donation UX to one top-level donation CTA; do not add a second Donate link in the top nav.
- Receipt delivery and Google Sheets donation dashboard updates are production-critical.
- The custom `.org` domain must be fixed as soon as DNS/Cloudflare access allows it.

---

## 1. PROJECT OVERVIEW

### What Is This?
One World Relief is a non-profit charity donation website built with a modern frontend and backend integration. It allows donors to contribute to various humanitarian projects, track their donations, and receive receipts.

### Key Goals
- Professional, user-friendly non-profit website
- Secure payment processing (Stripe, PayPal)
- Automated receipt generation and tracking
- Multiple project showcase
- Donor relationship management

### Technology Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Python FastAPI (not actively running in this project - uses Cloudflare Functions)
- **Payment**: Stripe API + Stripe Checkout
- **Spreadsheet Integration**: Google Sheets API
- **Deployment**: Cloudflare Pages + Cloudflare Workers
- **Database**: SQLite (local development), Google Sheets (production logging)

### Project Structure
```
one-world-relief/
├── index.html                      (Homepage)
├── donate.html                     (Main donation page)
├── projects.html                   (Project showcase)
├── about.html                      (Organization info)
├── contact.html                    (Contact form)
├── share.html                      (Donation sharing + QR presentation page)
├── one-world-relief.js             (Main frontend logic)
├── one-world-relief.css            (Styling)
├── project-data.js                 (Project dataset)
├── functions/
│   └── charity/
│       ├── donations/
│       │   └── checkout.js         (Stripe checkout handler)
│       ├── webhooks/
│       │   └── stripe.js           (Stripe webhook handler)
│       ├── thank-you.js            (Success page)
│       └── cancelled.js            (Cancelled donation page)
├── assets/
│   └── projects/                   (Project images/media)
├── backend-setup.md                (Backend documentation)
├── cloudflare-d1-schema.sql        (Database schema reference)
└── PROJECT_INTAKE_TEMPLATE.md      (Project template)
```

---

## 2. CRITICAL INTEGRATIONS

### 2.1 Stripe Payment Integration
**Status**: ✅ Fully Implemented  
**What It Does**: Handles secure credit card donations via Stripe Checkout

#### How It Works
1. Donor fills form on `donate.html` with:
   - Name
   - Email
   - Amount
   - Campaign selection
2. Frontend calls `/charity/donations/checkout` (Cloudflare Function)
3. Backend creates Stripe Checkout Session
4. Donor redirected to Stripe's hosted checkout page
5. Stripe webhook (`/charity/webhooks/stripe`) catches `checkout.session.completed` event
6. Donation logged to Google Sheets with receipt number and receipt URL
7. Thank-you page displays a printable donor receipt using the Stripe Checkout Session

#### Configuration Required
| Variable | Example | Source |
|----------|---------|--------|
| `OWR_STRIPE_SECRET_KEY` | `sk_test_abc123...` | Stripe Dashboard → API Keys |
| `OWR_STRIPE_WEBHOOK_SECRET` | `whsec_abc123...` | Stripe Dashboard → Webhooks |
| `OWR_PUBLIC_SITE_URL` | `https://one-world-relief.org` | Public production domain |
| `OWR_SUCCESS_URL` | `https://one-world-relief.org/charity/thank-you` | Self-defined |
| `OWR_CANCEL_URL` | `https://one-world-relief.org/charity/cancelled` | Self-defined |

#### Key Files
- `functions/charity/donations/checkout.js` - Creates checkout sessions
- `functions/charity/webhooks/stripe.js` - Processes webhook events
- `donate.html` - Frontend form

#### Testing Stripe Locally
```bash
# Install Stripe CLI
# Run Stripe CLI tunnel to local webhook endpoint
stripe listen --forward-to http://localhost:8000/charity/webhooks/stripe

# Use test card numbers from Stripe docs:
# 4242 4242 4242 4242 (success)
# 4000 0000 0000 0002 (declined)
```

### 2.2 Google Sheets Integration
**Status**: ✅ Fully Implemented  
**What It Does**: Auto-logs all donations and stores donor information

#### How It Works
1. Stripe webhook receives `checkout.session.completed` event
2. Data extracted: donor name, email, amount, timestamp, session ID, campaign
3. Appended to Google Sheet `Donations (2026)` tab
4. Rows never deleted - creates audit trail
5. Sheet accessible via `owr-sheets-service-account.json`

#### Configuration Required
| Variable | Example | Source |
|----------|---------|--------|
| `OWR_GOOGLE_SHEET_ID` | `1a2b3c4d...` | Google Sheet URL |
| `OWR_GOOGLE_SHEET_TAB` | `Donations (2026)` | Tab name in spreadsheet |
| `OWR_GOOGLE_SERVICE_ACCOUNT_EMAIL` | `owr-service@project.iam.gserviceaccount.com` | Google Cloud Console |
| `OWR_GOOGLE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----...` | Service Account JSON |
| `OWR_GOOGLE_SERVICE_ACCOUNT_JSON` | `{...service account json...}` | Optional Cloudflare secret alternative |
| `OWR_RESEND_API_KEY` | `re_abc123...` | Resend API key for custom receipt email |
| `OWR_RECEIPT_FROM_EMAIL` | `OneWorld Relief <receipts@one-world-relief.org>` | Verified sender email |
| `OWR_RECEIPT_REPLY_TO` | `Oneworldrelief.fma@gmail.com` | Optional receipt reply-to |

#### Setup Checklist
- [ ] Create Google Cloud Project
- [ ] Enable Google Sheets API
- [ ] Create Service Account with JSON key
- [ ] Share Google Sheet with service account email (Editor role)
- [ ] Create header row: `Donation ID | Date | Donor Name | Donor Email | Amount | Campaign | Stripe Session ID | Payment Status | Payment Intent ID | Stripe Checkout URL | Receipt Number | Receipt URL | Receipt Email Status`
- [ ] Store credentials in Cloudflare environment variables

#### Service Account Location
```
root/owr-sheets-service-account.json
```
⚠️ **SECURITY**: This file contains credentials. Must be:
- Added to `.gitignore`
- Never committed
- Only loaded as environment secret on Cloudflare

### 2.3 Receipt Generation
**Status**: ✅ Fully Implemented  
**What It Does**: Automatically generates tax receipts for donors

#### How It Works
1. Checkout sets `payment_intent_data[receipt_email]` so Stripe can send an email receipt when receipt emails are enabled in Stripe.
2. When Stripe webhook fires `checkout.session.completed`, Cloudflare sends the custom OneWorld Relief plain-text receipt email through Resend when `OWR_RESEND_API_KEY` and `OWR_RECEIPT_FROM_EMAIL` are configured.
3. The thank-you route (`/charity/thank-you`) fetches the Checkout Session and displays a printable receipt matching the same template.
4. The webhook appends receipt number, receipt URL, and receipt email status to Google Sheets.
5. Receipt template:
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
6. Receipt created with:
   - Unique receipt number
   - Donation date and amount
   - Donor name and email
   - Campaign details
   - Tax-deductible statement
5. Receipt is available on the donor thank-you page.
6. Can later be expanded into admin API storage if D1/admin dashboard is added.

#### Key Function
- `functions/charity/donations/checkout.js` - Sets Stripe receipt email and redirect URLs
- `functions/charity/thank-you.js` - Displays printable receipt
- `functions/charity/webhooks/stripe.js` - Sends custom receipt email and appends completed donations and receipt metadata to Google Sheets

---

## 3. FRONTEND ARCHITECTURE

### 3.1 Main JavaScript (`one-world-relief.js`)
**Purpose**: Powers all dynamic functionality

#### Key Functions & Features
```javascript
renderProjects()          // Renders project cards from project-data.js
escapeHtml()              // XSS prevention - escapes HTML in user input
formatProjectCount()      // Formats project statistics
handleDonationSubmit()    // Form validation + checkout flow
handleQuickDonation()     // Quick donate button flow
handleContactSubmit()     // Contact form submission
nativeShare()             // Browser native share API
displayQRPresentation()   // QR code modal for sharing
copyInstagramCaption()    // Copies a ready-to-post donation caption
```

#### Data Sources
- **Projects**: `project-data.js` - Array of project objects
- **API Base**: Reads from `window.ONE_WORLD_RELIEF_API_BASE` or defaults to `window.location.origin`
- **Forms**: Validates and submits to Cloudflare Functions

#### Donation Form Validation
- Donor name: Min 2 characters required
- Email: Must contain `@` symbol
- Amount: Must be > $0
- Campaign: Optional, defaults to "General Fund"

### 3.2 Styling (`one-world-relief.css`)
**Purpose**: Professional, responsive design

#### Design Principles
- Clean, modern non-profit aesthetic
- Mobile-first responsive design
- Accessibility compliant (WCAG 2.1 AA target)
- Fast loading (optimized images)
- Professional color palette

#### Key Sections
- Navigation header with logo
- Hero section with CTA
- Project showcase grid
- Donation forms
- Footer with social links

### 3.3 Project Data (`project-data.js`)
**Purpose**: Central data source for projects

#### Structure
```javascript
window.ONE_WORLD_RELIEF_PROJECTS = [
  {
    title: "School Building Initiative",
    category: "Education",
    status: "Active",
    location: "Uganda",
    date: "2025-03-15",
    amountRaised: 15000,
    impact: "500 students",
    summary: "Building a school...",
    update: "Latest update...",
    thumbnailUrl: "https://...",
    mediaUrl: "https://youtube.com/watch?v=...",
    donationUrl: "donate.html?campaign=School"
  },
  // More projects...
]
```

#### Adding New Projects
1. Open `project-data.js`
2. Add object to `window.ONE_WORLD_RELIEF_PROJECTS` array
3. Fill all fields (especially media URLs)
4. For videos: Use YouTube embed URL or direct video link
5. For images: Use optimized image URL or upload to assets/

---

## 4. BACKEND API ENDPOINTS (Cloudflare Functions)

### Donation Endpoints

#### POST `/charity/donations/checkout`
**Purpose**: Initiate Stripe checkout session  
**Request**:
```json
{
  "donor_name": "John Doe",
  "donor_email": "john@example.com",
  "amount_usd": 50,
  "payment_method": "stripe",
  "campaign": "General Fund",
  "success_url": "https://...", // optional
  "cancel_url": "https://..."   // optional
}
```
**Response**:
```json
{
  "checkout_url": "https://checkout.stripe.com/pay/cs_...",
  "donation_id": "uuid-...",
  "session_id": "cs_..."
}
```

#### POST `/charity/webhooks/stripe`
**Purpose**: Handle Stripe events (checkout completion, payment failures, etc.)  
**Triggers**:
- `checkout.session.completed` → Logs donation, creates receipt, updates Google Sheets
- `checkout.session.expired` → Logs cancellation
- `payment_intent.payment_failed` → Logs failure

### Success/Failure Pages

#### GET `/charity/thank-you`
Shown after successful donation. Display receipt download option.

#### GET `/charity/cancelled`
Shown if user cancels checkout. Allow retry.

---

## 5. GIT WORKFLOW & SYNC

### Current Git Configuration
**GitLab Remote (School Project)**:
```
origin: https://gitlab.cci.drexel.edu/cid/2526/ws1023/63/ge5/student-guide-app.git
```

**GitHub Remote (Personal Project)**:
```
oneworld-github: https://github.com/Fahadbin-Alam/OneWorldRelief-Website.git
```

### Important Context
⚠️ **User is running a SECRET personal project INSIDE the school project**
- Must maintain sync between GitLab (school) and GitHub (personal)
- Commits must flow to BOTH repositories
- Never lose work to either system

### Push Workflow
```bash
# Make changes and commit
git add .
git commit -m "feat: description of changes"

# Push to BOTH remotes
git push origin main              # Push to GitLab (school)
git push oneworld-github main     # Push to GitHub (personal)

# Verify both received the commits
git log --oneline -5              # Check local
# Then verify on both GitHub and GitLab websites
```

### Branches
- `main` - Primary branch, production-ready
- Feature branches as needed (but currently working directly on main)

---

## 6. ENVIRONMENT VARIABLES (Cloudflare)

### Required for Production
```
OWR_STRIPE_SECRET_KEY         # Stripe API secret
OWR_STRIPE_WEBHOOK_SECRET     # Stripe webhook signing secret
OWR_GOOGLE_SHEET_ID           # Google Sheet for donations log
OWR_GOOGLE_SHEET_TAB          # Sheet tab name
OWR_GOOGLE_SERVICE_ACCOUNT_EMAIL
OWR_GOOGLE_PRIVATE_KEY        # (Sensitive - stored as secret)
OWR_GOOGLE_SERVICE_ACCOUNT_JSON # (Optional alternative to email/private key)
OWR_RESEND_API_KEY            # Custom receipt email API key
OWR_RECEIPT_FROM_EMAIL        # Verified custom receipt sender
OWR_RECEIPT_REPLY_TO          # Optional receipt reply-to
OWR_PUBLIC_SITE_URL           # Public production URL
OWR_SUCCESS_URL               # Post-donation success URL
OWR_CANCEL_URL                # Post-cancellation URL
OWR_ADMIN_API_KEY             # (Optional) For admin endpoints
```

### Set in Cloudflare Pages
1. Dashboard → Pages → student-guide-app
2. Settings → Environment Variables
3. Add each variable as Production or Preview environment

---

## 7. DEPLOYMENT

### Current Deployment
- **Platform**: Cloudflare Pages
- **Branch**: `main` (auto-deploys on push)
- **URL**: https://one-world-relief.org (or current domain)

### Domain Status Checked May 4, 2026
Local DNS lookup showed `one-world-relief.org` only returning an SOA record and no usable A/CNAME record; `www.one-world-relief.org` did not resolve. The fix must be made in Cloudflare DNS/Pages custom domains:
- Add/verify `one-world-relief.org` as a Cloudflare Pages custom domain for the active Pages project.
- Add/verify `www.one-world-relief.org` as a CNAME/custom domain or redirect to the apex.
- Set Cloudflare env vars to `https://one-world-relief.org` URLs after DNS is active.

Additional DNS check later on May 4, 2026:
- Nameservers are correctly pointed at Cloudflare: `kevin.ns.cloudflare.com` and `mona.ns.cloudflare.com`.
- The Cloudflare zone itself is missing the working website records: apex still has no usable A/CNAME/Pages custom-domain target, and `www.one-world-relief.org` returns NXDOMAIN.
- Because custom receipt email uses `receipts@one-world-relief.org`, the email provider domain verification will also depend on adding the provider's DNS records in this Cloudflare zone.

### Deploy Steps
1. Commit changes locally
2. Push to both Git remotes (GitLab + GitHub)
3. Cloudflare Pages auto-triggers build
4. Check deployment status in Cloudflare dashboard

### Build Configuration
- Use `wrangler.toml` for Cloudflare Workers configuration
- Static files served directly from Pages
- Functions from `/functions` directory deployed as Workers

---

## 8. KNOWN ISSUES & GOTCHAS

### High Priority
1. **Service Account JSON File**
   - Location: `owr-sheets-service-account.json`
   - Must NOT be committed to Git (add to .gitignore)
   - Credentials must be stored in Cloudflare environment variables only
   - If exposed, regenerate immediately in Google Cloud Console

2. **Test vs Production Keys**
   - Always use test Stripe keys in development
   - Production keys must NEVER be exposed in code
   - Switch keys only via environment variables

### Medium Priority
1. **Email Validation**
   - Current validation: checks for "@" symbol only
   - Consider adding proper email validation library for production

2. **XSS Prevention**
   - `escapeHtml()` function used in project rendering
   - Always sanitize user input before displaying

3. **CORS Configuration**
   - Functions allow `*` origin (open to all)
   - Consider restricting to specific domains in production

4. **Webhook Retries**
   - Spreadsheet sync failures now return `500` from `/charity/webhooks/stripe` so Stripe retries the event.
   - If rows are missing, check Stripe webhook delivery logs and Cloudflare Function logs first.

### Fix Log - May 4, 2026
- Fixed missing donor receipt path by setting Stripe `payment_intent_data[receipt_email]` during Checkout creation.
- Rebuilt `/charity/thank-you` Cloudflare Function to fetch the Stripe Checkout Session and show a printable receipt.
- Updated Google Sheets webhook append rows to include receipt number and receipt URL.
- Changed webhook behavior so Google Sheets failures return `500`, causing Stripe to retry instead of silently accepting a failed dashboard update.
- Added support for `OWR_GOOGLE_SERVICE_ACCOUNT_JSON` as an alternative Cloudflare secret format.
- Confirmed `.org` failure is DNS/custom-domain configuration: apex has no usable A/CNAME and `www` does not resolve.
- Updated old favorites test to authenticate before hitting protected endpoints.
- Test results after fixes: Node charity function tests `4 passed`; Python backend tests `23 passed`.
- GitHub handoff-inclusive commit pushed: `451c1fb` to `oneworld-github/charity-frontend-redesign`.
- GitLab handoff-excluded commit pushed: `8a0b743` to `origin/charity-frontend-redesign`.
- Cloudflare CLI is installed but not authenticated on this machine (`wrangler.cmd whoami` reports not authenticated), and no Cloudflare API token/account environment variables are set. Direct deploy/DNS updates require `wrangler login` or Cloudflare API credentials.
- Added custom receipt email requirement and template per user request. Production must configure `OWR_RESEND_API_KEY` and `OWR_RECEIPT_FROM_EMAIL`; otherwise the webhook records `not_sent_email_not_configured` in the Google Sheet receipt email status column.
- Receipt email implementation details: Stripe Checkout sets `payment_intent_data[receipt_email]` for Stripe's built-in receipt, and the webhook sends the custom OneWorld Relief template through Resend after `checkout.session.completed`. Real donor email delivery requires a verified sender/domain in Resend plus the Cloudflare env vars.
- Receipt numbers were changed to be date-based so the spreadsheet, email receipt, and printable receipt all match the donation date format: `R-YYYY-MM-DD-###` or `R-YYYY-MM-DD-<short donation id>`.
- Donate page top navigation should have only one Donate CTA: the right-side header button. The center nav should include `Projects`, `Share`, `About`, and `Contact`, not another `Donate` item.
- Added a Share/QR panel directly on `donate.html` so donors can share the donation link without needing a duplicate top-nav Donate link.
- Thank-you page should be minimal and celebratory only: one large line, `Thank you for your Donation`, plus a small cartoon-style coin-to-child animation. Do not show receipt details on the thank-you page; receipts are handled by donor email and Google Sheets.
- Cloudflare deploy check on May 4, 2026: updates are pushed to GitHub/GitLab, but direct Cloudflare upload from this machine is blocked because Wrangler is not authenticated and no `CLOUDFLARE_API_TOKEN` is set. `one-world-relief.org` and `www.one-world-relief.org` still do not resolve publicly, so the custom domain is not live yet.
- Cloudflare login later succeeded for `oneworldrelief.fma@gmail.com`; deployed current `one-world-relief/` folder to Pages project `trying`.
- Production deployment is live at `https://one-world-relief.com`, deployment `fbb6e97f-44ec-4cb6-9bed-3bff2d182a0d`, with updated donate/share/thank-you pages verified.
- Pages custom domains `one-world-relief.org` and `www.one-world-relief.org` are attached to project `trying` but remain pending because Cloudflare reports `CNAME record not set`. The Wrangler OAuth token has Pages write access but DNS record API calls return authentication error, so DNS edit permission or dashboard access is needed to create the missing CNAME/flattened records.
- Production Cloudflare secrets present: `OWR_STRIPE_SECRET_KEY`, `OWR_STRIPE_WEBHOOK_SECRET`, `OWR_GOOGLE_PRIVATE_KEY`, `OWR_PUBLIC_SITE_URL`, `OWR_SUCCESS_URL`, `OWR_CANCEL_URL`, `OWR_RECEIPT_FROM_EMAIL`, `OWR_RECEIPT_REPLY_TO`. Missing: `OWR_RESEND_API_KEY`, so custom receipt emails still cannot send until this secret is added.
- Setup assist action: opened Cloudflare DNS records, Cloudflare Pages custom domains, Resend Domains, Resend API Keys, and Stripe Webhooks in the browser. Exact remaining manual items are DNS records for `.org`/`www`, Resend domain verification/API key, `OWR_RESEND_API_KEY` Pages secret, and Stripe webhook URL pointed at the live `.com` domain until `.org` is active.

### Lower Priority
1. **Receipt Storage**
   - Currently stored in system
   - Consider moving to cloud storage for scalability

2. **Donation History UI**
   - Currently no donor dashboard
   - Could add "View My Donations" feature

---

## 9. TESTING PROCEDURES

### Manual Testing Checklist
- [ ] Test donation form validation (empty fields, invalid email, zero amount)
- [ ] Test Stripe checkout flow with test cards
- [ ] Verify donation logged to Google Sheets
- [ ] Confirm receipt generated
- [ ] Test with different donation amounts
- [ ] Test different campaigns
- [ ] Verify mobile responsiveness (donate on phone)
- [ ] Check all project cards render correctly
- [ ] Test project images load properly
- [ ] Verify contact form works
- [ ] Test native share functionality
- [ ] Check performance (Lighthouse score)

### Automated Testing
- Unit tests available in `Backend/` folder
- Currently manual testing is primary method
- Consider adding Cypress/Playwright e2e tests

---

## 10. NEXT STEPS & RECOMMENDATIONS

### Immediate Tasks
1. **UX Audit** - Compare with other non-profit websites, identify improvements
2. **User Testing** - Get feedback from actual potential donors
3. **Performance** - Run Lighthouse, optimize images and assets
4. **Mobile Testing** - Ensure perfect experience on phones/tablets

### Short Term
1. Add donor dashboard (view donation history)
2. Verify Resend domain DNS records so receipt emails have full production deliverability
3. Add donor newsletter signup
4. Create admin analytics dashboard
5. Replace QR asset if the production donation URL changes

### Long Term
1. Multi-currency support
2. Recurring donation feature
3. Fundraiser creation by supporters
4. Enhanced project impact tracking
5. Mobile app version

---

## 11. QUICK REFERENCE - COMMON TASKS

### Add a New Project
1. Open `project-data.js`
2. Add object to array with all required fields
3. Commit and push to both remotes

### Update Success/Cancel Pages
1. Edit `functions/charity/thank-you.js` or `cancelled.js`
2. Test locally with Stripe CLI
3. Push to remotes

### Change Stripe Keys
1. Generate new keys in Stripe Dashboard
2. Update in Cloudflare Pages environment variables
3. Verify in deployment logs

### Update Google Sheets Connection
1. Create new service account key in Google Cloud Console
2. Share sheet with new service account email
3. Update `OWR_GOOGLE_PRIVATE_KEY` and email in Cloudflare

---

## 12. CONTACT & RESOURCES

### Key Contacts
- **Project Lead**: Fahadbin Alam (fma52)
- **Last Modified**: Codex AI (4/23/26)

### External Resources
- Stripe Documentation: https://stripe.com/docs
- Google Sheets API: https://developers.google.com/sheets/api
- Cloudflare Pages Docs: https://developers.cloudflare.com/pages/
- Cloudflare Workers: https://developers.cloudflare.com/workers/

### Important Files for Reference
- [backend-setup.md](backend-setup.md) - Backend configuration details
- [cloudflare-d1-schema.sql](cloudflare-d1-schema.sql) - Database schema
- [PROJECT_INTAKE_TEMPLATE.md](PROJECT_INTAKE_TEMPLATE.md) - New project template

---

## 13. SECURITY CHECKLIST

- [ ] Service account JSON is NOT in Git history
- [ ] `.gitignore` includes all sensitive files
- [ ] Stripe keys are only in environment variables
- [ ] CORS headers reviewed and appropriate
- [ ] Input validation on all forms
- [ ] XSS prevention via HTML escaping
- [ ] HTTPS required for all API calls
- [ ] Webhook signatures verified with `OWR_STRIPE_WEBHOOK_SECRET`
- [ ] Database queries use parameterized statements (if applicable)
- [ ] Regular security audits scheduled

---

## 14. 2026-05-04 PRODUCTION RECEIPT & DEPLOYMENT STATUS

### Completed Today
- Cloudflare Pages project `trying` is the active production project for `https://one-world-relief.com`.
- Latest production deployment after setting receipt/webhook secrets: `https://883b2b83.trying-8o0.pages.dev`.
- Rebuilt and deployed Pages Functions into the production deployment so function routes are active, including:
  - `/charity/thank-you`
  - `/charity/webhooks/stripe`
- Verified live thank-you page returns HTTP 200 and contains only the requested message text plus the coin-to-child animation.
- Verified live Stripe webhook route rejects an invalid signature with HTTP 400, confirming the function route and signature check are active.
- Updated the existing Stripe webhook endpoint to use `https://one-world-relief.com/charity/webhooks/stripe` because `api.one-world-relief.com` is not live yet.
- Set the Cloudflare production secret for Resend receipt email delivery.
- Updated the Cloudflare production Stripe webhook signing secret from Stripe Workbench.
- Confirmed Cloudflare production secrets now include:
  - `OWR_CANCEL_URL`
  - `OWR_GOOGLE_PRIVATE_KEY`
  - `OWR_PUBLIC_SITE_URL`
  - `OWR_RECEIPT_FROM_EMAIL`
  - `OWR_RECEIPT_REPLY_TO`
  - `OWR_RESEND_API_KEY`
  - `OWR_STRIPE_SECRET_KEY`
  - `OWR_STRIPE_WEBHOOK_SECRET`
  - `OWR_SUCCESS_URL`

### Receipt Behavior Now Expected
- Stripe Checkout sends the donor email to Stripe as the receipt email.
- Stripe completion webhooks append donation rows to the Google Sheet.
- Receipt IDs are date-based and unique, formatted like `R-YYYY-MM-DD-...`.
- The custom OneWorld Relief receipt email is sent through Resend after a completed Stripe Checkout webhook.
- Google Sheets records the receipt number, receipt URL, and receipt email status.
- If the Google Sheets append fails, the webhook returns an error so Stripe retries instead of silently losing the donation.

### DNS & Domain Status
- `one-world-relief.org`, `www.one-world-relief.org`, and `api.one-world-relief.com` are added to Cloudflare Pages and active.
- DNS records were created/updated on 2026-05-04:
  - `one-world-relief.org` CNAME -> `trying-8o0.pages.dev`
  - `www.one-world-relief.org` CNAME -> `trying-8o0.pages.dev`
  - `api.one-world-relief.com` CNAME -> `trying-8o0.pages.dev`
- These records are set to DNS-only. Proxied CNAMEs returned Cloudflare 522 errors; DNS-only resolved the issue.
- Verified live URLs return HTTP 200 with expected OneWorld Relief content:
  - `https://one-world-relief.org`
  - `https://www.one-world-relief.org`
  - `https://api.one-world-relief.com/charity/thank-you`
- Verified `https://api.one-world-relief.com/charity/webhooks/stripe` rejects an invalid Stripe signature with HTTP 400.
- Remaining item: Resend may require DNS records for the sending domain before donor receipt emails have full production deliverability.
- On 2026-05-04, opened Resend Domains and API Keys pages for the owner. A Resend API check returned HTTP 401, so the owner should either show the domain verification records in the Resend dashboard or create a fresh valid Resend API key.
- On 2026-05-05, a new Resend API key worked. Created the `one-world-relief.com` domain in Resend, added its DKIM/SPF DNS records to Cloudflare, triggered verification, and updated the Cloudflare Pages `OWR_RESEND_API_KEY` secret.
- Latest production deployment after updating the Resend key: `https://023244c2.trying-8o0.pages.dev`.
- Resend domain status is now `verified`.

### 2026-05-05 Health Check
- Verified `https://one-world-relief.com`, `https://one-world-relief.org`, and `https://www.one-world-relief.org` return HTTP 200 with expected site content.
- Verified thank-you pages on the main and API domains return HTTP 200 and include the requested animation.
- Verified Stripe webhook routes on `one-world-relief.com` and `api.one-world-relief.com` reject invalid signatures with HTTP 400.
- Verified Resend domain `one-world-relief.com` remains `verified`.
- Verified Cloudflare production secrets include the Stripe, Google Sheets, URL, and Resend receipt email settings.
- Verified donate page has the share feature and QR asset, and no duplicate center-nav Donate link.
- Automated tests passed:
  - `node --test tests/charity-functions.test.mjs` from `one-world-relief`: 5 passed.
  - `python -m pytest Backend`: 23 passed.
- Remaining real-world validation: make one small live Stripe donation and confirm the Google Sheet row plus donor receipt email.

### 2026-05-05 Animation & Spreadsheet Alignment Fix
- Upgraded `/charity/thank-you` from the simple coin cartoon to a more cinematic CSS animation: dim/rainy scene, sad child, donation coin motion, brightening scene, tear fading, heart glow, and smile transition.
- Kept the thank-you page minimal with only `Thank you for your Donation` as visible text; no receipt details appear on the page.
- Fixed Stripe webhook Google Sheets append shape to match the actual spreadsheet headers in columns A:H:
  - A `Donation ID`
  - B `Date`
  - C `Donor Name`
  - D `Amount ($)`
  - E `Purpose/Fund`
  - F `Method`
  - G `Receipt ID`
  - H `Notes`
- Notes now compactly hold Stripe status, session ID, payment intent, receipt email status, and receipt URL instead of spilling those fields into extra columns.
- Updated `backend-setup.md` and `tests/charity-functions.test.mjs` for the A:H sheet contract.
- Code commit pushed to both GitHub and GitLab:
  - GitHub: `59f2ce1 fix: align donation sheet and improve thank you animation`
  - GitLab: `373f455 fix: align donation sheet and improve thank you animation`
- Deployed to Cloudflare Pages production: `https://a7c8ba98.trying-8o0.pages.dev`.
- Live verification:
  - `https://one-world-relief.com/charity/thank-you` returns HTTP 200 and includes the new story animation.
  - `https://api.one-world-relief.com/charity/webhooks/stripe` rejects invalid signatures with HTTP 400.
- Tests passed after the change:
  - `node --test tests/charity-functions.test.mjs`: 5 passed.
  - `python -m pytest Backend`: 23 passed.
- Existing bad spreadsheet rows still need manual/API cleanup. The local environment does not expose the Google Sheet ID or service account credentials, and there is no Google Sheets connector available in this session. To clean existing rows in-place, provide the Sheet URL/ID and grant connector/API access, or paste/export the affected rows.

### 2026-05-05 Spreadsheet Repair Completed
- Located the production spreadsheet from Chrome history: `OneWorldRelief_SUPER_TRACKER_DASHBOARD`.
- Used the local OneWorld Relief Google Sheets service account file to access the `Donations (2026)` tab.
- Repaired the three misaligned Stripe donation rows that had spilled across A:M and K:W.
- Normalized rows 4-6 into the correct A:H layout:
  - Donation ID
  - Date
  - Donor Name
  - Amount ($)
  - Purpose/Fund
  - Method
  - Receipt ID
  - Notes
- Cleared stray data in columns I:W for those repaired rows.
- Resent the two older failed donor receipt emails through Resend.
- Verified all three Stripe donation rows now show `Receipt Email: sent` in Notes.
- Read the sheet back after repair and confirmed rows 4-6 are aligned with no data spilling past column H.

### 2026-05-05 Live Donation Validation
- Checked production after another live donation.
- New donation appeared in `Donations (2026)` row 7.
- Row 7 is aligned correctly in columns A:H only, with no data spilling into I:W.
- Donation details verified:
  - Amount: `$1`
  - Method: `Stripe`
  - Purpose/Fund: `General Fund`
  - Receipt ID uses the date-based format.
  - Notes include Stripe status, session ID, payment intent, receipt email status, and receipt URL.
- Receipt email status for the new row is `sent`.
- Production domains and webhook checks remain healthy:
  - Main and `.org` domains return HTTP 200.
  - Thank-you pages include the upgraded story animation.
  - Webhook routes reject invalid Stripe signatures with HTTP 400.

### 2026-05-05 Flowy Donation Page & Wallet Payments
- Redesigned the donation page to feel more fluid and less static:
  - Larger emotional hero: `Move relief where it is needed.`
  - Animated current/ribbon background treatment.
  - Flowing fund cards and checkout section.
  - Payment option rail for Apple Pay, Cash App Pay, Card, and Venmo.
  - Donation form order now moves more naturally from fund/amount to donor details and payment.
- Added production Cloudflare Function support for:
  - Apple Pay through Stripe Checkout card wallets.
  - Cash App Pay through Stripe Checkout with card fallback.
  - Venmo external redirect when `OWR_VENMO_URL` or `OWR_PAYPAL_VENMO_URL` is configured.
- Added matching local FastAPI backend support for the same payment method names.
- Registered Stripe payment method domains for:
  - `one-world-relief.com`
  - `one-world-relief.org`
  - `www.one-world-relief.org`
- Updated tests for Apple Pay, Cash App Pay, and Venmo redirect behavior.
- Code commit pushed to both remotes:
  - GitHub: `e4a46b1 feat: add flowy donation experience and wallet payments`
  - GitLab: `5393222 feat: add flowy donation experience and wallet payments`
- Cloudflare production deployment: `https://d175ca46.trying-8o0.pages.dev`.
- Verification:
  - `https://one-world-relief.com/donate` returns HTTP 200 and contains the new flow content plus Apple Pay, Cash App Pay, and Venmo UI.
  - Stripe webhook route still rejects invalid signatures with HTTP 400.
  - Function tests: `node --test tests/charity-functions.test.mjs` passed, 8 tests.
  - Backend tests: `python -m pytest Backend` passed, 23 tests.
- Remaining item: provide the real OneWorld Relief Venmo URL/handle, then set `OWR_VENMO_URL` in Cloudflare Pages secrets to activate Venmo redirects.

### 2026-05-05 Thank-You Animation Replacement
- Removed the cartoon sad-child/coin animation from `/charity/thank-you`.
- Replaced it with a polished abstract success animation:
  - rotating success orbit
  - light sweep
  - pulsing rings
  - animated check mark
- Kept the only visible page copy as `Thank you for your Donation`.
- Added more motion to the donation page:
  - floating payment chips
  - drifting light elements
  - staggered flowing donation cards
  - pulsing form step markers
- Code pushed to both remotes:
  - GitHub: `d4f1606 fix: replace thank you cartoon with polished success animation`
  - GitLab: `a2539b8 fix: replace thank you cartoon with polished success animation`
- Deployed to Cloudflare Pages production: `https://4a9ddc08.trying-8o0.pages.dev`.
- Live verification:
  - `https://one-world-relief.com/charity/thank-you` returns HTTP 200.
  - New success animation is present.
  - Old cartoon markers (`story-scene`, `coin-gift`, `person child`) are absent.
  - `https://one-world-relief.com/donate` still returns HTTP 200 with flow UI and payment options.
  - Stripe webhook invalid-signature check still returns HTTP 400.
- Function tests passed: `node --test tests/charity-functions.test.mjs`, 8 tests.

### 2026-05-05 Google Drive Case Upload
- User asked to access the cases placed in Google Drive and upload them to the website.
- Google Drive folder checked:
  - Parent folder: `Cases`
  - Case folder: `Case 001 - Orphan 600$`
  - Case folder URL: `https://drive.google.com/drive/folders/1eJt-SkxtEJltYpB8GuKNOz6gV0aTb3-4`
- Case 001 folder contents found:
  - `IMG-20260505-WA0004.jpg`
  - `IMG-20260505-WA0006.jpg`
  - `VID-20260505-WA0003.mp4`
  - `VID-20260505-WA0005.mp4`
- Added local website media:
  - `one-world-relief/assets/projects/case-001/orphan-support-001-main.jpg`
  - `one-world-relief/assets/projects/case-001/orphan-support-001-proof.jpg`
- Updated `one-world-relief/project-data.js` so the first project card is now the real `Case 001: Hafiz Student Support` case.
- The card now uses the local Case 001 image and links to the Google Drive case folder for the videos and supporting proof.
- Updated `one-world-relief/assets/projects/README.md` with the current case media structure.
- Verification:
  - Local images downloaded correctly and render as JPEGs.
  - Function tests passed: `node --test tests/charity-functions.test.mjs`, 8 tests.
  - Backend tests passed when run by file in the project venv:
    - `Backend/test_favorites.py`, 3 tests
    - `Backend/test_favorites_comprehensive.py`, 10 tests
    - `Backend/test_planner_comprehensive.py`, 10 tests
  - Full backend command through the venv did not return before timeout, but the same 23 backend tests passed when split by file.
- Code sync:
  - GitHub code commit: `f17a1d9 feat: add drive case one to projects`
  - GitLab code commit: `8820113 feat: add drive case one to projects`
  - GitHub-only handoff commit: `e3ac1df docs: log drive case upload`
- Cloudflare production deployment: `https://8029704c.trying-8o0.pages.dev`.
- Live verification after deployment:
  - `https://one-world-relief.com/project-data.js` contains `Case 001: Hafiz Student Support`.
  - `https://one-world-relief.com/assets/projects/case-001/orphan-support-001-main.jpg` returns HTTP 200 with `image/jpeg`.
  - `one-world-relief.org` and `www.one-world-relief.org` are still attached to the Cloudflare Pages project, but DNS resolution failed from the local machine during this check. Next step if the user still cannot open `.org`: verify registrar nameservers/DNS delegation for the `.org` domain.

### 2026-05-05 QR Share Focus
- User asked to focus on the QR code.
- Regenerated `one-world-relief/assets/one-world-relief-donate-qr.svg`.
- QR now points to the working donation URL: `https://one-world-relief.com/donate`.
- Updated Share page links/copy from the unresolved `.org` donation URL to the working `.com` donation URL.
- Added a `Download QR` button on `share.html` so the QR can be used in flyers, slides, and presentations.
- Improved QR card styling and presentation modal styling.
- Updated the native share/Instagram caption URL in `one-world-relief.js` to `https://one-world-relief.com/donate`.
- Added a regression test confirming the share page and JS use the working donation domain and do not point donation sharing to `.org`.
- Test result: `node --test tests/charity-functions.test.mjs` passed, 9 tests.

### 2026-05-05 Local Project Detail Pages
- User clarified that donors should not have to look inside Google Drive folders.
- Changed the project board so every project card opens a local One World Relief HTML detail page instead of Drive/YouTube placeholders.
- Added new local pages:
  - `one-world-relief/projects/case-001.html`
  - `one-world-relief/projects/village-qurbani-meal-support.html`
  - `one-world-relief/projects/two-year-orphan-education-support.html`
  - `one-world-relief/projects/food-stand-for-a-father.html`
- Added Case 001 videos from the Drive source into local website assets:
  - `one-world-relief/assets/projects/case-001/orphan-support-001-video-1.mp4`
  - `one-world-relief/assets/projects/case-001/orphan-support-001-video-2.mp4`
- Case 001 now has a donor-facing page with:
  - local main photo
  - local proof photo
  - two embedded MP4 field videos
  - amount/status/location/category fact cards
  - privacy-safe case overview
  - delivery/proof timeline
  - donation CTA back to Orphan Support
- Added responsive styling for local project detail pages.
- Updated project card behavior so local project links open in the same tab, while external links still open safely in a new tab.
- Added a regression test to make sure `project-data.js` does not point project card media to Google Drive or YouTube placeholders.
- Decision note:
  - The Drive folder named `Random cases` contains multiple videos, but they do not yet have donor-safe project names/descriptions or exact case mapping.
  - Do not publish those random videos as if they belong to a specific project until they are matched to a case and approved for public donor view.
- Test results:
  - `node --test tests/charity-functions.test.mjs`: 10 tests passed.
  - `Backend/test_favorites.py`: 3 tests passed.
  - `Backend/test_favorites_comprehensive.py`: 10 tests passed.
  - `Backend/test_planner_comprehensive.py`: 10 tests passed.
- Code sync:
  - GitHub code commit: `ef8c19c feat: add local project detail pages`
  - GitLab code commit: `5348bad feat: add local project detail pages`
  - GitHub-only handoff commit before deploy: `6a7d815 docs: log local project pages`
- Cloudflare production deployment: `https://4e5f10f3.trying-8o0.pages.dev`.
- Live verification after deployment:
  - `https://one-world-relief.com/projects` returns HTTP 200.
  - `https://one-world-relief.com/projects/case-001` returns HTTP 200 and contains Case 001 local media references.
  - Other local project detail pages return HTTP 200:
    - `/projects/village-qurbani-meal-support`
    - `/projects/two-year-orphan-education-support`
    - `/projects/food-stand-for-a-father`
  - Case 001 local videos return HTTP 200 with `video/mp4`.

### 2026-05-05 Case 001 Primary Video
- User provided an additional local video:
  - `C:\Users\fahad\Videos\Case 1 - Orphan 600\WhatsApp Video 2026-05-05 at 7.23.31 AM.mp4`
- Added it to the site as:
  - `one-world-relief/assets/projects/case-001/orphan-support-001-primary.mp4`
- Updated `one-world-relief/projects/case-001.html` so this video is now the primary hero media and the first proof item.
- Improved the Case 001 video presentation:
  - hero video uses the real MP4 instead of a static image
  - primary proof video spans the full proof grid
  - video object-fit is `contain` so the frame is not cropped
- Direct Cloudflare deploy first failed because Pages only supports files up to 25 MiB and the source MP4 was 26.4 MiB.
- Installed/used temporary `ffmpeg-static` tooling outside the repo and compressed `orphan-support-001-primary.mp4` to about 5 MB.
- No custom poster frame was generated; the page uses the video itself as primary media with uncropped `object-fit: contain`.
- Test result: `node --test tests/charity-functions.test.mjs` passed, 10 tests.
- Code sync:
  - GitHub code commits: `743ad54 feat: add primary case one video`, `0c56f23 fix: compress primary case video for deploy`
  - GitLab code commits: `d2b70a2 feat: add primary case one video`, `9b37063 fix: compress primary case video for deploy`
  - GitHub-only handoff commits: `34a1a06 docs: log primary case video`, `99a9fa7 docs: log compressed primary video`
- Cloudflare production deployment after compression: `https://b9a045f0.trying-8o0.pages.dev`.
- Live verification:
  - `https://one-world-relief.com/projects/case-001` returns HTTP 200 and references `orphan-support-001-primary.mp4`.
  - `https://one-world-relief.com/assets/projects/case-001/orphan-support-001-primary.mp4` returns HTTP 200 with `video/mp4` and `Content-Length: 5017376`.

### 2026-05-07 Flowing Motion Homepage Update
- User asked again to make the site more flowy/animated, using `https://theoceancleanup.com/` as motion/layout inspiration.
- Updated homepage hero:
  - changed headline to `Direct aid, moving fast.`
  - added layered animated current lines behind the donation hero
  - reduced hero height so the next section feels connected instead of hidden far below the fold
- Added new homepage `Project Flow` section:
  - explains the path from giving to tracking to proof
  - embeds the local Case 001 primary video as the visual anchor
  - adds quick route links to Donate, Projects, and Case 001
  - adds impact stats for amount delivered, case completion, and archived videos
- Added site-wide motion system in `one-world-relief.js`:
  - IntersectionObserver reveal animations for `.reveal` sections
  - subtle scroll-drift for `[data-flow-layer]` media
  - reduced-motion support and no-JS fallback so content does not stay hidden
- Updated CSS:
  - flowing diagonal current bands across the page
  - animated homepage current lines
  - responsive flow section and motion-safe styles
  - mobile overflow checked
- Verification:
  - `node --test tests/charity-functions.test.mjs`: 10 tests passed.
  - Local browser smoke check via Chrome/Playwright:
    - homepage loads with headline `Direct aid, moving fast.`
    - flow section appears after scrolling
    - Case 001 video source is present
    - mobile viewport has no horizontal overflow
- Code sync:
  - GitHub code commit: `b774282 feat: add flowing homepage motion`
  - Local GitLab sync commit created: `b354ed2 feat: add flowing homepage motion`
  - GitLab remote push failed with HTTP Basic authentication denied. The GitLab credential/token needs to be refreshed before pushing `gitlab-charity-sync`.
- GitHub-only handoff commit before deploy: `4d07d97 docs: log flowing homepage motion`.
- Cloudflare production deployment: `https://48e9ab95.trying-8o0.pages.dev`.
- Live verification:
  - `https://one-world-relief.com/` returns HTTP 200 and contains `Direct aid, moving fast`.
  - `https://one-world-relief.com/one-world-relief.css` returns HTTP 200 and contains the flow/current styling.
  - `https://one-world-relief.com/one-world-relief.js` returns HTTP 200 and contains the scroll reveal logic.

### 2026-05-10 Public Contact and Case Cleanup
- User clarified the official address is a home address and agreed not to publish it publicly.
- Updated `one-world-relief/about.html`:
  - Added public contact card with `Oneworldrelief.fma@gmail.com`.
  - Added `Mailing Address: Available upon request.`
  - Added donor questions guidance pointing people to the contact page.
- User asked to get rid of random cases except Case 001.
- Updated public project data:
  - `one-world-relief/project-data.js` now publishes only `Case 001: Hafiz Student Support`.
  - Removed public project-board entries for Qurbani, orphan education future project, and food stand future project.
- Updated homepage story panel so it only links to Case 001.
- Updated regression test so the project board must remain Case 001 only and not republish the removed extra project cards.
- Test result: `node --test tests/charity-functions.test.mjs` passed, 10 tests.
- Code sync:
  - GitHub code commit: `a08eb91 fix: publish only case one project`
  - Local GitLab sync commit created: `1fe1ef6 fix: publish only case one project`
  - GitLab remote push still failed with HTTP Basic authentication denied; refresh GitLab credential/token before pushing `gitlab-charity-sync`.
- GitHub-only handoff commit before deploy: `cf1b3fa docs: log public case cleanup`.
- Cloudflare production deployment: `https://5e641a17.trying-8o0.pages.dev`.
- Live verification:
  - `https://one-world-relief.com/about` returns HTTP 200 and contains `Available upon request`.
  - `https://one-world-relief.com/project-data.js` returns HTTP 200, contains Case 001, and does not contain the removed extra public cases.
  - `https://one-world-relief.com/` returns HTTP 200, contains Case 001 story content, and does not contain the removed extra public cases.

### 2026-05-10 Story Title Pattern
- User asked to remove `Case 001` from the main public title and use a catchier story title, while keeping the case number somewhere as a reference.
- Updated public story title to `Keeping a Hafiz Student in School`.
- Kept `Case 001` as metadata:
  - Project card date/reference still shows `Case 001`.
  - Case detail page eyebrow shows `Orphan Support · Case 001`.
  - Case detail page fact grid includes `Case ID: Case 001`.
- Updated homepage current-case story title to match the new public title.
- Updated regression tests to make sure the public project title does not start with `Case 001:`.
- Test result: `node --test tests/charity-functions.test.mjs` passed, 10 tests.
- Code sync:
  - GitHub code commit: `def40b1 fix: use story title for case one`
  - Local GitLab sync commit created: `485144d fix: use story title for case one`
  - GitLab remote push did not complete; previous GitLab credential/token issue still needs to be fixed before pushing `gitlab-charity-sync`.
- GitHub-only handoff commit before deploy: `86a9743 docs: log case story title`.
- Cloudflare production deployment: `https://0e2b80cf.trying-8o0.pages.dev`.
- Live verification:
  - `https://one-world-relief.com/project-data.js` returns HTTP 200 with `Keeping a Hafiz Student in School`, still includes `Case 001`, and no longer contains `Case 001: Hafiz Student Support`.
  - `https://one-world-relief.com/projects/case-001` returns HTTP 200 with the story title, includes `Case ID`, and no longer contains the old public title.
  - `https://one-world-relief.com/` returns HTTP 200 with the story title and no longer contains `Orphan Hafiz Studies Support`.

### 2026-05-10 Case 001 Thumbnail Framing
- User noted the Case 001 project thumbnail looked off from the project/card point of view.
- Generated a dedicated thumbnail from the primary Case 001 video:
  - `one-world-relief/assets/projects/case-001/orphan-support-001-thumbnail.jpg`
- Updated `one-world-relief/project-data.js` to use the dedicated thumbnail instead of the original field photo.
- Updated project-card media framing:
  - changed card media aspect ratio from `16 / 10` to `4 / 3`
  - added `object-position: center 34%` so the face is centered better in the card crop
- Updated the project media README and regression test to expect the dedicated thumbnail.
- Verification:
  - `node --test tests/charity-functions.test.mjs` passed, 10 tests.
  - Local Chrome/Playwright screenshot confirmed the project card uses `orphan-support-001-thumbnail.jpg` and frames the face clearly.
- Code sync:
  - GitHub code commit: `4a616c9 fix: improve case one project thumbnail`
  - Local GitLab sync commit created: `fb86d99 fix: improve case one project thumbnail`
  - GitLab remote push was not attempted in this step because the saved GitLab credential/token is still known-bad.
- GitHub-only handoff commit before deploy: `46f381b docs: log case thumbnail framing`.
- Cloudflare production deployment: `https://005cefaa.trying-8o0.pages.dev`.
- Live verification:
  - `https://one-world-relief.com/project-data.js` returns HTTP 200 and uses `orphan-support-001-thumbnail.jpg`.
  - `https://one-world-relief.com/assets/projects/case-001/orphan-support-001-thumbnail.jpg` returns HTTP 200 with `image/jpeg`.
  - `https://one-world-relief.com/one-world-relief.css` returns HTTP 200 and contains the `4 / 3` project-card media framing plus `object-position: center 34%`.

### 2026-05-10 Browser Favicon / URL Legitimacy
- User asked whether the site should have an icon like Google/Facebook in the browser tab and URL area.
- Added a favicon using the existing OWR brand mark rather than waiting for a full logo.
- New asset:
  - `one-world-relief/favicon.svg`
- Added favicon links to all public HTML pages and local project pages:
  - root pages use `favicon.svg`
  - project detail pages use `../favicon.svg`
- Added a regression test confirming the homepage, Case 001 page, and favicon asset are present.
- Test result: `node --test tests/charity-functions.test.mjs` passed, 11 tests.
- Note: This is enough for browser-tab legitimacy now. A full custom nonprofit logo can still be designed later for social graphics, receipts, flyers, and the header.
- Code sync:
  - GitHub code commit: `b9b6f8a feat: add one world relief favicon`
  - Local GitLab sync commit created: `db834fb feat: add one world relief favicon`
  - GitLab remote push was not attempted because the saved GitLab credential/token is still known-bad.
- GitHub-only handoff commit before deploy: `ea8ac5b docs: log favicon addition`.
- Cloudflare production deployment: `https://42b795cc.trying-8o0.pages.dev`.
- Live verification:
  - `https://one-world-relief.com/` returns HTTP 200 and references `favicon.svg`.
  - `https://one-world-relief.com/favicon.svg` returns HTTP 200 with `image/svg+xml` and contains the OWR mark.
  - `https://one-world-relief.com/projects/case-001` returns HTTP 200 and references the favicon.

### 2026-05-10 Case 002 Drive Access Blocker
- User asked to add Case 002 from Google Drive.
- Attempted to list the known Google Drive `Cases` folder through the Google Drive connector.
- Google Drive connector returned `401 token_expired` with message: `Provided authentication token is expired. Please try signing in again.`
- Checked local likely locations:
  - `C:\Users\fahad\Videos`
  - `C:\Users\fahad\Downloads`
  - existing `one-world-relief/assets/projects`
- No local Case 002 folder/media was found.
- Next step: reconnect/sign in to Google Drive in Codex, then list the `Cases` folder and import Case 002 into local website assets and a new donor-facing project page.
- Standing user preference:
  - Whenever Google Drive access is needed and the token is expired or missing, bring it up immediately so the user can sign in/reconnect and provide the token/access again.
  - Do not wait until the end of the task to mention Google Drive auth problems.

### 2026-05-10 Switch Public Domain to .org Only
- User asked to stop using `.com` publicly and keep only `.org`.
- Verified before changes:
  - `one-world-relief.org` resolves with Cloudflare A/AAAA records.
  - `www.one-world-relief.org` CNAMEs to `trying-8o0.pages.dev`.
  - `https://one-world-relief.org/` returns HTTP 200.
  - `https://www.one-world-relief.org/` returns HTTP 200.
  - `https://one-world-relief.com/` still returned HTTP 200 before this change.
- Updated public donation/share URLs from `.com` to `.org`:
  - `one-world-relief/share.html`
  - `one-world-relief/one-world-relief.js`
  - regenerated `one-world-relief/assets/one-world-relief-donate-qr.svg` for `https://one-world-relief.org/donate`
- Added Cloudflare Pages middleware:
  - `one-world-relief/functions/_middleware.js`
  - Redirects `one-world-relief.com` and `www.one-world-relief.com` to the same path on `one-world-relief.org` with HTTP 301.
- Updated Cloudflare Pages production secrets:
  - `OWR_PUBLIC_SITE_URL=https://one-world-relief.org`
  - `OWR_SUCCESS_URL=https://one-world-relief.org/charity/thank-you`
  - `OWR_CANCEL_URL=https://one-world-relief.org/charity/cancelled`
- Test results:
  - `node --test tests/charity-functions.test.mjs`: 12 tests passed.
  - `Backend/test_favorites.py`: 3 tests passed.
  - `Backend/test_favorites_comprehensive.py`: 10 tests passed.
  - `Backend/test_planner_comprehensive.py`: 10 tests passed.
- Stripe note:
  - The available Stripe connector in this session does not expose webhook endpoint editing.
  - The site redirect protects old `.com` traffic, but Stripe Dashboard webhook endpoint should be manually updated to `https://one-world-relief.org/charity/webhooks/stripe` if it still shows `.com`.
- Cloudflare production deployment: `https://bfd8af4f.trying-8o0.pages.dev`.
- Live verification:
  - `https://one-world-relief.org/` returns HTTP 200 and does not contain `.com`.
  - `https://www.one-world-relief.org/` returns HTTP 200.
  - `https://one-world-relief.org/share` returns HTTP 200 and contains `.org` share text, not `.com`.
  - `https://one-world-relief.org/assets/one-world-relief-donate-qr.svg` returns HTTP 200 with `image/svg+xml`.
  - `https://one-world-relief.com/` returns HTTP 301 to `https://one-world-relief.org/`.
  - `https://one-world-relief.com/donate` returns HTTP 301 to `https://one-world-relief.org/donate`.
- Code sync:
  - GitHub code commit: `eb84235 fix: use org domain for public site`
  - Local GitLab sync commit created: `d72f38f fix: use org domain for public site`
  - GitLab remote push was not attempted because the saved GitLab credential/token is still known-bad.

### 2026-05-10 Case 002 Local Import
- User downloaded the Case 002 ZIP locally after Google Drive connector auth stayed expired.
- Local source ZIP:
  - `C:\Users\fahad\Downloads\Case 002 - 600 for a man business-20260510T225336Z-3-001.zip`
- Extracted source folder used:
  - `C:\Users\fahad\AppData\Local\Temp\owr-case-002\Case 002 - 600 for a man business`
- Case 002 public title:
  - `A Fresh Start for a Father's Business`
- Case 002 public metadata:
  - Case ID: `Case 002`
  - Category: `Livelihood Support`
  - Amount delivered: `$600`
  - Status: `Completed`
  - Location: `Bangladesh`
- Public assets added:
  - `one-world-relief/assets/projects/case-002/livelihood-support-002-main.jpg`
  - `one-world-relief/assets/projects/case-002/livelihood-support-002-proof.jpg`
  - `one-world-relief/assets/projects/case-002/livelihood-support-002-thumbnail.jpg`
  - `one-world-relief/assets/projects/case-002/livelihood-support-002-video-poster.jpg`
  - `one-world-relief/assets/projects/case-002/livelihood-support-002-primary.mp4`
- Public page added:
  - `one-world-relief/projects/case-002.html`
- Public board updated:
  - `one-world-relief/project-data.js` now publishes Case 001 and Case 002.
  - Homepage story panel now lists both cases.
  - Homepage proof flow now points at Case 002 media.
- Privacy decision:
  - Case package contained identity/address documents.
  - Do not publish NID/passport/address documents publicly.
  - Public page uses privacy-safe story copy and only photo/video proof.
- Removed old random placeholder project pages so public deploy does not keep unused case pages:
  - `one-world-relief/projects/village-qurbani-meal-support.html`
  - `one-world-relief/projects/two-year-orphan-education-support.html`
  - `one-world-relief/projects/food-stand-for-a-father.html`
- Test results:
  - `node --test tests/charity-functions.test.mjs`: 12 tests passed.
  - `Backend/test_favorites.py`: 3 tests passed.
  - `Backend/test_favorites_comprehensive.py`: 10 tests passed.
  - `Backend/test_planner_comprehensive.py`: 10 tests passed.
- Browser verification:
  - Local preview root, `projects.html`, and `projects/case-002.html` returned HTTP 200.
  - Projects page rendered 2 cards: Case 001 and Case 002.
  - Case 002 page rendered 4 proof cards, 2 videos, and no broken images.
- Code sync:
  - GitHub code commit: `3e997cc feat: add one world relief case 002`
  - Local GitLab sync commit created: `9a13964 feat: add one world relief case 002`
  - GitLab remote push was attempted once and hung on credentials; stuck git processes were stopped. Local GitLab commit remains ready to push when credentials/token work.
  - GitHub-only handoff commit before deploy: `9abaddb docs: log case 002 import`
- Cloudflare production deployment:
  - `https://d0008533.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/projects/case-002` returns HTTP 200 with Case 002 title and video reference.
  - `https://one-world-relief.org/assets/projects/case-002/livelihood-support-002-thumbnail.jpg` returns HTTP 200 with `image/jpeg`.
  - `https://one-world-relief.org/assets/projects/case-002/livelihood-support-002-primary.mp4` returns HTTP 200 with `video/mp4`.
  - `https://one-world-relief.org/project-data.js` returns HTTP 200, includes Case 001 and Case 002, does not include the removed placeholder project titles, Google Drive links, or `.com`.
  - `https://one-world-relief.com/projects/case-002` returns HTTP 301 to `https://one-world-relief.org/projects/case-002`.

### Git Sync Note
- Keep this AI handoff document on GitHub only.
- Do not push this handoff document to GitLab.
- Code changes should continue to be mirrored to GitHub and GitLab, with documentation-only handoff commits going to GitHub only.

### 2026-05-10 Project Card Button Alignment
- User reported the Project page cards were not oriented/symmetrical because the `Donate` and `View story` buttons did not line up between projects.
- Updated `one-world-relief/one-world-relief.css`:
  - `project-card` now uses fixed grid row tracks for media, metadata, title, summary, impact, update, and actions.
  - `project-card` now stretches to full grid height.
  - `project-actions` is pinned to the bottom with `align-self: end` and `margin-top: auto`.
- Browser verification on local preview:
  - `projects.html` rendered two project cards.
  - Both cards had equal height.
  - Both action areas started at the same pixel (`actionsTop: 1470`).
  - `Donate` and `View story` button positions matched exactly across both cards.
  - No broken images.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 12 tests passed.
- Code sync:
  - GitHub code commit: `fee07f0 fix: align project card actions`
  - Local GitLab sync commit created: `e4471dd fix: align project card actions`
  - GitHub-only handoff commit: `4a821de docs: log project card alignment`
- Cloudflare production deployment:
  - `https://6d04ef95.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/one-world-relief.css` contains the project card grid row alignment and action pinning rules.
  - `https://one-world-relief.org/project-data.js` still publishes Case 001 and Case 002 and does not include the removed placeholder project title.

### 2026-05-10 Add Ongoing Cases 003 and 004
- User asked to add:
  - Case 003 as ongoing orphan boy education support.
  - Case 004 as ongoing Korbani village feeding support.
- Added Case 003 public project:
  - Title: `Keeping an Orphan Boy in School`
  - Status: `Ongoing`
  - Category: `Orphan Support`
  - Page: `one-world-relief/projects/case-003.html`
  - Placeholder media: `one-world-relief/assets/projects/case-003/orphan-education-003-placeholder.svg`
- Added Case 004 public project:
  - Title: `Korbani Meals for a Village`
  - Status: `Ongoing`
  - Category: `Feeding`
  - Page: `one-world-relief/projects/case-004.html`
  - Placeholder media: `one-world-relief/assets/projects/case-004/korbani-village-004-placeholder.svg`
- Updated `one-world-relief/project-data.js`:
  - Publishes Case 001 and Case 002 as completed.
  - Publishes Case 003 and Case 004 as ongoing.
  - Project stats now render as 4 projects, 2 completed, 2 active.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 12 tests passed.
- Browser verification:
  - Local `projects.html`, `projects/case-003.html`, and `projects/case-004.html` returned HTTP 200.
  - No broken images.
  - Project stats rendered `4 projects`, `2 completed`, `2 active`.
  - First row project card action buttons remained aligned.
- Code sync:
  - GitHub code commit: `0aec5b8 feat: add ongoing charity cases`
  - Local GitLab sync commit created: `0a9f02f feat: add ongoing charity cases`
  - GitHub-only handoff commit: `aed78b4 docs: log ongoing cases`
- Cloudflare production deployment:
  - `https://300c3297.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/project-data.js` includes Case 003, Case 004, ongoing status, and both placeholder SVG paths.
  - `https://one-world-relief.org/projects/case-003` returns HTTP 200.
  - `https://one-world-relief.org/projects/case-004` returns HTTP 200.
  - `https://one-world-relief.org/assets/projects/case-003/orphan-education-003-placeholder.svg` returns HTTP 200 with `image/svg+xml`.
  - `https://one-world-relief.org/assets/projects/case-004/korbani-village-004-placeholder.svg` returns HTTP 200 with `image/svg+xml`.

### 2026-05-10 Simplify Donation Thank-You Animation
- User asked to make the final donation thank-you animation a clean checkmark and `Thank you for your Donation`, without the previous messy/cartoon feeling.
- Updated `one-world-relief/functions/charity/thank-you.js`:
  - Removed the older orbit/sweep style animation.
  - Added a centered `success-card`.
  - Added a polished circular `check-wrap` badge.
  - Added an SVG checkmark with a `draw-check` stroke animation.
  - Kept the page focused on only the thank-you message.
  - Kept receipt details off the thank-you page.
- Updated `one-world-relief/tests/charity-functions.test.mjs`:
  - Confirms the new checkmark animation classes are present.
  - Confirms the old orbit animation is not present.
  - Confirms receipt text stays off the thank-you page.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 12 tests passed.
- Browser/render verification:
  - Local render showed the check badge and title centered and visible.
  - No `.success-orbit` element.
  - No `Donation Receipt` or `Receipt ID` text on the page.
- Code sync:
  - GitHub code commit: `b38ddd8 fix: simplify donation thank you animation`
  - Local GitLab sync commit created: `947cd3d fix: simplify donation thank you animation`
  - GitHub-only handoff commit: `8e53f30 docs: log thank you animation update`
- Cloudflare production deployment:
  - `https://2a8f313b.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/charity/thank-you` contains `Thank you for your Donation`.
  - Live page contains `success-card`, `check-wrap`, and `draw-check`.
  - Live page does not contain the old `success-orbit`.
  - Live page does not contain `Donation Receipt` or `Receipt ID`.

### 2026-05-10 Add Glowing Case Timelines
- User asked to add an animated timeline to each case page so donors can understand each story and see updates when they click a case.
- Updated `one-world-relief/one-world-relief.css`:
  - Upgraded `.project-timeline` into a glowing animated timeline.
  - Added a glowing connector line with `timeline-glow`.
  - Added animated active nodes with `timeline-node-pulse`.
  - Added timestamp pills inside timeline cards.
  - Added pending-state styling with `.timeline-step-pending`.
  - Added reduced-motion handling for the new timeline animations.
- Updated completed case pages:
  - `one-world-relief/projects/case-001.html`
  - `one-world-relief/projects/case-002.html`
  - Both now show reviewed, delivered, and proof-live timeline steps.
- Updated ongoing case pages:
  - `one-world-relief/projects/case-003.html`
  - `one-world-relief/projects/case-004.html`
  - Both now show a 3-step timeline with the first step active and future updates/proof pending.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 12 tests passed.
- Browser verification:
  - Case 001, Case 002, Case 003, and Case 004 pages returned HTTP 200 locally.
  - Each page rendered a visible `.project-timeline`.
  - Each page had 3 timeline steps.
  - Ongoing cases had 1 active step and 2 pending steps.
  - No broken images.
- Code sync:
  - GitHub code commit: `0b99a8c feat: add animated case timelines`
  - Local GitLab sync commit created: `615b10c feat: add animated case timelines`
  - GitHub-only handoff commit: `18dd01a docs: log animated case timelines`
- Cloudflare production deployment:
  - `https://8d94b4d5.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/one-world-relief.css` contains `timeline-glow`, `timeline-node-pulse`, and `timeline-step-pending`.
  - `https://one-world-relief.org/projects/case-001` contains timeline and active step.
  - `https://one-world-relief.org/projects/case-002` contains timeline and active step.
  - `https://one-world-relief.org/projects/case-003` contains timeline, active step, and pending steps.
  - `https://one-world-relief.org/projects/case-004` contains timeline, active step, and pending steps.

### 2026-05-10 Add 501(c)(3) and EIN to About Page
- User asked to add nonprofit legitimacy information to the About page.
- Updated `one-world-relief/about.html`:
  - Added `501(c)(3) Status`.
  - Added `OneWorld Relief is a 501(c)(3) nonprofit organization.`
  - Added `EIN: 41-5079927`.
  - Added safe tax language: `Donations may be tax-deductible to the extent allowed by law.`
  - Kept mailing address as `Available upon request` to avoid publishing the user's home address.
- Updated `one-world-relief/tests/charity-functions.test.mjs`:
  - Added a regression test confirming the About page includes 501(c)(3), EIN, tax language, and does not expose a known private address string.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 13 tests passed.
- Code sync:
  - GitHub code commit: `58fefd2 feat: add nonprofit status to about page`
  - Local GitLab sync commit created: `875ea73 feat: add nonprofit status to about page`
  - GitHub-only handoff commit: `bb4fbed docs: log nonprofit about update`
- Cloudflare production deployment:
  - `https://76fc4bca.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/about` contains `501(c)(3) nonprofit organization`.
  - Live About page contains `41-5079927`.
  - Live About page contains `tax-deductible to the extent allowed by law`.
  - Live About page still says mailing address is `Available upon request`.
  - Live About page does not contain the known private address string.

### 2026-05-10 Cinematic Motion Pass
- User asked to make the website much more animated like the prior reference site.
- Reviewed the current reference style at `https://theoceancleanup.com/` and translated the pattern into original One World Relief code:
  - cinematic scroll feel
  - layered drifting background motion
  - scroll-triggered reveal variants
  - pointer-reactive cards/media
  - animated counters
  - scroll progress glow
- Updated `one-world-relief/one-world-relief.js`:
  - Added `setupScrollProgress()`.
  - Added reveal variants via `data-reveal-variant`.
  - Added `setupPointerMotion()` for project cards, proof cards, case media, home stories, and donation form.
  - Added `setupAnimatedNumbers()` for project stats and homepage impact stats.
- Updated `one-world-relief/one-world-relief.css`:
  - Added `.scroll-progress`.
  - Added animated button shine.
  - Added floating hero motion.
  - Added drifting ribbon overlays on hero/page/case sections.
  - Added stronger reveal motion variants with blur-to-clear transitions.
  - Added pointer-glow/tilt surfaces.
  - Added reduced-motion fallbacks for the new animation effects.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 13 tests passed.
- Browser verification:
  - Local `/`, `/donate.html`, `/projects.html`, and `/projects/case-003.html` returned HTTP 200.
  - No broken images.
  - `.scroll-progress` updated after scrolling.
  - `.reveal.is-visible` elements appeared.
  - `.motion-surface` elements were present.
  - Project card pointer movement set tilt CSS variables.
- Code sync:
  - GitHub code commit: `1aa13d1 feat: add cinematic site motion`
  - Local GitLab sync commit created: `1d6cb67 feat: add cinematic site motion`
  - GitHub-only handoff commit: `4814844 docs: log cinematic motion pass`
- Cloudflare production deployment:
  - `https://f3cd9256.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/one-world-relief.css` contains scroll progress, ribbon drift, section float, pointer glow, and reduced-motion support.
  - `https://one-world-relief.org/one-world-relief.js` contains scroll progress, pointer motion, animated numbers, and reveal variant setup.
  - `https://one-world-relief.org/`, `/projects`, and `/donate` return HTTP 200.

### 2026-05-10 Remove Cursor Glow Effect
- User said they did not like the glowy cursor effect.
- Updated `one-world-relief/one-world-relief.js`:
  - Removed pointer-driven `--glow-x` and `--glow-y` updates.
  - Kept subtle pointer tilt motion.
- Updated `one-world-relief/one-world-relief.css`:
  - Removed `--glow-x` / `--glow-y` variables.
  - Removed radial cursor-follow overlay pseudo-elements from motion surfaces.
  - Kept non-cursor animations such as scroll progress, reveal motion, timelines, and subtle tilt.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 13 tests passed.
- Browser verification:
  - Local `projects.html` returned HTTP 200.
  - No broken images.
  - Project card tilt still works.
  - Project card no longer sets glow variables.
  - Project card `::before` glow overlay is gone.
- Code sync:
  - GitHub code commit: `ac51262 fix: remove cursor glow effect`
  - Local GitLab sync commit created: `452f308 fix: remove cursor glow effect`
  - GitHub-only handoff commit: `ae2a5d1 docs: log cursor glow removal`
- Cloudflare production deployment:
  - `https://4d1319eb.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/one-world-relief.css` no longer contains `--glow-x`, `--glow-y`, or the cursor radial gradient.
  - Live CSS still contains subtle tilt and scroll progress.
  - `https://one-world-relief.org/one-world-relief.js` no longer sets `--glow-x` or `--glow-y`.
  - Live JS still contains pointer motion and tilt.
  - `https://one-world-relief.org/projects` returns HTTP 200.

### 2026-05-11 Donation Custom Amount Popup
- User asked to keep the current animation direction and make the donation page custom amount clickable so donors can choose their own amount only after clicking it.
- Updated `one-world-relief/donate.html`:
  - Added a fifth amount choice labeled `Custom`.
  - Moved the custom dollar input into a hidden `#customDonationPanel` that opens only when `Custom` is selected.
- Updated `one-world-relief/one-world-relief.js`:
  - Added `syncCustomAmountPanel()` to open/close the custom amount panel.
  - Custom amount input is required only while `Custom` is selected.
  - Preset amounts now clear the custom input so an old custom amount cannot override `$10`, `$25`, `$50`, or `$100`.
  - URL deep links such as `donate.html?amount=222&campaign=Feeding#donationForm` now select `Custom`, fill `222`, and keep the campaign selected.
- Updated `one-world-relief/one-world-relief.css`:
  - Reworked amount buttons into animated selectable tiles.
  - Added an animated custom amount panel with a subtle flowing background.
  - Added responsive tablet layout and reduced-motion support for the new panel animation.
- Added test coverage in `one-world-relief/tests/charity-functions.test.mjs` for the hidden custom panel, custom radio option, JavaScript syncing, and panel animation styles.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 14 tests passed.
- Browser automation note:
  - Attempted a local Playwright smoke test, but Playwright is not installed in this workspace. No new dependency was added.
- Code sync:
  - GitHub code commit: `88709bf fix: make custom donation amount selectable`
  - Local GitLab sync commit created: `6e0f7a3 fix: make custom donation amount selectable`
- Cloudflare production deployment:
  - `https://dbf47851.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/donate` contains the custom amount radio, hidden `customDonationPanel`, and numeric input mode.
  - `https://one-world-relief.org/one-world-relief.js` contains `syncCustomAmountPanel`, custom amount branching, and preset clearing.
  - `https://one-world-relief.org/one-world-relief.css` contains the custom donation panel styles and new panel keyframes.
  - Live CSS/JS still do not contain the removed cursor glow variables.

### 2026-05-11 Homepage Flowing Case Photo Reel
- User emphasized that making the animations flowy is key and asked for the homepage case photos to animate so visitors can see the work One World Relief has done.
- Updated `one-world-relief/index.html`:
  - Added a `Cases in Motion` homepage section between the donation focus chips and the project flow section.
  - Added `#homeCaseFlowTrack` as the dynamic container for case photo cards.
  - Loaded `project-data.js` before `one-world-relief.js` on the homepage so the reel uses the same real case data as the Projects page.
- Updated `one-world-relief/one-world-relief.js`:
  - Added `renderHomeCaseFlow()` to build a duplicated, seamless case reel from `window.ONE_WORLD_RELIEF_PROJECTS`.
  - Each case card links to its case page and displays case ID/status, title, category, and amount/progress.
  - Added `.case-flow-card` to existing pointer tilt motion targets.
- Updated `one-world-relief/one-world-relief.css`:
  - Added a full-width flowing case photo strip with large image cards, edge fade mask, hover pause, shine sweep, card float, and long-current background motion.
  - Added responsive mobile sizing and reduced-motion fallback so the reel becomes manually scrollable when motion reduction is requested.
- Added test coverage in `one-world-relief/tests/charity-functions.test.mjs` for the homepage section, project data script, renderer, and flow keyframes.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 15 tests passed.
- Code sync:
  - GitHub code commit: `09e4294 feat: add flowing homepage case reel`
  - Local GitLab sync commit created: `3d188d1 feat: add flowing homepage case reel`
- Cloudflare production deployment:
  - `https://7c1eeb23.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/` contains `Cases in Motion`, `homeCaseFlowTrack`, and the `project-data.js` script.
  - Live JavaScript contains `renderHomeCaseFlow()` and `.case-flow-card` pointer motion support.
  - Live CSS contains `.home-case-flow`, `@keyframes case-river`, `@keyframes case-shine`, and reduced-motion support for the case reel.

### 2026-05-11 Completed Case Reel, Custom Amount, Contact Polish
- User clarified:
  - Homepage animation should only show cases One World Relief already worked on / finished.
  - Remove the homepage text `See the work as it moves` and just show the animation.
  - Keep the case reel looping continuously without stopping on hover and restarting.
  - Make the amount custom option behave like a clickable button that opens the custom amount input.
  - Improve the contact page to match the more polished homepage motion style.
- Updated `one-world-relief/index.html`:
  - The case reel now has only an accessible hidden heading; no visible `See the work as it moves` copy.
  - Homepage quick donation now has a `Custom Amount` radio button and hidden `#quickCustomPanel`.
- Updated `one-world-relief/donate.html`:
  - Renamed the custom amount option to `Custom Amount`.
- Updated `one-world-relief/one-world-relief.js`:
  - `renderHomeCaseFlow()` filters the reel to completed cases only.
  - The reel repeats completed cases four times to keep the loop visually continuous.
  - Added `syncQuickCustomPanel()` for the homepage quick donation custom amount popup.
  - Added validation so a selected custom quick amount must be entered before redirecting.
  - Added `contact-message-card` to pointer tilt targets.
- Updated `one-world-relief/one-world-relief.css`:
  - Removed hover pause from the case reel.
  - Added button-style quick amount tiles and animated quick custom amount panel.
  - Added `.sr-only` utility for accessible hidden headings.
  - Added flowing contact page layout, contact method cards, animated current background, and polished message card.
- Updated `one-world-relief/contact.html`:
  - Rebuilt the top contact content into a motion-friendly direct contact + message layout.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 16 tests passed.
- Code sync:
  - GitHub code commit: `6b470ad feat: refine homepage reel contact and custom amounts`
  - Local GitLab sync commit created: `9ee1ed4 feat: refine homepage reel contact and custom amounts`
- Cloudflare production deployment:
  - `https://dca949a4.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/` no longer contains the visible `See the work as it moves` text.
  - Homepage contains the accessible hidden completed-cases heading, quick custom amount panel, and project data script.
  - Live JavaScript filters the case reel to completed cases and includes `syncQuickCustomPanel()`.
  - Live CSS no longer pauses the case reel on hover and includes quick custom panel/contact flow styles.
  - `https://one-world-relief.org/contact` contains the new contact flow section, contact method cards, and polished message card.

### 2026-05-11 Homepage Motion Performance Pass
- User reported the site felt a little laggy and asked to check and make it smooth.
- Main likely source was the homepage case reel, which had a continuous track animation plus per-card float animation, animated shine overlays, blur reveal filters, hover image filters, pointer tilt on moving cards, and CSS `mask-image`.
- Updated `one-world-relief/one-world-relief.css`:
  - Replaced `mask-image` edge fading on the case reel with lightweight gradient pseudo-elements.
  - Changed the case reel to a single `translate3d()` track animation with `will-change: transform`.
  - Removed per-card infinite float animation.
  - Removed case shine animation/keyframes.
  - Removed blur/filter reveal from case cards.
  - Reduced card shadow intensity.
- Updated `one-world-relief/one-world-relief.js`:
  - Removed `.case-flow-card` from pointer tilt targets because those cards are already in a moving reel.
  - Throttled remaining pointer tilt work with `requestAnimationFrame()` and cancels pending frames on pointer leave.
- Updated tests to assert the optimized motion path stays in place.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 16 tests passed.
- Code sync:
  - GitHub code commit: `98c2cce perf: smooth homepage motion effects`
  - Local GitLab sync commit created: `b13fc00 perf: smooth homepage motion effects`
- Cloudflare production deployment:
  - `https://05650f0c.trying-8o0.pages.dev`
- Live verification:
  - Live CSS uses `translate3d(calc(-50% - 0.5rem), 0, 0)` and `will-change: transform` for the reel track.
  - Live CSS no longer contains `case-shine`, `mask-image`, `case-card-float`, or `filter: blur(10px)` for the case cards.
  - Live JS no longer applies pointer tilt to `.case-flow-card`.
  - Live JS includes `requestAnimationFrame()` throttling and `cancelAnimationFrame(pointerFrame)` for pointer tilt.

### 2026-05-11 Homepage Worked-On vs Goals Case Lanes
- User asked for the homepage case area to show cases One World Relief already worked on on the left, and cases being worked toward as goals on the right.
- Updated `one-world-relief/index.html`:
  - Replaced the hardcoded `Current Cases` list with two dynamic lanes:
    - `Worked On`
    - `Goals`
  - Added `#homeCompletedCases` and `#homeGoalCases` containers.
- Updated `one-world-relief/one-world-relief.js`:
  - Added `renderHomeCaseLanes()`.
  - Completed cases are filtered into `Worked On`.
  - Non-completed/ongoing cases are filtered into `Goals`.
  - Both lanes render from `window.ONE_WORLD_RELIEF_PROJECTS` so future cases stay in sync with the project data.
- Updated `one-world-relief/one-world-relief.css`:
  - Adjusted the hero action panel to give the case lane area more room.
  - Added `.home-case-lanes`, `.home-case-lane`, and empty-state styling.
  - Preserved mobile responsiveness by stacking lanes on small screens.
- Updated tests to cover the two lane containers and the completed/goal filters.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 16 tests passed.
- Code sync:
  - GitHub code commit: `0b82dff feat: split homepage cases into worked and goals`
  - Local GitLab sync commit created: `ff9e90e feat: split homepage cases into worked and goals`
- Cloudflare production deployment:
  - `https://fb3ff504.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/` contains `Worked On`, `Goals`, `homeCompletedCases`, and `homeGoalCases`.
  - Live JavaScript contains `renderHomeCaseLanes()`, completed case filtering, goal case filtering, and calls the renderer.
  - Live CSS contains `.home-case-lanes`, `.home-case-lane`, and `.story-empty`.

### 2026-05-11 Replace Internal Proof Section With Faith Reminder Video
- User disliked the public-facing `From donation to proof, keep the story moving` section and said it felt weird for visitors.
- User asked for that area to become a background video section with scrolling Quran/Hadith reminders about supporting orphans and building wells.
- Verified source references before adding text:
  - Quran 2:215 from Quran.com.
  - Sahih al-Bukhari 6005 from Sunnah.com.
  - Quran 76:8 from Quran.com.
  - Sunan Abi Dawud 1681 from Sunnah.com.
- Updated `one-world-relief/index.html`:
  - Removed the visible `Project Flow` section content.
  - Added `faith-video-section` with looping muted background video.
  - Added continuously scrolling quote cards for Quran 2:215, Sahih al-Bukhari 6005, Quran 76:8, and Sunan Abi Dawud 1681.
- Updated `one-world-relief/one-world-relief.css`:
  - Added full-bleed video background styling.
  - Added dark readable overlay.
  - Added `faith-quote-track` and `faith-quote-scroll` animation.
  - Added reduced-motion fallback that hides the video and makes the quote track manually scrollable.
- Updated tests to assert the old internal section text is gone and the faith/video section is present.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 16 tests passed.
- Code sync:
  - GitHub code commit: `e499ac9 feat: add faith reminder video section`
  - Local GitLab sync commit created: `0565dba feat: add faith reminder video section`
- Cloudflare production deployment:
  - `https://532e07ee.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/` no longer contains `Project Flow` or `From donation to proof`.
  - Live homepage contains `faith-video-section`, `faith-video-bg`, Quran 2:215, Sahih al-Bukhari 6005, Quran 76:8, and Sunan Abi Dawud 1681.
  - Live CSS contains `.faith-video-section`, `.faith-quote-track`, `@keyframes faith-quote-scroll`, and reduced-motion video fallback.

### 2026-05-11 Replace Ongoing Case Placeholder Art With Current Case Banner
- User disliked the fake placeholder illustration on Case 003 and asked to remove it and show `Current Case` with the case number over a banner instead.
- Updated `one-world-relief/project-data.js`:
  - Case 003 and Case 004 now use `thumbnailType: "banner"` instead of placeholder SVG thumbnails.
- Updated `one-world-relief/one-world-relief.js`:
  - Project cards now render a `.project-media-banner` for banner thumbnail cases.
  - Banner displays `Current Case` and the case number from the case ID.
- Updated `one-world-relief/projects/case-003.html` and `one-world-relief/projects/case-004.html`:
  - Removed placeholder SVG images.
  - Added `.current-case-banner` with `Current Case` and `003` / `004`.
- Updated `one-world-relief/one-world-relief.css`:
  - Added reusable `.project-media-banner` and `.current-case-banner` styles.
  - Banner includes abstract background bands and large case number.
- Updated tests to ensure placeholder SVG references are gone from data/pages and banner styles/rendering are present.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 16 tests passed.
- Code sync:
  - GitHub code commit: `edbd942 feat: replace ongoing case placeholders with banners`
  - Local GitLab sync commit created: `e9d3499 feat: replace ongoing case placeholders with banners`
- Cloudflare production deployment:
  - `https://b6d972e9.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/project-data.js` has `thumbnailType: "banner"` for ongoing cases and no longer references the Case 003/004 placeholder SVG filenames.
  - `https://one-world-relief.org/projects/case-003` and `/projects/case-004` contain `current-case-banner` and `Current Case`, and no longer reference the placeholder SVGs.
  - Live CSS/JS contain `.project-media-banner`, `.current-case-banner`, and `Current Case` rendering support.

### 2026-05-11 Share Page Link/Icon Clarity
- User asked to make sure the share links work, are easy to use, and have icons next to them.
- Updated `one-world-relief/share.html`:
  - Added inline icons beside Facebook, X, Instagram Caption, WhatsApp, Enlarge QR, Share, Download QR, and Text Link actions.
  - Kept Facebook, X, WhatsApp, SMS, download, native share, Instagram caption copy, and QR modal actions wired to their existing destinations/handlers.
- Updated `one-world-relief/one-world-relief.css`:
  - Added `.share-icon` styling.
  - Added icon spacing and hover affordance for share pills and share buttons.
- Updated tests:
  - Share tests now assert the `.org` Facebook, X, WhatsApp, SMS, QR download, native share, Instagram caption copy, and QR modal actions are present.
  - Added CSS coverage for icon button styling.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 17 tests passed.
- Code sync:
  - GitHub code commit: `d4df787 feat: add icons to share actions`
  - Local GitLab sync commit created: `6ad2ecd feat: add icons to share actions`
- Cloudflare production deployment:
  - `https://bbfacd0f.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/share` contains `.share-icon` icons and working Facebook, X, WhatsApp, SMS, QR download, native share, Instagram caption copy, and QR modal controls.
  - Live CSS contains `.share-icon`, `.share-pill:hover`, and share button icon layout styles.
  - Live QR SVG returns HTTP 200 and contains the expected SVG/styling.

### 2026-05-11 Contact Page Typography Polish
- User said the contact section font/layout looked out of place and weird.
- Updated `one-world-relief/contact.html`:
  - Changed the large left heading from `Send a note and we will follow up.` to `We are here to help.`
  - Added a concise intro line explaining donations, receipts, project updates, and partnerships.
  - Changed form title from `Send a Message` to `Send us a note` with a small `Message` eyebrow.
- Updated `one-world-relief/one-world-relief.css`:
  - Switched contact section headings from the oversized serif display style to Manrope sans-serif.
  - Reduced heading size and widened max line length for a calmer layout.
  - Tightened contact card spacing, reduced shadows, and softened card radius.
  - Tightened form label/input spacing.
- Updated tests to assert the new contact copy and typography rules are present and old wording is gone.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 17 tests passed.
- Code sync:
  - GitHub code commit: `5d636de style: polish contact page typography`
  - Local GitLab sync commit created: `36c2a5a style: polish contact page typography`
- Cloudflare production deployment:
  - `https://9265ad9e.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/contact` contains `We are here to help`, the new intro sentence, and `Send us a note`.
  - Live contact page no longer contains `Send a note and we will follow up`.
  - Live CSS contains `.contact-intro`, Manrope heading rules for the contact methods and message card headings, and the tighter contact card shadow.

### 2026-05-11 Homepage Hero Layout Correction
- User called out the homepage hero screenshot as looking bad/stupid because the donation form and case lanes were squeezed together.
- Updated `one-world-relief/index.html`:
  - Removed the Worked On/Goals case lanes from inside the hero.
  - Added a separate `home-case-panel-section` immediately below the hero for the Worked On/Goals lanes.
- Updated `one-world-relief/one-world-relief.css`:
  - Hero is now a clean two-column layout: message copy + donation card.
  - Donation card max width is capped at 420px and aligned cleanly.
  - Quick amount buttons have more height and spacing so `$10/$25/$50/$100` do not crowd.
  - Worked On/Goals panel now has room below the hero and renders lane items in a readable grid.
  - Responsive rules keep the donation card centered and stack case items on smaller screens.
- Updated tests to assert the case panel is outside the hero and the new hero columns are used.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 17 tests passed.
- Code sync:
  - GitHub code commit: `a7937ae fix: separate homepage hero and case panels`
  - Local GitLab sync commit created: `dc44592 fix: separate homepage hero and case panels`
- Cloudflare production deployment:
  - `https://5b73b0e6.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/` contains `home-case-panel-section` after the hero, with Worked On/Goals no longer inside the hero card.
  - Live CSS uses the corrected two-column hero grid `minmax(0, 0.95fr) minmax(340px, 420px)`.
  - Live CSS caps the quick donation card at `max-width: 420px` and gives quick amount buttons `min-height: 58px`.

### 2026-05-11 Remove Redundant Projects Page Hero
- User asked to remove the Projects page intro hero because visitors already know they clicked Projects.
- Updated `one-world-relief/projects.html`:
  - Removed the `page-hero` section with `Projects` / `See where donations go.` / explanatory copy.
  - Projects page now opens directly into categories and the project board.
- Updated tests:
  - Added coverage that `projects.html` no longer contains the old hero or `See where donations go`, and still contains categories plus `#projectBoard`.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 18 tests passed.
- Code sync:
  - GitHub code commit: `4b48ea5 fix: remove redundant projects hero`
  - Local GitLab sync commit created: `0782a3d fix: remove redundant projects hero`
- Cloudflare production deployment:
  - `https://08f8699f.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/projects` no longer contains `See where donations go`.
  - Live projects page no longer contains the removed `<section class="page-hero reveal">`.
  - Live projects page still contains the `Categories` section and `#projectBoard`.

### 2026-05-11 Restore Simple Share Buttons
- User asked to revert the QR/share action buttons shown on the Share page because the new icon badges looked wrong.
- Updated `one-world-relief/share.html`:
  - Removed inline `.share-icon` spans from Facebook, X, Instagram Caption, WhatsApp, Enlarge QR, Share, Download QR, and Text Link actions.
  - Restored the QR action buttons to simple text-only buttons.
- Updated `one-world-relief/one-world-relief.css`:
  - Removed `.share-icon` badge styling.
  - Removed the icon-specific share button gap/inline-flex overrides and added hover effects tied to the icon pass.
- Updated tests:
  - Share test now asserts `.share-icon` markup is absent while the `.org` share links and QR controls still exist.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 17 tests passed.
- Code sync:
  - GitHub code commit: `2a27900 fix: restore simple share buttons`
  - Local GitLab sync commit created: `cd277f6 fix: restore simple share buttons`
- Cloudflare production deployment:
  - `https://a2175297.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/share` no longer contains `.share-icon` markup.
  - Live CSS no longer contains `.share-icon` styling.
  - Live Share page has text-only `Enlarge QR` and `Download QR` actions and still points to `one-world-relief.org/donate`.

### 2026-05-11 Clean About Organization Details
- User asked to make the About page nonprofit/owner/details section look cleaner.
- Updated `one-world-relief/about.html`:
  - Replaced the separate Owner, nonprofit status, contact, mailing address, and donor questions card rows with one cleaner `official-panel`.
  - Changed the section heading to `Organization Details` and removed the awkward `Owned by Fahadbin Alam` heading.
  - Kept EIN, 501(c)(3) status, tax-deductible language, public email, mailing-address privacy, and donor-question guidance visible.
- Updated `one-world-relief/one-world-relief.css`:
  - Added `official-panel` and `official-details` styles with a cleaner two-column layout, compact detail tiles, softer borders, and responsive stacking.
- Updated tests:
  - About test now verifies `official-panel` / `official-details`, confirms EIN/nonprofit/tax/contact privacy copy, and asserts `Owned by Fahadbin Alam` is gone.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 17 tests passed.
- Code sync:
  - GitHub code commit: `6c8509d style: clean up about organization details`
  - Local GitLab sync commit created: `a415b09 style: clean up about organization details`
- Cloudflare production deployment:
  - `https://4f82d9bb.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/about` contains `Organization Details`, `official-panel`, `official-details`, and EIN `41-5079927`.
  - Live About page no longer contains `Owned by Fahadbin Alam`.
  - Live CSS contains `.official-panel` and `.official-details`.

### 2026-05-11 Visual Review: Contact Layout and Reveal Timing
- User called out that the Contact page was visually not good enough, mis-oriented, and that the email button looked bad.
- Performed a local visual screenshot pass using Playwright on desktop and mobile for:
  - Home, Donate, Projects, Share, About, Contact.
- Issues found:
  - Contact page had a separate top hero that pushed the form too low; the submit button sat awkwardly near the decorative bottom band.
  - Mobile Projects had a blank gap after categories because reveal animations triggered too late.
- Updated `one-world-relief/contact.html`:
  - Removed the separate `page-hero contact-hero`.
  - Made Contact a single two-column section with `Reach One World Relief.` on the left and the form on the right.
  - Renamed the form submit button from `Email Us` to `Send Email` and added `contact-submit`.
- Updated `one-world-relief/one-world-relief.css`:
  - Contact section now uses `min-height: calc(100svh - 74px)` and centers the grid in the viewport.
  - Improved contact column proportions, heading scale, form spacing, textarea height, and submit button shape/alignment.
  - Softened the contact form decorative bottom band so it does not fight the button.
- Updated `one-world-relief/one-world-relief.js`:
  - Reveal observer now uses `rootMargin: "0px 0px 22% 0px"` and lower threshold so below-the-fold sections appear earlier.
- Updated tests:
  - Contact test now verifies `Reach One World Relief`, `Send Email`, `.contact-submit`, centered viewport height, and earlier reveal timing.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 17 tests passed.
- Visual verification:
  - Desktop Contact screenshot now shows the full contact info and full message card with the `Send Email` button visible and aligned.
  - Mobile Contact screenshot stacks cleanly with readable contact cards and form.
  - Mobile Projects screenshot now shows `Impact Board`, stats, and the first case card instead of a blank gap.
- Code sync:
  - GitHub code commit: `a622036 fix: tighten contact layout and reveal timing`
  - Local GitLab sync commit created: `1112857 fix: tighten contact layout and reveal timing`
- Cloudflare production deployment:
  - `https://ba49b3fa.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/contact` contains the single contact layout, `contact-submit`, and `Send Email`.
  - Live Contact page no longer contains the removed `page-hero contact-hero`.
  - Live JS contains the earlier reveal `rootMargin: "0px 0px 22% 0px"`.
  - `https://one-world-relief.org/projects` still contains `Latest work and current campaigns` and `#projectBoard`.

### 2026-05-11 Donation Page Flow Inspired by LaunchGood Review
- User asked to look at `launchgood.com`, especially its donation page, and adapt useful ideas.
- Research note:
  - Direct automated screenshots of LaunchGood were blocked by Cloudflare verification.
  - Adapted the broadly useful donation-platform patterns without copying LaunchGood branding: put the donation form first, make amount choices clearer, keep Stripe Checkout as the secure payment surface, and collect optional donor context.
- Updated `one-world-relief/donate.html`:
  - Moved the real `#donationForm` into the top donation hero so donors can start giving immediately.
  - Changed the form heading to `Give in under a minute.` with a visible `USD` pill.
  - Changed quick amounts into impact-style choices: `$10 Basic support`, `$25 Essentials`, `$50 Food aid`, `$100 Project help`, and `Custom Your amount`.
  - Added optional `Note for One World Relief` textarea.
  - Added `Keep my name anonymous in public updates` checkbox.
  - Changed submit copy to `Continue to Secure Checkout`.
  - Moved the QR/share card below the fund cards under `After You Give`.
- Updated `one-world-relief/one-world-relief.css`:
  - Added featured donation form styling, donation-form heading, amount impact label styling, donor options, and checkbox styling.
  - Adjusted hero grid proportions so the donation form is prominent but still balanced with the page headline.
- Updated `one-world-relief/one-world-relief.js`:
  - Sends `donor_note` and `anonymous_public` with checkout requests.
  - Restores the correct `Continue to Secure Checkout` label after checkout errors.
- Updated `one-world-relief/functions/charity/donations/checkout.js`:
  - Accepts `donor_note` and `anonymous_public`.
  - Adds both fields to Stripe Session metadata and PaymentIntent metadata.
- Updated `one-world-relief/functions/charity/webhooks/stripe.js`:
  - Adds anonymous-public status and donor note into the spreadsheet Notes column.
- Updated tests:
  - Checkout test verifies donor note and anonymous-public metadata are passed to Stripe.
  - Donate page test verifies the new top form, impact labels, donor options, and CSS hooks.
  - Webhook test verifies donor note and anonymous-public status land in spreadsheet notes.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 17 tests passed.
- Visual verification:
  - Generated local desktop and mobile Donate screenshots.
  - Desktop Donate shows the secure form in the first viewport beside the donation headline.
  - Mobile Donate shows the headline, payment methods, and donation form starting in the first viewport.
- Code sync:
  - GitHub code commit: `8724764 feat: improve donation page flow`
  - Local GitLab sync commit created: `9479e4f feat: improve donation page flow`
- Cloudflare production deployment:
  - `https://8d04809e.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/donate` contains `donation-form-card-featured`, `Continue to Secure Checkout`, impact amount labels, `donorNote`, and `anonymousDonation`.
  - Live JS sends `donor_note` and `anonymous_public`.
  - Live CSS contains `.donation-form-card-featured` and `.donor-options`.

### 2026-05-11 Simplify Projects Category Filters
- User said the Projects page should not explain obvious categories and should show them instead.
- Updated `one-world-relief/projects.html`:
  - Removed the `Categories` eyebrow and `Clear giving categories` headline.
  - Converted the top Projects content into a compact `project-filter-section` with only category/filter pills.
  - Added `aria-label="Project filters"` for accessibility without visible explanatory text.
- Updated `one-world-relief/one-world-relief.css`:
  - Added `.project-filter-section` and `.project-filter-row` spacing so the filters sit cleanly above the impact board.
- Updated tests:
  - Projects test now asserts `Clear giving categories` is gone and `project-filter-section` / `Project filters` remain.
- Test result:
  - `node --test tests/charity-functions.test.mjs`: 17 tests passed.
- Visual verification:
  - Generated desktop and mobile Projects screenshots.
  - Confirmed the filter row appears directly at the top, the redundant headline is gone, and the Impact Board/cards are visible quickly on mobile.
- Code sync:
  - GitHub code commit: `9990a74 fix: simplify projects category filters`
  - Local GitLab sync commit created: `4c0c262 fix: simplify projects category filters`
- Cloudflare production deployment:
  - `https://557b1cd0.trying-8o0.pages.dev`
- Live verification:
  - `https://one-world-relief.org/projects` no longer contains `Clear giving categories`.
  - Live Projects page contains `project-filter-section`, `aria-label="Project filters"`, and `Latest work and current campaigns`.
  - Live CSS contains `.project-filter-section`.

---

**End of AI Handoff Documentation**

*This document should be updated whenever major changes are made or new integrations added.*
