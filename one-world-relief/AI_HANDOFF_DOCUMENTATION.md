# One World Relief - AI Handoff Documentation
**Last Updated**: May 4, 2026  
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

Receipt ID: R-2026-001
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
2. Implement email confirmation system
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

**End of AI Handoff Documentation**

*This document should be updated whenever major changes are made or new integrations added.*
