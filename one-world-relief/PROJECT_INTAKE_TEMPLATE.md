# One World Relief Project Intake Template

Use this when you want to add a new completed project or active campaign to the Projects page.

## Basic Info

- Case number (`case-NNN`):
- Project title:
- Category: Orphan Support / Livelihood Support / Feeding / Emergency Relief / Mosque Support / Water Support / Other
- Status: Completed / Active / Urgent Need
- Location:
- Completion/update date or timeline:
- Exact project cost or amount raised (write `Not publicly listed` if unverified):
- What donations paid for:
- Verified quantity or impact (leave blank if unverified):

## Source and Visibility

- Source type: Original photo/video / Facebook / Google Drive / receipt / letter / other
- Source URL or local folder:
- Source visibility: Public / friends-only / private
- Exact source date:
- Facts the source directly verifies:
- Facts that are still unknown:

Do not describe friends-only or private Facebook material as a public post. Preserve the original visibility in the handoff notes even when approved photo derivatives are published on the website.

## Donor-Facing Summary

Write 2-3 sentences explaining what happened, who benefited, and why it matters.

## Latest Update

Write one short update donors can read quickly. Example:

`Food packs were delivered to 40 families in April 2026. Photos and receipts are available for donor review.`

## Photos

Send:

- 1 main thumbnail photo for the project card
- 3-8 supporting photos if available
- Any receipt/proof photos that are safe to show publicly

Photo tips:

- Use JPG or PNG.
- Exclude phone numbers, addresses, donor names, IDs, medical details, and private correspondence unless publication is explicitly approved and necessary.
- Strip EXIF/GPS/device metadata from every public derivative.
- Rename files clearly, like `gaza-feeding-april-2026-01.jpg`.

## Videos

Best option:

- Upload the video to YouTube as unlisted.
- Send the YouTube link.

Alternative:

- Put MP4 files in `one-world-relief/assets/projects/...`, but keep files small so GitHub and Cloudflare Pages stay fast.

## Donation Program (Stable Values)

Choose an existing canonical program ID. Do not invent a campaign label or use a `campaign=...` donation URL for new work.

| Program ID | Public amount rule | Typical project use |
| --- | --- | --- |
| `unrestricted` | Minimum `$5` | Where needed most |
| `orphan_annual` | Exactly `$300` | One year of verified orphan food and education support |
| `mosque_build` | Exactly `$1,000` | Verified mosque construction or completion support |
| `water_support` | `$350`-`$3,000` | Filtered-water station, water contribution, or community well |
| `orphan_feeding` | Minimum `$100` | Verified orphan meal/food service |
| `family_recovery` | Exactly `$600` | Assessed medical, household, or livelihood recovery need |
| `emergency_aid` | Minimum `$25` | Flood or other verified urgent relief |
| `zakat` | Minimum `$5` | Donation recorded as Zakat |

For `water_support`, use one stable variant:

- `water_station`: exactly `$350`
- `water_contribution`: any amount from `$350` through `$3,000`
- `community_well`: exactly `$3,000`

Intake fields:

- Program ID:
- Default/link amount:
- Water variant, if applicable:
- Accept donations directly from this project: Yes / No
- If completed/closed, which broader future-work program should the support link select:

Canonical project donation URL:

`donate.html?program=<program_id>&amount=<amount>&referrer=case-NNN#donationForm`

Example:

`donate.html?program=emergency_aid&amount=25&referrer=case-010#donationForm`

For water, add the stable browser query field `variant`, for example:

`donate.html?program=water_support&variant=water_station&amount=350&referrer=case-010#donationForm`

The browser sends the canonical values to the server as `program_id`, optional `program_variant`, and `referrer_case`. The server owns the campaign label, Stripe description, and amount enforcement. Adding a truly new program requires coordinated updates to `donation-programs.js`, both mirrored Checkout Functions, tests, and the AI handoff; changing only a URL is not enough.

## Data Entry

Each project becomes one object in `project-data.js` with:

```js
{
  title: "Emergency Supplies for Flood-Affected Families",
  donationLabel: "Emergency Aid",
  acceptsDonations: true,
  category: "Emergency Relief",
  status: "Active",
  location: "Bangladesh",
  date: "Case 010",
  amountRaised: "Goal not publicly listed",
  impact: "Verified emergency supplies planned for affected families",
  summary: "Two-sentence, source-grounded donor-facing summary.",
  update: "Latest verified project update.",
  thumbnailUrl: "assets/projects/case-010/flood-relief-010-thumbnail.jpg",
  mediaLabel: "View story",
  mediaUrl: "projects/case-010.html",
  donationUrl: "donate.html?program=emergency_aid&amount=25&referrer=case-010#donationForm"
}
```

Before publishing, confirm every claimed amount, date, quantity, location, completion state, and beneficiary description against the supplied source. Unknown facts should stay explicitly unlisted rather than estimated.
