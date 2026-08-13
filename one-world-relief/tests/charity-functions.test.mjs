import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile as readFileFromDisk } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readFile = (relativePath, options) => readFileFromDisk(resolve(projectRoot, relativePath), options);

const importFunctionModule = async (relativePath) => {
  const absolutePath = resolve(projectRoot, relativePath);
  const source = await readFileFromDisk(absolutePath, "utf8");
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
};

const createGooglePrivateKey = async () => {
  return crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  ).then(async (keyPair) => {
    const exported = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const base64 = Buffer.from(exported).toString("base64").match(/.{1,64}/g).join("\n");
    return `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`;
  });
};

test("checkout creates Stripe session with receipt email and configured redirect URLs", async () => {
  const checkout = await importFunctionModule("functions/charity/donations/checkout.js");
  const originalFetch = globalThis.fetch;
  let stripeBody = "";

  globalThis.fetch = async (_url, options) => {
    stripeBody = String(options.body);
    return new Response(JSON.stringify({ url: "https://checkout.stripe.test/session" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const request = new Request("https://pages.example/charity/donations/checkout", {
      method: "POST",
      body: JSON.stringify({
        donor_name: "Test Donor",
        donor_email: "donor@example.com",
        amount_usd: 1,
        payment_method: "stripe",
        campaign: "General Fund",
        donor_note: "For orphan support",
        anonymous_public: true,
      }),
    });
    const response = await checkout.onRequestPost({
      request,
      env: {
        OWR_STRIPE_SECRET_KEY: "sk_test_mock",
        OWR_SUCCESS_URL: "https://one-world-relief.org/charity/thank-you",
        OWR_CANCEL_URL: "https://one-world-relief.org/charity/cancelled",
      },
    });
    const payload = await response.json();
    const form = new URLSearchParams(stripeBody);
    const successUrl = new URL(form.get("success_url"));

    assert.equal(response.status, 200);
    assert.equal(payload.redirect_url, "https://checkout.stripe.test/session");
    assert.equal(form.get("submit_type"), "donate");
    assert.equal(form.get("payment_intent_data[receipt_email]"), "donor@example.com");
    assert.equal(form.get("metadata[donor_note]"), "For orphan support");
    assert.equal(form.get("metadata[anonymous_public]"), "yes");
    assert.equal(form.get("payment_intent_data[metadata][donor_note]"), "For orphan support");
    assert.equal(form.get("payment_intent_data[metadata][anonymous_public]"), "yes");
    assert.equal(successUrl.origin, "https://one-world-relief.org");
    assert.equal(successUrl.pathname, "/charity/thank-you");
    assert.match(successUrl.searchParams.get("donation_id"), /^[0-9a-f-]+$/);
    assert.equal(successUrl.searchParams.get("session_id"), "{CHECKOUT_SESSION_ID}");
    assert.match(form.get("cancel_url"), /^https:\/\/one-world-relief\.org\/charity\/cancelled/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checkout supports Apple Pay through Stripe card wallets", async () => {
  const checkout = await importFunctionModule("functions/charity/donations/checkout.js");
  const originalFetch = globalThis.fetch;
  let stripeBody = "";

  globalThis.fetch = async (_url, options) => {
    stripeBody = String(options.body);
    return new Response(JSON.stringify({ url: "https://checkout.stripe.test/apple-pay" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await checkout.onRequestPost({
      request: new Request("https://pages.example/charity/donations/checkout", {
        method: "POST",
        body: JSON.stringify({
          donor_name: "Apple Donor",
          donor_email: "apple@example.com",
          amount_usd: 5,
          payment_method: "apple_pay",
          campaign: "Orphan Support",
        }),
      }),
      env: { OWR_STRIPE_SECRET_KEY: "sk_test_mock" },
    });
    const form = new URLSearchParams(stripeBody);

    assert.equal(response.status, 200);
    assert.equal(form.get("payment_method_types[0]"), "card");
    assert.equal(form.get("payment_intent_data[receipt_email]"), "apple@example.com");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checkout supports Cash App Pay through Stripe Checkout", async () => {
  const checkout = await importFunctionModule("functions/charity/donations/checkout.js");
  const originalFetch = globalThis.fetch;
  let stripeBody = "";

  globalThis.fetch = async (_url, options) => {
    stripeBody = String(options.body);
    return new Response(JSON.stringify({ url: "https://checkout.stripe.test/cash-app" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await checkout.onRequestPost({
      request: new Request("https://pages.example/charity/donations/checkout", {
        method: "POST",
        body: JSON.stringify({
          donor_name: "Cash Donor",
          donor_email: "cash@example.com",
          amount_usd: 5,
          payment_method: "cash_app",
          campaign: "Feeding",
        }),
      }),
      env: { OWR_STRIPE_SECRET_KEY: "sk_test_mock" },
    });
    const form = new URLSearchParams(stripeBody);

    assert.equal(response.status, 200);
    assert.equal(form.get("payment_method_types[0]"), "cashapp");
    assert.equal(form.get("payment_method_types[1]"), "card");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checkout creates monthly recurring Stripe subscriptions", async () => {
  const checkout = await importFunctionModule("functions/charity/donations/checkout.js");
  const originalFetch = globalThis.fetch;
  let stripeBody = "";

  globalThis.fetch = async (_url, options) => {
    stripeBody = String(options.body);
    return new Response(JSON.stringify({ url: "https://checkout.stripe.test/monthly" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await checkout.onRequestPost({
      request: new Request("https://pages.example/charity/donations/checkout", {
        method: "POST",
        body: JSON.stringify({
          donor_name: "Monthly Donor",
          donor_email: "monthly@example.com",
          amount_usd: 25,
          payment_method: "credit_card",
          campaign: "Orphan Support",
          giving_frequency: "monthly",
        }),
      }),
      env: { OWR_STRIPE_SECRET_KEY: "sk_test_mock" },
    });
    const form = new URLSearchParams(stripeBody);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.giving_frequency, "monthly");
    assert.equal(form.get("mode"), "subscription");
    assert.equal(form.get("line_items[0][price_data][recurring][interval]"), "month");
    assert.equal(form.get("payment_method_collection"), "always");
    assert.equal(form.get("metadata[giving_frequency]"), "monthly");
    assert.equal(form.get("subscription_data[metadata][giving_frequency]"), "monthly");
    assert.equal(form.get("subscription_data[metadata][donor_email]"), "monthly@example.com");
    assert.equal(form.has("payment_intent_data[receipt_email]"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checkout anchors weekly Jummah giving to Friday", async () => {
  const checkout = await importFunctionModule("functions/charity/donations/checkout.js");
  const originalFetch = globalThis.fetch;
  let stripeBody = "";

  globalThis.fetch = async (_url, options) => {
    stripeBody = String(options.body);
    return new Response(JSON.stringify({ url: "https://checkout.stripe.test/jummah" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await checkout.onRequestPost({
      request: new Request("https://pages.example/charity/donations/checkout", {
        method: "POST",
        body: JSON.stringify({
          donor_name: "Friday Donor",
          donor_email: "friday@example.com",
          amount_usd: 10,
          payment_method: "apple_pay",
          campaign: "Feeding",
          giving_frequency: "weekly_jummah",
        }),
      }),
      env: { OWR_STRIPE_SECRET_KEY: "sk_test_mock" },
    });
    const form = new URLSearchParams(stripeBody);
    const anchor = new Date(Number(form.get("subscription_data[billing_cycle_anchor]")) * 1000);

    assert.equal(response.status, 200);
    assert.equal(form.get("mode"), "subscription");
    assert.equal(form.get("payment_method_types[0]"), "card");
    assert.equal(form.get("line_items[0][price_data][recurring][interval]"), "week");
    assert.equal(form.get("subscription_data[proration_behavior]"), "none");
    assert.equal(form.get("metadata[giving_frequency]"), "weekly_jummah");
    assert.equal(form.get("metadata[schedule_label]"), "Weekly Jummah donation");
    assert.equal(anchor.getUTCDay(), 5);
    assert.equal(anchor.getUTCHours(), 17);
    assert.equal(anchor.getUTCMinutes(), 30);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checkout blocks manual payment methods for recurring donations", async () => {
  const checkout = await importFunctionModule("functions/charity/donations/checkout.js");
  const response = await checkout.onRequestPost({
    request: new Request("https://pages.example/charity/donations/checkout", {
      method: "POST",
      body: JSON.stringify({
        donor_name: "Recurring Donor",
        donor_email: "recurring@example.com",
        amount_usd: 10,
        payment_method: "cash_app",
        campaign: "General Fund",
        giving_frequency: "monthly",
      }),
    }),
    env: { OWR_STRIPE_SECRET_KEY: "sk_test_mock" },
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.detail, /Recurring donations use Stripe card checkout/);
});

test("checkout redirects Venmo only when a Venmo URL is configured", async () => {
  const checkout = await importFunctionModule("functions/charity/donations/checkout.js");
  const requestBody = {
    donor_name: "Venmo Donor",
    donor_email: "venmo@example.com",
    amount_usd: 7,
    payment_method: "venmo",
    campaign: "Wells",
  };

  const missingResponse = await checkout.onRequestPost({
    request: new Request("https://pages.example/charity/donations/checkout", {
      method: "POST",
      body: JSON.stringify(requestBody),
    }),
    env: { OWR_STRIPE_SECRET_KEY: "sk_test_mock" },
  });
  assert.equal(missingResponse.status, 503);

  const configuredResponse = await checkout.onRequestPost({
    request: new Request("https://pages.example/charity/donations/checkout", {
      method: "POST",
      body: JSON.stringify(requestBody),
    }),
    env: {
      OWR_STRIPE_SECRET_KEY: "sk_test_mock",
      OWR_VENMO_URL: "https://account.venmo.com/u/oneworldrelief",
    },
  });
  const payload = await configuredResponse.json();
  const redirect = new URL(payload.redirect_url);

  assert.equal(configuredResponse.status, 200);
  assert.equal(payload.provider, "venmo");
  assert.equal(redirect.hostname, "account.venmo.com");
  assert.equal(redirect.searchParams.get("amount"), "7.00");
  assert.match(redirect.searchParams.get("note"), /One World Relief - Wells/);
});

test("thank-you page renders polished animated donation thanks", async () => {
  const thankYou = await importFunctionModule("functions/charity/thank-you.js");
  const response = await thankYou.onRequestGet({
    request: new Request("https://one-world-relief.org/charity/thank-you?donation_id=don_123&session_id=cs_test_123"),
    env: { OWR_STRIPE_SECRET_KEY: "sk_test_mock" },
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Thank you for your Donation/);
  assert.match(html, /success-card/);
  assert.match(html, /check-wrap/);
  assert.match(html, /draw-check/);
  assert.doesNotMatch(html, /coin-gift/);
  assert.doesNotMatch(html, /story-scene/);
  assert.doesNotMatch(html, /class="person child"/);
  assert.doesNotMatch(html, /success-orbit/);
  assert.doesNotMatch(html, /Donation Receipt/);
  assert.doesNotMatch(html, /Receipt ID/);
});

test("share QR points donors to the .org donation domain", async () => {
  const [shareHtml, siteJs, qrSvg] = await Promise.all([
    readFile("share.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("assets/one-world-relief-donate-qr.svg", "utf8"),
  ]);

  assert.match(shareHtml, /one-world-relief\.org\/donate/);
  assert.match(shareHtml, /facebook\.com\/sharer\/sharer\.php\?u=https%3A%2F%2Fone-world-relief\.org%2Fdonate/);
  assert.match(shareHtml, /twitter\.com\/intent\/tweet\?url=https%3A%2F%2Fone-world-relief\.org%2Fdonate/);
  assert.match(shareHtml, /wa\.me\/\?text=Donate%20to%20One%20World%20Relief%3A%20https%3A%2F%2Fone-world-relief\.org%2Fdonate/);
  assert.match(shareHtml, /sms:\?body=Donate%20to%20One%20World%20Relief%3A%20https%3A%2F%2Fone-world-relief\.org%2Fdonate/);
  assert.match(shareHtml, /href="assets\/one-world-relief-donate-qr\.svg" download/);
  assert.match(shareHtml, /id="copyInstagramCaption"/);
  assert.match(shareHtml, /id="nativeShareButton"/);
  assert.match(shareHtml, /id="openQrPresentation"/);
  assert.match(shareHtml, /social-share-actions/);
  assert.match(shareHtml, /share-pill-facebook/);
  assert.match(shareHtml, /share-pill-instagram/);
  assert.match(shareHtml, /share-pill-whatsapp/);
  assert.match(shareHtml, /id="instagramShareStatus"/);
  assert.doesNotMatch(shareHtml, /class="share-icon"/);
  assert.match(siteJs, /https:\/\/one-world-relief\.org\/donate/);
  assert.match(siteJs, /https:\/\/www\.instagram\.com\//);
  assert.match(siteJs, /navigator\.share/);
  assert.match(siteJs, /copyInstagramCaption/);
  assert.match(qrSvg, /stroke="#183447"/);
  assert.doesNotMatch(shareHtml, /one-world-relief\.com\/donate/);
  assert.doesNotMatch(siteJs, /one-world-relief\.com\/donate/);
  assert.doesNotMatch(shareHtml, /<span class="share-icon"/);
});

test("donation page opens custom amount only when selected", async () => {
  const [donateHtml, siteJs, siteCss] = await Promise.all([
    readFile("donate.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
  ]);

  assert.match(donateHtml, /name="amount" value="custom"/);
  assert.match(donateHtml, /Donation details/);
  assert.match(donateHtml, /Continue to Secure Checkout/);
  assert.match(donateHtml, /Basic support/);
  assert.match(donateHtml, /Note for One World Relief/);
  assert.match(donateHtml, /anonymousDonation/);
  assert.match(donateHtml, /Fund &amp; schedule|Fund & schedule/);
  assert.match(donateHtml, /id="givingFrequencySelect" name="givingFrequency"/);
  assert.match(donateHtml, /value="one_time" selected>One-time donation/);
  assert.match(donateHtml, /value="monthly">Monthly recurring/);
  assert.match(donateHtml, /value="weekly_jummah">Every Friday \/ Jummah/);
  assert.match(donateHtml, /recurringDonationNote/);
  assert.doesNotMatch(donateHtml, /donation-step-frequency/);
  assert.doesNotMatch(donateHtml, /frequency-grid/);
  assert.doesNotMatch(donateHtml, /class="form-current"/);
  assert.doesNotMatch(donateHtml, /fund-chip-grid/);
  assert.doesNotMatch(donateHtml, /payment-chip-grid/);
  assert.match(donateHtml, /id="customDonationPanel" hidden/);
  assert.match(donateHtml, /inputmode="numeric"/);
  assert.match(siteJs, /syncCustomAmountPanel/);
  assert.match(siteJs, /syncRecurringPaymentAvailability/);
  assert.match(siteJs, /givingFrequencySelect/);
  assert.match(siteJs, /giving_frequency: givingFrequency/);
  assert.match(siteJs, /recurringBlockedMethods/);
  assert.doesNotMatch(siteJs, /home-stories, \.donation-form-card/);
  assert.match(siteJs, /donor_note: donorNote/);
  assert.match(siteJs, /anonymous_public: anonymousDonation/);
  assert.match(siteJs, /selected\?\.value === "custom"/);
  assert.match(siteJs, /customDonationPanel\.hidden = !isCustomAmount/);
  assert.match(siteJs, /radio\.value !== "custom"/);
  assert.match(siteCss, /\.donation-form-card-featured/);
  assert.match(siteCss, /@keyframes donation-form-sheen/);
  assert.match(siteCss, /@keyframes donation-card-glow/);
  assert.match(siteCss, /@keyframes donation-current-glide/);
  const donationCardRule = siteCss.slice(
    siteCss.indexOf(".donation-form-card {"),
    siteCss.indexOf(".donation-form-card-featured")
  );
  assert.equal(donationCardRule.includes("rotateX"), false);
  assert.equal(donationCardRule.includes("--tilt-x"), false);
  assert.match(siteCss, /\.donation-form-heading/);
  assert.match(siteCss, /\.donation-select-pair/);
  assert.match(siteCss, /\.schedule-select select/);
  assert.match(siteCss, /\.donor-options/);
  assert.match(siteCss, /\.checkbox-line/);
  assert.match(siteCss, /\.recurring-note/);
  assert.match(siteCss, /\.custom-donation-panel/);
  assert.match(siteCss, /@keyframes custom-panel-open/);
  assert.match(siteCss, /@keyframes panel-current/);
  assert.match(siteCss, /\.amount-grid label:has\(input:checked\)/);
});

test("donation page renders a calm data-driven project collage beside the checkout form", async () => {
  const [donateHtml, siteJs, siteCss, projectDataSource] = await Promise.all([
    readFile("donate.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
    readFile("project-data.js", "utf8"),
  ]);
  const projectContext = { window: {} };
  runInNewContext(projectDataSource, projectContext);
  const projects = JSON.parse(JSON.stringify(projectContext.window.ONE_WORLD_RELIEF_PROJECTS));

  assert.match(donateHtml, /<section class="donate-project-showcase" aria-labelledby="donateProjectShowcaseTitle">/);
  assert.match(donateHtml, /id="donateProjectShowcaseTitle">See the projects your gift can join\.<\/h2>/);
  assert.match(donateHtml, /<a href="projects\.html">View all projects<\/a>/);
  assert.match(donateHtml, /id="donateProjectFlow"[\s\S]*?aria-label="Completed, current, and coming-soon One World Relief projects"/);
  assert.ok(donateHtml.indexOf('id="donateProjectFlow"') < donateHtml.indexOf('class="donation-card donation-form-card'));
  assert.match(donateHtml, /<script src="project-data\.js"><\/script>\s*<script src="one-world-relief\.js"><\/script>/);
  for (const project of projects) {
    assert.equal(donateHtml.includes(project.title), false, `${project.date} content should come from project-data.js`);
  }

  assert.match(siteJs, /const donateProjectFlow = document\.getElementById\("donateProjectFlow"\)/);
  assert.match(siteJs, /const renderDonateProjectFlow = \(\) =>/);
  assert.match(siteJs, /statusOrder = \{ current: 0, coming: 1, completed: 2 \}/);
  assert.match(siteJs, /project\.thumbnailType === "banner" \|\| !project\.thumbnailUrl/);
  assert.match(siteJs, /class="donate-project-banner" aria-hidden="true"/);
  assert.match(siteJs, /loading="lazy" decoding="async"/);
  assert.match(siteJs, /aria-label="View \$\{title\}, \$\{status\}"/);
  assert.match(siteJs, /donate-project-set donate-project-set-duplicate" aria-hidden="true"/);
  assert.match(siteJs, /isDuplicate\s*\? ' tabindex="-1"'/);
  assert.match(siteJs, /renderDonateProjectFlow\(\)/);
  assert.equal(projects.filter((project) => project.status === "Completed").length, 6);
  assert.equal(projects.filter((project) => project.status === "Ongoing").length, 0);
  assert.equal(projects.filter((project) => project.status === "Coming Soon").length, 2);
  assert.ok(projects.some((project) => project.thumbnailType === "banner"));
  assert.ok(projects.some((project) => project.thumbnailUrl));

  assert.match(siteCss, /\.donate-project-showcase/);
  assert.match(siteCss, /\.donate-project-flow/);
  assert.match(siteCss, /\.donate-project-set\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(siteCss, /animation: donate-project-current 44s linear infinite/);
  assert.match(siteCss, /\.donate-project-flow:hover \.donate-project-track,\s*\.donate-project-flow:focus-within \.donate-project-track\s*\{[\s\S]*?animation-play-state: paused/);
  assert.match(siteCss, /@keyframes donate-project-current\s*\{[\s\S]*?translate3d\(0, -50%, 0\)/);
  assert.match(siteCss, /\.donate-project-card:focus-visible/);
  assert.match(siteCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.donate-project-track,[\s\S]*?animation: none/);
  assert.match(siteCss, /\.donate-project-set::after,\s*\.donate-project-set-duplicate\s*\{\s*display: none/);
  assert.match(siteCss, /\.donate-project-track\s*\{\s*width: max-content;\s*display: block;\s*transform: none;\s*will-change: auto/);
  assert.match(siteCss, /@media \(max-width: 980px\)[\s\S]*?\.donate-hero-grid\s*\{\s*grid-template-columns: 1fr/);
  assert.match(siteCss, /@media \(max-width: 720px\)[\s\S]*?\.donate-project-flow\s*\{\s*height: 310px/);
});

test(".com host redirects to .org", async () => {
  const middleware = await importFunctionModule("functions/_middleware.js");
  const response = await middleware.onRequest({
    request: new Request("https://one-world-relief.com/donate?amount=25"),
    next: async () => new Response("next"),
  });

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://one-world-relief.org/donate?amount=25");
});

test("pages include the supplied One World Relief logo and install icons", async () => {
  const rootPageNames = ["index.html", "about.html", "contact.html", "donate.html", "projects.html", "share.html"];
  const projectPageNames = Array.from({ length: 8 }, (_, index) => `projects/case-${String(index + 1).padStart(3, "0")}.html`);
  const [rootPages, projectPages, offlineHtml, faviconPng, brandIcon, brandIconSmall, appleTouchIcon, webManifest, serviceWorker] = await Promise.all([
    Promise.all(rootPageNames.map((name) => readFile(name, "utf8"))),
    Promise.all(projectPageNames.map((name) => readFile(name, "utf8"))),
    readFile("offline.html", "utf8"),
    readFile("favicon.png"),
    readFile("assets/one-world-relief-icon.png"),
    readFile("assets/one-world-relief-icon-192.png"),
    readFile("apple-touch-icon.png"),
    readFile("site.webmanifest", "utf8"),
    readFile("sw.js", "utf8"),
  ]);

  for (const page of rootPages) {
    assert.match(page, /<link rel="icon" href="favicon\.png" type="image\/png" \/>/);
    assert.match(page, /<link rel="apple-touch-icon" href="apple-touch-icon\.png" \/>/);
    assert.match(page, /<link rel="manifest" href="site\.webmanifest" \/>/);
    assert.match(page, /<img src="assets\/one-world-relief-icon-192\.png" alt="" \/>/);
  }
  for (const page of projectPages) {
    assert.match(page, /<link rel="icon" href="\.\.\/favicon\.png" type="image\/png" \/>/);
    assert.match(page, /<link rel="apple-touch-icon" href="\.\.\/apple-touch-icon\.png" \/>/);
    assert.match(page, /<link rel="manifest" href="\.\.\/site\.webmanifest" \/>/);
    assert.match(page, /<img src="\.\.\/assets\/one-world-relief-icon-192\.png" alt="" \/>/);
  }
  assert.match(offlineHtml, /<link rel="icon" href="favicon\.png" type="image\/png" \/>/);
  for (const [label, image] of [["favicon", faviconPng], ["brand icon", brandIcon], ["small brand icon", brandIconSmall], ["Apple touch icon", appleTouchIcon]]) {
    assert.deepEqual([...image.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${label} should be a PNG`);
  }
  assert.deepEqual([faviconPng.readUInt32BE(16), faviconPng.readUInt32BE(20)], [64, 64]);
  assert.deepEqual([brandIcon.readUInt32BE(16), brandIcon.readUInt32BE(20)], [512, 512]);
  assert.deepEqual([brandIconSmall.readUInt32BE(16), brandIconSmall.readUInt32BE(20)], [192, 192]);
  assert.deepEqual([appleTouchIcon.readUInt32BE(16), appleTouchIcon.readUInt32BE(20)], [180, 180]);
  assert.match(webManifest, /"name": "One World Relief"/);
  assert.match(webManifest, /one-world-relief-icon-192\.png/);
  assert.match(webManifest, /one-world-relief-icon\.png/);
  assert.match(serviceWorker, /owr-offline-v5/);
  assert.match(serviceWorker, /one-world-relief-icon\.png/);
});

test("checkout preserves a selected project destination in Stripe metadata and product details", async () => {
  const checkout = await importFunctionModule("functions/charity/donations/checkout.js");
  const originalFetch = globalThis.fetch;
  const campaign = "Madrasa Water";
  let stripeBody = "";

  globalThis.fetch = async (_url, options) => {
    stripeBody = String(options.body);
    return new Response(JSON.stringify({ url: "https://checkout.stripe.test/project-destination" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await checkout.onRequestPost({
      request: new Request("https://pages.example/charity/donations/checkout", {
        method: "POST",
        body: JSON.stringify({
          donor_name: "Project Donor",
          donor_email: "project@example.com",
          amount_usd: 20,
          payment_method: "stripe",
          campaign,
          giving_frequency: "one_time",
        }),
      }),
      env: { OWR_STRIPE_SECRET_KEY: "sk_test_mock" },
    });
    const payload = await response.json();
    const form = new URLSearchParams(stripeBody);

    assert.equal(response.status, 200);
    assert.equal(payload.redirect_url, "https://checkout.stripe.test/project-destination");
    assert.equal(form.get("metadata[campaign]"), campaign);
    assert.equal(form.get("payment_intent_data[metadata][campaign]"), campaign);
    assert.equal(form.get("line_items[0][price_data][product_data][name]"), `One World Relief - ${campaign}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("offline fallback shows branded connection page after first visit", async () => {
  const [offlineHtml, siteJs, serviceWorker, siteCss] = await Promise.all([
    readFile("offline.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("sw.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
  ]);

  assert.match(offlineHtml, /One World Relief is still here\./);
  assert.match(offlineHtml, /offline-dino-scene/);
  assert.match(offlineHtml, /Try Again/);
  assert.match(siteJs, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(serviceWorker, /owr-offline-v5/);
  assert.match(serviceWorker, /caches\.match\("\/offline\.html"\)/);
  assert.match(siteCss, /\.offline-dino/);
  assert.match(siteCss, /@keyframes offline-dino-hop/);
});

test("homepage checkout keeps accessible amount, frequency, and allowlisted project destination behavior", async () => {
  const [homeHtml, donateHtml, siteJs, siteCss, projectDataSource] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("donate.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
    readFile("project-data.js", "utf8"),
  ]);
  const quickFormMatch = homeHtml.match(/<form class="quick-donation" id="quickDonationForm"[\s\S]*?<\/form>/);
  assert.ok(quickFormMatch, "homepage should contain the quick donation form");
  const quickForm = quickFormMatch[0];

  const presetAmounts = [...quickForm.matchAll(/name="quickAmount" value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(presetAmounts, ["10", "25", "50", "100"]);
  assert.equal([...quickForm.matchAll(/name="quickAmount"[^>]*checked/g)].length, 1);
  assert.match(quickForm, /name="quickAmount" value="25" checked/);
  assert.doesNotMatch(quickForm, /name="quickAmount" value="custom"|quickCustomPanel|Custom Amount/);

  assert.match(quickForm, /<label class="quick-custom-amount" for="quickCustomAmount">/);
  assert.match(quickForm, /<span class="sr-only">Enter another donation amount<\/span>/);
  assert.match(quickForm, /id="quickCustomAmount" name="quickCustomAmount" type="number" min="1" step="1" inputmode="numeric"/);
  assert.match(quickForm, /placeholder="Enter other amount" aria-describedby="quickAmountHint"/);
  assert.match(quickForm, /id="quickAmountHint">Entering an amount replaces the selected preset\.<\/small>/);
  assert.doesNotMatch(quickForm, /quick-custom[^>]*hidden|id="quickCustomAmount"[^>]*hidden/);

  const frequencyValues = [...quickForm.matchAll(/name="quickFrequency" value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(frequencyValues, ["one_time", "monthly"]);
  assert.match(quickForm, /<fieldset class="quick-frequency">[\s\S]*?<legend>Frequency<\/legend>/);
  assert.equal([...quickForm.matchAll(/name="quickFrequency"[^>]*checked/g)].length, 1);
  assert.match(quickForm, /name="quickFrequency" value="one_time" checked/);
  assert.match(quickForm, /name="quickFrequency" value="monthly"/);

  const quickCampaignMatch = quickForm.match(/<select id="quickCampaign" name="quickCampaign">([\s\S]*?)<\/select>/);
  assert.ok(quickCampaignMatch, "homepage should contain a labeled destination selector");
  assert.equal([...quickCampaignMatch[1].matchAll(/<option\b/g)].length, 1, "project options should come from shared data");
  assert.match(quickCampaignMatch[1], /<option value="General Fund">Where it's needed most<\/option>/);
  assert.match(donateHtml, /<select id="campaignSelect" required>[\s\S]*?<option value="General Fund">Where it's needed most<\/option>/);
  for (const html of [homeHtml, donateHtml]) {
    assert.match(html, /<script src="project-data\.js"><\/script>\s*<script src="one-world-relief\.js"><\/script>/);
  }

  assert.match(quickForm, /class="[^"]*\bquick-donation-button\b[^"]*"[^>]*>[\s\S]*?<span>Start Donation<\/span><span aria-hidden="true">&rarr;<\/span>/);
  assert.match(quickForm, /class="quick-donation-trust"[\s\S]*?<svg aria-hidden="true"[^>]*focusable="false"[\s\S]*?Secure checkout[\s\S]*?Receipt provided/);
  assert.match(quickForm, /id="quickDonationStatus" role="status" aria-live="polite"/);
  assert.doesNotMatch(homeHtml, /Receipt emailed|quick-donation-topline/);

  assert.match(siteJs, /const activateCustomAmount = \(\) =>/);
  assert.match(siteJs, /if \(!quickCustomInput\?\.value\) \{\s*return;/);
  assert.match(siteJs, /presetAmountRadios\.forEach\(\(radio\) => \{\s*radio\.checked = false;/);
  assert.doesNotMatch(siteJs, /quickCustomInput\.addEventListener\("focus", activateCustomAmount\)/);
  assert.match(siteJs, /quickCustomInput\.addEventListener\("input", activateCustomAmount\)/);
  assert.match(siteJs, /radio\.checked && quickCustomInput[\s\S]*?quickCustomInput\.value = ""/);
  assert.match(siteJs, /quickCustomInput\?\.setAttribute\("aria-invalid", "true"\)/);
  assert.match(siteJs, /input\[name="quickFrequency"\]:checked/);
  assert.match(siteJs, /const buildQuickDonationUrl = \(\{ amount, campaign = "General Fund", frequency = "one_time" \}\) =>/);
  assert.match(siteJs, /const params = new URLSearchParams\(\{[\s\S]*?amount: String\(amount\),[\s\S]*?campaign: String\(campaign \|\| "General Fund"\),[\s\S]*?frequency: String\(frequency \|\| "one_time"\),[\s\S]*?\}\)/);
  assert.match(siteJs, /window\.location\.href = buildQuickDonationUrl\(\{ amount, campaign, frequency \}\)/);
  assert.match(siteJs, /params\.get\("frequency"\) \|\| params\.get\("giving_frequency"\)/);
  assert.match(siteJs, /populateDonationDestinations\(quickCampaignSelect\)/);
  assert.match(siteJs, /populateDonationDestinations\(campaignSelect\)/);
  assert.match(siteJs, /project\.acceptsDonations !== true/);
  assert.match(siteJs, /option\.textContent = String\(project\.donationLabel/);
  assert.ok(
    siteJs.indexOf("populateDonationDestinations(campaignSelect)") < siteJs.indexOf("applyDonationParams();"),
    "donate page destinations must exist before campaign query hydration",
  );

  const projectContext = { window: {} };
  runInNewContext(projectDataSource, projectContext);
  const projects = JSON.parse(JSON.stringify(projectContext.window.ONE_WORLD_RELIEF_PROJECTS));
  assert.equal(projects.length, 8);
  assert.ok(projects.every((project) => typeof project.acceptsDonations === "boolean"));
  assert.ok(projects.every((project) => typeof project.donationLabel === "string" && project.donationLabel));
  assert.deepEqual(
    projects.filter((project) => project.acceptsDonations).map((project) => project.date),
    ["Case 001", "Case 002", "Case 003", "Case 004", "Case 005", "Case 007", "Case 008"],
  );
  assert.deepEqual(
    projects.filter((project) => !project.acceptsDonations).map((project) => project.date),
    ["Case 006"],
  );

  const createElement = (tagName) => ({
    tagName: String(tagName).toUpperCase(),
    dataset: {},
    children: [],
    parentNode: null,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    remove() {
      if (!this.parentNode) {
        return;
      }
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) {
        this.parentNode.children.splice(index, 1);
      }
      this.parentNode = null;
    },
  });
  const createSelect = () => {
    const select = createElement("select");
    select.querySelectorAll = (selector) => {
      assert.equal(selector, "[data-project-destination-group]");
      return select.children.filter((child) => child.dataset.projectDestinationGroup);
    };
    return select;
  };
  const helperStart = siteJs.indexOf("  const getProjectDonationValue =");
  const helperEnd = siteJs.indexOf("  const setupReveals =", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, "destination helpers should remain available");
  const helperContext = {
    window: { ONE_WORLD_RELIEF_PROJECTS: projects },
    document: { createElement },
    URLSearchParams,
  };
  runInNewContext(
    `${siteJs.slice(helperStart, helperEnd)}\n` +
      "globalThis.__populateDonationDestinations = populateDonationDestinations;\n" +
      "globalThis.__buildQuickDonationUrl = buildQuickDonationUrl;",
    helperContext,
  );
  const homeSelect = createSelect();
  const donateSelect = createSelect();
  helperContext.__populateDonationDestinations(homeSelect);
  helperContext.__populateDonationDestinations(homeSelect);
  helperContext.__populateDonationDestinations(donateSelect);
  const summarizeDestinations = (select) => select.children.map((group) => ({
    label: String(group.label),
    options: group.children.map((option) => ({
      value: String(option.value),
      label: String(option.textContent),
    })),
  }));
  const expectedDestinations = [
    {
      label: "Support areas",
      options: [
        { value: "Hafiz Student Support", label: "Hafiz Student Support" },
        { value: "Father's Business Support", label: "Father's Business Support" },
        { value: "Orphan Education", label: "Orphan Education" },
        { value: "Feeding Madrasa for Orphan Kids", label: "Feeding Madrasa for Orphan Kids" },
        { value: "Flood Relief", label: "Flood Relief" },
      ],
    },
    {
      label: "Upcoming goals",
      options: [
        { value: "Madrasa Water", label: "Madrasa Water" },
        { value: "Mosque Tiles", label: "Mosque Tiles" },
      ],
    },
  ];
  assert.deepEqual(summarizeDestinations(homeSelect), expectedDestinations);
  assert.deepEqual(summarizeDestinations(donateSelect), expectedDestinations);
  const renderedDestinationValues = expectedDestinations.flatMap((group) => group.options.map((option) => option.value));
  assert.equal(renderedDestinationValues.includes("Mosque Gate"), false);

  for (const amount of [10, 25, 50, 100, 73]) {
    for (const frequency of ["one_time", "monthly"]) {
      const campaign = amount === 73 ? "Madrasa Water" : "Where & help / now";
      const quickUrl = helperContext.__buildQuickDonationUrl({ amount, campaign, frequency });
      const parsed = new URL(quickUrl, "https://one-world-relief.org/");
      assert.equal(parsed.pathname, "/donate.html");
      assert.equal(parsed.hash, "#donationForm");
      assert.equal(parsed.searchParams.get("amount"), String(amount));
      assert.equal(parsed.searchParams.get("campaign"), campaign);
      assert.equal(parsed.searchParams.get("frequency"), frequency);
      assert.match(quickUrl, /campaign=(?:Where\+%26\+help\+%2F\+now|Madrasa\+Water)/);
    }
  }

  assert.match(siteCss, /\.quick-amounts input:focus-visible \+ span,\s*\.quick-frequency input:focus-visible \+ span/);
  assert.match(siteCss, /\.quick-custom-input-wrap:focus-within/);
  assert.match(siteCss, /\.quick-category select:focus-visible/);
  assert.ok((siteCss.match(/outline: 3px solid var\(--blue-700\);/g) || []).length >= 4);
  assert.match(siteCss, /\.quick-amounts input:checked \+ span/);
  assert.match(siteCss, /\.quick-frequency input:checked \+ span/);
  assert.match(siteCss, /\.quick-donation-button:active/);
  assert.match(siteCss, /\.quick-donation-button:focus-visible/);
  assert.doesNotMatch(siteCss, /\.quick-donation-status:empty/);
  assert.doesNotMatch(siteCss, /@keyframes quick-card-(?:sheen|lift)/);
  const quickCardRule = siteCss.slice(siteCss.indexOf(".quick-donation {"), siteCss.indexOf(".quick-donation::before"));
  assert.doesNotMatch(quickCardRule, /animation\s*:|will-change\s*:/);
});

test("home page renders a continuous completed-case photo flow from project data", async () => {
  const [homeHtml, siteJs, siteCss, projectData] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
    readFile("project-data.js", "utf8"),
  ]);

  assert.doesNotMatch(homeHtml, /See the work as it moves/);
  assert.doesNotMatch(homeHtml, /Project Flow/);
  assert.doesNotMatch(homeHtml, /From donation to proof/);
  assert.match(homeHtml, /Completed One World Relief cases/);
  assert.match(homeHtml, /faith-video-section/);
  assert.match(homeHtml, /faith-video-bg/);
  assert.match(homeHtml, /Why We Give/);
  assert.match(
    homeHtml,
    /<blockquote class="hero-giving-quote" cite="https:\/\/sunnah\.com\/bukhari:6005">\s*<p>I and the person who looks after an orphan and provides for him, will be in Paradise like this\.<\/p>\s*<footer class="hero-quote-source">\s*Prophet Muhammad <span aria-label="peace and blessings be upon him">ﷺ<\/span>\s*<span aria-hidden="true">&middot;<\/span>\s*<cite><a href="https:\/\/sunnah\.com\/bukhari:6005" target="_blank" rel="noreferrer">Sahih al-Bukhari 6005<\/a><\/cite>\s*<\/footer>\s*<\/blockquote>/u,
  );
  assert.doesNotMatch(homeHtml, /Direct aid, moving fast\./);
  assert.doesNotMatch(
    homeHtml,
    /Choose an amount, pick where it should go, and follow real project updates as support reaches people\./,
  );
  assert.match(homeHtml, /Quran 2:215/);
  assert.match(homeHtml, /Sahih al-Bukhari 6005/);
  assert.match(homeHtml, /Quran 76:8/);
  assert.match(homeHtml, /Sunan Abi Dawud 1681/);
  assert.match(homeHtml, /id="homeCaseFlowTrack"/);
  assert.match(homeHtml, /<script src="project-data\.js"><\/script>/);
  assert.match(homeHtml, /id="quickDonationForm"/);
  assert.match(homeHtml, /quick-donation-heading/);
  assert.match(homeHtml, /quick-frequency-control/);
  assert.match(homeHtml, /Secure checkout/);
  assert.match(homeHtml, /Receipt provided/);
  assert.match(homeHtml, /Worked On/);
  assert.match(homeHtml, /Goals/);
  assert.match(homeHtml, /home-case-panel-section/);
  assert.match(homeHtml, /id="homeCompletedCases"/);
  assert.match(homeHtml, /id="homeGoalCases"/);
  assert.match(homeHtml, /<form class="quick-donation" id="quickDonationForm"[\s\S]*<\/form>\s*<\/div>\s*<\/div>\s*<\/section>\s*<section class="container home-case-panel-section/);
  assert.match(siteJs, /homeCaseFlowTrack/);
  assert.match(siteJs, /renderHomeCaseFlow/);
  assert.match(siteJs, /renderHomeCaseLanes/);
  assert.match(siteJs, /homeCompletedCases/);
  assert.match(siteJs, /homeGoalCases/);
  assert.match(siteJs, /includes\("completed"\)/);
  assert.match(siteJs, /!String\(project\.status \|\| ""\)\.toLowerCase\(\)\.includes\("completed"\)/);
  assert.match(siteJs, /Array\.from\(\{ length: 4 \}, \(\) => projects\)\.flat\(\)/);
  assert.match(siteJs, /aria-hidden="true" tabindex="-1"/);
  assert.match(siteJs, /decoding="async"/);
  assert.match(siteJs, /activateCustomAmount/);
  assert.match(siteJs, /populateDonationDestinations/);
  assert.match(siteJs, /cancelAnimationFrame\(pointerFrame\)/);
  assert.match(siteJs, /case-flow-card/);
  assert.match(siteCss, /\.home-case-flow/);
  assert.match(siteCss, /\.home-case-lanes/);
  assert.match(siteCss, /\.home-case-panel-section/);
  assert.match(siteCss, /grid-template-columns: minmax\(0, 0\.95fr\) minmax\(380px, 460px\)/);
  assert.match(siteCss, /\.quick-donation-heading/);
  assert.match(siteCss, /\.quick-frequency-control/);
  assert.match(siteCss, /\.quick-donation-trust/);
  assert.match(siteCss, /\.hero-donate-first \.hero-quote-copy/);
  assert.match(siteCss, /\.hero-giving-quote/);
  assert.match(siteCss, /\.hero-quote-source a:focus-visible/);
  assert.match(siteCss, /content-visibility: auto/);
  assert.match(siteCss, /\.faith-video-section/);
  assert.match(siteCss, /\.faith-quote-track/);
  assert.match(siteCss, /@keyframes faith-quote-scroll/);
  assert.match(siteCss, /\.case-flow-track/);
  assert.match(siteCss, /@keyframes case-river/);
  assert.match(siteCss, /animation:\s*case-river var\(--case-flow-duration, 70s\) linear infinite/);
  assert.match(siteJs, /"--case-flow-duration"/);
  assert.match(siteJs, /`\$\{projects\.length \* secondsPerProject\}s`/);
  const secondsPerProject = Number(siteJs.match(/const secondsPerProject = (\d+);/)?.[1]);
  const totalCaseCount = [...projectData.matchAll(/date:\s*"Case \d{3}"/g)].length;
  const completedCaseCount = [...projectData.matchAll(/status:\s*"Completed"/g)].length;
  const comingSoonCaseCount = [...projectData.matchAll(/status:\s*"Coming Soon"/g)].length;
  const activeCaseCount = totalCaseCount - completedCaseCount - comingSoonCaseCount;
  assert.equal(secondsPerProject, 14);
  assert.equal(totalCaseCount, 8);
  assert.equal(completedCaseCount, 6);
  assert.equal(activeCaseCount, 0);
  assert.equal(comingSoonCaseCount, 2);
  assert.equal(completedCaseCount * secondsPerProject, 84);
  assert.match(siteCss, /will-change: transform/);
  assert.match(siteCss, /--case-flow-start-offset: clamp\(-3rem, -2\.5vw, -1\.25rem\)/);
  assert.match(siteCss, /padding: 0\.8rem clamp\(1rem, 4vw, 4rem\) 1\.4rem/);
  assert.doesNotMatch(siteCss, /\.case-flow-track\s*\{[\s\S]*?calc\(\(100vw - var\(--max-width\)\) \/ 2\)/);
  assert.match(siteCss, /translate3d\(var\(--case-flow-start-offset\), 0, 0\)/);
  assert.match(siteCss, /translate3d\(calc\(-50% - 0\.5rem \+ var\(--case-flow-start-offset\)\), 0, 0\)/);
  assert.match(siteCss, /@media \(max-width: 720px\)[\s\S]*?--case-flow-start-offset: -1\.5rem/);
  assert.doesNotMatch(siteCss, /@keyframes selected-amount-glow/);
  assert.doesNotMatch(siteCss, /@keyframes case-card-float/);
  assert.doesNotMatch(siteCss, /@keyframes case-photo-drift/);
  assert.doesNotMatch(siteCss, /@keyframes case-light-sweep/);
  assert.doesNotMatch(siteCss, /animation: selected-amount-glow/);
  assert.doesNotMatch(siteCss, /case-flow-shell:hover \.case-flow-track/);
  assert.doesNotMatch(siteCss, /@keyframes case-shine/);
  assert.doesNotMatch(siteJs, /case-flow-shine/);
  assert.doesNotMatch(siteJs, /case-flow-card, \\.contact-message-card/);
});

test("contact page has a polished accessible mailto contact flow", async () => {
  const [contactHtml, siteJs, siteCss] = await Promise.all([
    readFile("contact.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
  ]);

  assert.match(contactHtml, /contact-flow-section/);
  assert.match(contactHtml, /contact-method-card/);
  assert.match(contactHtml, /contact-message-card/);
  assert.match(contactHtml, /Questions about donations, receipts, projects, or partnerships/);
  assert.match(contactHtml, /Reach One World Relief/);
  assert.match(contactHtml, /Send us a message/);
  assert.match(contactHtml, /href="mailto:Oneworldrelief\.fma@gmail\.com" class="contact-method-card contact-method-card-link"/);
  assert.match(contactHtml, /href="tel:\+18568707528" class="contact-method-card contact-method-card-link"/);
  assert.match(contactHtml, /contact-method-card contact-method-card-static/);
  assert.equal([...contactHtml.matchAll(/class="contact-method-icon"/g)].length, 3);
  assert.match(contactHtml, /<form class="contact-form" id="contactForm" novalidate>/);
  assert.match(contactHtml, /id="nameField" name="name" type="text"[^>]*autocomplete="name" required[^>]*aria-describedby="nameFieldError"/);
  assert.match(contactHtml, /id="emailField" name="email" type="email" placeholder="you@example\.com" autocomplete="email" required[^>]*aria-describedby="emailFieldError"/);
  assert.match(contactHtml, /id="messageField" name="message"[^>]*maxlength="2000"[^>]*required[^>]*aria-describedby="messageFieldError"/);
  assert.equal([...contactHtml.matchAll(/class="contact-field-error"[^>]*aria-live="polite"/g)].length, 3);
  assert.match(contactHtml, /id="contactSubmit"[^>]*>\s*<span data-contact-submit-label>Send Message<\/span>/);
  assert.match(contactHtml, /Your message goes directly to One World Relief\./);
  assert.match(contactHtml, /id="contactFormStatus" role="status" aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(contactHtml, /Send us a note|Send Email/);
  assert.doesNotMatch(contactHtml, /Send a note and we will follow up/);
  assert.doesNotMatch(contactHtml, /We are here to help/);

  assert.match(siteCss, /\.contact-flow-section/);
  assert.match(siteCss, /\.contact-intro/);
  assert.match(siteCss, /\.contact-submit/);
  assert.match(siteCss, /\.contact-method-card-link:focus-visible/);
  assert.match(siteCss, /\.contact-message-card/);
  assert.match(siteCss, /min-height: min\(760px, calc\(100svh - 74px\)\)/);
  assert.match(siteCss, /grid-template-columns: minmax\(0, 0\.82fr\) minmax\(420px, 1fr\)/);
  assert.match(siteCss, /contact-methods h1[\s\S]*font-family: "Manrope"/);
  assert.match(siteCss, /contact-message-card h2[\s\S]*font-family: "Manrope"/);
  assert.match(siteCss, /\.contact-form input:focus-visible,[\s\S]*\.contact-form textarea:focus-visible/);
  assert.match(siteCss, /\.contact-form input\[aria-invalid="true"\]/);
  assert.match(siteCss, /\.contact-submit \{[\s\S]*?width: 100%/);
  assert.match(siteCss, /\.contact-submit:focus-visible/);
  assert.match(siteCss, /@media \(max-width: 720px\)[\s\S]*?\.contact-flow-grid \{[\s\S]*?gap: 2rem/);
  const messageDecorationRule = siteCss.slice(
    siteCss.indexOf(".contact-message-card::before"),
    siteCss.indexOf(".contact-method-icon"),
  );
  assert.doesNotMatch(messageDecorationRule, /animation\s*:/);

  assert.doesNotMatch(siteJs, /contact-message-card/);
  assert.match(siteJs, /const buildContactMailtoUrl =/);
  assert.match(siteJs, /field\.validity\.typeMismatch/);
  assert.match(siteJs, /field\.toggleAttribute\("aria-invalid", Boolean\(error\)\)/);
  assert.match(siteJs, /contactForm\.dataset\.submitting = "true"/);
  assert.match(siteJs, /contactSubmit\.disabled = true/);
  assert.match(siteJs, /contactSubmitLabel\.textContent = "Opening email\\u2026"/);
  assert.match(siteJs, /window\.location\.href = mailtoUrl/);
  assert.match(siteJs, /Your email app is ready\. Send the drafted message to finish\./);
  assert.match(siteJs, /We couldn't open your email app/);
  assert.match(siteJs, /rootMargin: "0px 0px 22% 0px"/);

  const helperStart = siteJs.indexOf("  const CONTACT_EMAIL =");
  const helperEnd = siteJs.indexOf("\n\n  if (contactForm)", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, "contact mailto helper should remain available");
  const helperContext = {};
  runInNewContext(
    `${siteJs.slice(helperStart, helperEnd)}\n` +
      "globalThis.__buildContactMailtoUrl = buildContactMailtoUrl;",
    helperContext,
  );
  const contactMailto = helperContext.__buildContactMailtoUrl({
    name: "Test Donor",
    email: "donor@example.com",
    message: "I have a receipt question.",
  });
  const mailtoUrl = new URL(contactMailto);
  const mailtoParams = new URLSearchParams(mailtoUrl.search);
  assert.equal(mailtoUrl.protocol, "mailto:");
  assert.equal(mailtoUrl.pathname, "Oneworldrelief.fma@gmail.com");
  assert.equal(mailtoParams.get("subject"), "One World Relief question");
  assert.equal(mailtoParams.get("body"), "Name: Test Donor\nEmail: donor@example.com\n\nI have a receipt question.");
});

test("about page shows nonprofit status and EIN without a public home address", async () => {
  const [aboutHtml, siteCss] = await Promise.all([
    readFile("about.html", "utf8"),
    readFile("one-world-relief.css", "utf8"),
  ]);

  assert.match(aboutHtml, /Organization Details/);
  assert.match(aboutHtml, /official-panel/);
  assert.match(aboutHtml, /official-details/);
  assert.match(aboutHtml, /501\(c\)\(3\) nonprofit organization/);
  assert.match(aboutHtml, /EIN/);
  assert.match(aboutHtml, /41-5079927/);
  assert.match(aboutHtml, /tax-deductible to the extent allowed by law/);
  assert.match(aboutHtml, /Available upon request/);
  assert.doesNotMatch(aboutHtml, /Owned by Fahadbin Alam/);
  assert.doesNotMatch(aboutHtml, /Middle Patenga/);
  assert.match(siteCss, /\.official-panel/);
  assert.match(siteCss, /\.official-details/);
});

test("project cards publish approved cases with embedded local media", async () => {
  const [
    projectData,
    siteJs,
    siteCss,
    casePage,
    caseTwoPage,
    caseThreePage,
    caseFourPage,
    caseFivePage,
    caseSixPage,
    caseSevenPage,
    caseEightPage,
  ] = await Promise.all([
    readFile("project-data.js", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
    readFile("projects/case-001.html", "utf8"),
    readFile("projects/case-002.html", "utf8"),
    readFile("projects/case-003.html", "utf8"),
    readFile("projects/case-004.html", "utf8"),
    readFile("projects/case-005.html", "utf8"),
    readFile("projects/case-006.html", "utf8"),
    readFile("projects/case-007.html", "utf8"),
    readFile("projects/case-008.html", "utf8"),
  ]);

  assert.doesNotMatch(projectData, /drive\.google\.com/);
  assert.doesNotMatch(projectData, /youtube\.com/);
  assert.match(projectData, /projects\/case-001\.html/);
  assert.match(projectData, /projects\/case-002\.html/);
  assert.match(projectData, /projects\/case-003\.html/);
  assert.match(projectData, /projects\/case-004\.html/);
  assert.match(projectData, /projects\/case-005\.html/);
  assert.match(projectData, /projects\/case-006\.html/);
  assert.match(projectData, /projects\/case-007\.html/);
  assert.match(projectData, /projects\/case-008\.html/);
  assert.doesNotMatch(projectData, /Village Qurbani Meal Support/);
  assert.doesNotMatch(projectData, /Two-Year Orphan Education Support/);
  assert.doesNotMatch(projectData, /Food Stand for a Father/);
  assert.doesNotMatch(projectData, /title: "Case 001:/);
  assert.doesNotMatch(projectData, /title: "Case 002:/);
  assert.doesNotMatch(projectData, /title: "Case 003:/);
  assert.doesNotMatch(projectData, /title: "Case 004:/);
  assert.doesNotMatch(projectData, /title:\s*"Case \d{3}\b/i);
  assert.match(projectData, /Keeping a Hafiz Student in School/);
  assert.match(projectData, /A Fresh Start for a Father's Business/);
  assert.match(projectData, /Keeping an Orphan Boy in School/);
  assert.match(projectData, /Feeding Madrasa for Orphan Kids/);
  assert.match(projectData, /Food Relief for Flood-Affected Families/);
  assert.match(projectData, /A Secure Gate for a Community Mosque/);
  assert.match(projectData, /Water for a Madrasa Mosque/);
  assert.match(projectData, /Tiles to Help Finish a Mosque/);
  assert.match(projectData, /orphan-support-001-thumbnail\.jpg/);
  assert.match(projectData, /livelihood-support-002-thumbnail\.jpg/);
  assert.match(projectData, /orphan-education-003-thumbnail\.jpg/);
  assert.match(projectData, /flood-relief-005-thumbnail\.jpg/);
  assert.match(projectData, /mosque-gate-006-thumbnail\.jpg/);
  assert.match(projectData, /thumbnailType: "banner"/);
  assert.doesNotMatch(projectData, /orphan-education-003-placeholder\.svg/);
  assert.doesNotMatch(projectData, /korbani-village-004-placeholder\.svg/);
  assert.match(siteJs, /project-\$\{caseId\}/);
  assert.match(siteCss, /\.project-card\.project-case-003 \.project-media img/);
  assert.match(siteCss, /object-position: center 70%/);
  assert.match(siteJs, /project-media-banner/);
  assert.match(siteCss, /\.current-case-banner/);

  assert.match(casePage, /Keeping a Hafiz student in school/);
  assert.match(casePage, /Case ID/);
  assert.match(casePage, /Case 001/);
  assert.match(casePage, /orphan-support-001-video-1\.mp4/);
  assert.match(casePage, /orphan-support-001-video-2\.mp4/);
  assert.match(casePage, /orphan-support-001-primary\.mp4/);
  assert.match(casePage, /orphan-support-001-main\.jpg/);
  assert.match(casePage, /orphan-support-001-proof\.jpg/);
  assert.match(casePage, /project-timeline/);
  assert.match(casePage, /id="case-timeline"/);
  assert.match(casePage, /timeline-step-active/);
  assert.match(siteCss, /\.project-timeline::after/);
  assert.match(siteCss, /timeline-runner-horizontal/);
  assert.match(siteCss, /timeline-runner-vertical/);
  assert.match(siteCss, /timeline-ring-breathe/);
  assert.match(siteJs, /hashReveal/);

  assert.match(caseTwoPage, /A fresh start for a father's business/);
  assert.match(caseTwoPage, /Case ID/);
  assert.match(caseTwoPage, /Case 002/);
  assert.match(caseTwoPage, /livelihood-support-002-primary\.mp4/);
  assert.match(caseTwoPage, /livelihood-support-002-main\.jpg/);
  assert.match(caseTwoPage, /livelihood-support-002-proof\.jpg/);
  assert.match(caseTwoPage, /livelihood-support-002-thumbnail\.jpg/);
  assert.match(caseTwoPage, /Personal identity documents and home address details are kept off the public website/);
  assert.doesNotMatch(caseTwoPage, /NID No/);
  assert.doesNotMatch(caseTwoPage, /Middle Patenga/);
  assert.match(caseTwoPage, /project-timeline/);
  assert.match(caseTwoPage, /timeline-step-active/);

  assert.match(caseThreePage, /Keeping an orphan boy in school/);
  assert.match(caseThreePage, /Case 003/);
  assert.match(caseThreePage, /Amount delivered/);
  assert.match(caseThreePage, /\$400/);
  assert.match(caseThreePage, /Completed/);
  assert.match(caseThreePage, /orphan-education-003-primary\.mp4/);
  assert.match(caseThreePage, /orphan-education-003-video-2\.mp4/);
  assert.match(caseThreePage, /orphan-education-003-main\.jpg/);
  assert.match(caseThreePage, /orphan-education-003-proof\.jpg/);
  assert.match(caseThreePage, /Private identity and birth-registration documents are kept on file/);
  assert.doesNotMatch(caseThreePage, /orphan-education-003-placeholder\.svg/);
  assert.doesNotMatch(caseThreePage, /Birth Registration Number/);
  assert.doesNotMatch(caseThreePage, /20171591629107850/);
  assert.match(caseThreePage, /project-timeline/);
  assert.match(caseThreePage, /timeline-step-maintenance/);

  const caseFourData = projectData.split(/\r?\n  \},\r?\n  \{/).find((entry) => /date: "Case 004"/.test(entry));
  assert.ok(caseFourData);
  assert.match(caseFourData, /title: "Feeding Madrasa for Orphan Kids"/);
  assert.match(caseFourData, /donationLabel: "Feeding Madrasa for Orphan Kids"/);
  assert.match(caseFourData, /status: "Completed"/);
  assert.match(caseFourData, /amountRaised: "\$400"/);
  assert.doesNotMatch(caseFourData, /Amount not published/);
  assert.match(caseFourData, /thumbnailUrl: "assets\/projects\/case-004\/korbani-meals-004-thumbnail\.jpg"/);
  assert.match(caseFourData, /June 24, 2026/);
  assert.match(caseFourPage, /<title>One World Relief \| Feeding Madrasa for Orphan Kids<\/title>/);
  assert.match(caseFourPage, /<h1>Feeding Madrasa for Orphan Kids<\/h1>/);
  assert.match(caseFourPage, /Case 004/);
  assert.match(caseFourPage, /<strong>Completed<\/strong>/);
  assert.match(caseFourPage, /<span>Project cost<\/span><strong>\$400<\/strong>/);
  assert.doesNotMatch(caseFourPage, /Amount not published|<strong>Not published<\/strong>/);
  assert.match(caseFourPage, /June 24, 2026/);
  assert.match(caseFourPage, /korbani-meals-004-primary\.mp4/);
  assert.match(caseFourPage, /korbani-meals-004-thumbnail\.jpg/);
  assert.match(caseFourPage, /korbani-meals-004-main\.jpg/);
  assert.match(caseFourPage, /korbani-meals-004-proof\.jpg/);
  assert.match(caseFourPage, /The confirmed project cost is \$400\. No meal count or beneficiary count was supplied/);
  assert.doesNotMatch(caseFourPage, /Korbani meals for a village|No public budget/);
  assert.doesNotMatch(caseFourPage, /Current Case|current-case-banner|Ongoing|Media coming soon/);
  assert.doesNotMatch(caseFourPage, /korbani-village-004-placeholder\.svg/);
  assert.match(caseFourPage, /project-timeline/);
  assert.match(caseFourPage, /<h3>Meal served<\/h3>/);

  const caseFiveData = projectData.split(/\r?\n  \},\r?\n  \{/).find((entry) => /date: "Case 005"/.test(entry));
  assert.ok(caseFiveData);
  assert.match(caseFiveData, /title: "Food Relief for Flood-Affected Families"/);
  assert.match(caseFiveData, /status: "Completed"/);
  assert.match(caseFiveData, /amountRaised: "\$450"/);
  assert.match(caseFiveData, /thumbnailUrl: "assets\/projects\/case-005\/flood-relief-005-thumbnail\.jpg"/);
  assert.match(caseFiveData, /mediaUrl: "projects\/case-005\.html"/);

  const caseFiveMedia = [
    "flood-relief-005-thumbnail.jpg",
    "flood-relief-005-main.jpg",
    "flood-relief-005-context.jpg",
    "flood-relief-005-supplies.jpg",
    "flood-relief-005-banner.jpg",
    "flood-relief-005-delivery.jpg",
    "flood-relief-005-primary.mp4",
    "flood-relief-005-video-2.mp4",
    "flood-relief-005-video-3.mp4",
    "flood-relief-005-children-community.jpg",
    "flood-relief-005-child-delivery.jpg",
  ];
  assert.match(caseFivePage, /<h1>Food Relief for Flood-Affected Families<\/h1>/);
  assert.match(caseFivePage, /<strong>Completed<\/strong>/);
  assert.match(caseFivePage, /<span>Project cost<\/span><strong>\$450<\/strong>/);
  assert.match(caseFivePage, /July 15-16, 2026/);
  assert.match(caseFivePage, /project-timeline/);
  assert.match(caseFivePage, /timeline-step-maintenance/);
  assert.match(caseFivePage, /<h3>Case completed<\/h3>/);
  assert.match(caseFivePage, /personal details beyond the approved field media are not published/);
  assert.match(caseFivePage, /unlisted personal and financial details remained private/);
  assert.doesNotMatch(caseFivePage, /NID No|Birth Registration Number|Middle Patenga/);
  assert.doesNotMatch(caseFivePage, /FahadBin Mihad Alam|children-flood-context/);
  for (const filename of caseFiveMedia) {
    assert.ok(caseFivePage.includes(filename), `Case 005 page should include ${filename}`);
  }

  const caseSixData = projectData.split(/\r?\n  \},\r?\n  \{/).find((entry) => /date: "Case 006"/.test(entry));
  assert.ok(caseSixData);
  assert.match(caseSixData, /title: "A Secure Gate for a Community Mosque"/);
  assert.match(caseSixData, /status: "Completed"/);
  assert.match(caseSixData, /amountRaised: "\$170"/);
  assert.match(caseSixData, /thumbnailUrl: "assets\/projects\/case-006\/mosque-gate-006-thumbnail\.jpg"/);
  assert.match(caseSixData, /mediaUrl: "projects\/case-006\.html"/);

  const caseSixMedia = [
    "mosque-gate-006-thumbnail.jpg",
    "mosque-gate-006-main.jpg",
    "mosque-gate-006-primary.mp4",
    "mosque-gate-006-video-2.mp4",
  ];
  assert.match(caseSixPage, /<h1>A Secure Gate for a Community Mosque<\/h1>/);
  assert.match(caseSixPage, /<strong>Completed<\/strong>/);
  assert.match(caseSixPage, /<span>Project cost<\/span><strong>\$170<\/strong>/);
  assert.match(caseSixPage, /July 27-31, 2026/);
  assert.match(caseSixPage, /project-timeline/);
  assert.match(caseSixPage, /timeline-step-maintenance/);
  assert.match(caseSixPage, /<h3>Case completed<\/h3>/);
  assert.match(caseSixPage, /unrelated personal details are not included on this page/);
  assert.match(caseSixPage, /without adding unlisted project or personal details/);
  assert.doesNotMatch(caseSixPage, /NID No|Birth Registration Number|Middle Patenga/);
  for (const filename of caseSixMedia) {
    assert.ok(caseSixPage.includes(filename), `Case 006 page should include ${filename}`);
  }

  const caseSevenData = projectData.split(/\r?\n  \},\r?\n  \{/).find((entry) => /date: "Case 007"/.test(entry));
  const caseEightData = projectData.split(/\r?\n  \},\r?\n  \{/).find((entry) => /date: "Case 008"/.test(entry));
  assert.ok(caseSevenData);
  assert.ok(caseEightData);
  for (const [entry, title, page] of [
    [caseSevenData, "Water for a Madrasa Mosque", caseSevenPage],
    [caseEightData, "Tiles to Help Finish a Mosque", caseEightPage],
  ]) {
    assert.ok(entry.includes(`title: "${title}"`));
    assert.match(entry, /status: "Coming Soon"/);
    assert.match(entry, /location: ""/);
    assert.match(entry, /amountRaised: "Budget coming soon"/);
    assert.match(entry, /thumbnailType: "banner"/);
    assert.match(entry, /thumbnailLabel: "Coming Soon"/);
    assert.match(entry, /campaign=General%20Fund/);
    assert.match(page, /Coming Soon/);
    assert.match(page, /To be announced/);
    assert.match(page, /timeline-step-pending/);
    assert.doesNotMatch(page, /Bangladesh|\$\d+|2026-\d{2}-\d{2}/);
  }
  assert.match(caseSevenPage, /Water for a madrasa mosque/);
  assert.match(caseEightPage, /Tiles to help finish a mosque/);
  assert.match(siteJs, /const comingSoon =/);
  assert.match(siteJs, /<span>\$\{comingSoon\} coming soon<\/span>/);
  assert.match(siteJs, /project\.thumbnailLabel \|\| "Current Case"/);
  assert.match(siteJs, /\[location, date\]\.filter\(Boolean\)\.join\(" &middot; "\)/);

  const jpegFiles = [...caseFiveMedia, ...caseSixMedia].filter((filename) => filename.endsWith(".jpg"));
  const mp4Files = [...caseFiveMedia, ...caseSixMedia].filter((filename) => filename.endsWith(".mp4"));
  for (const filename of jpegFiles) {
    const caseFolder = filename.includes("005") ? "case-005" : "case-006";
    const media = await readFile(`assets/projects/${caseFolder}/${filename}`);
    assert.ok(media.byteLength > 50_000, `${filename} should contain a usable image`);
    assert.ok(media.byteLength < 1_500_000, `${filename} should remain web-sized`);
    assert.deepEqual([...media.subarray(0, 3)], [0xff, 0xd8, 0xff], `${filename} should have a JPEG signature`);
    assert.deepEqual([...media.subarray(-2)], [0xff, 0xd9], `${filename} should be a complete JPEG`);
  }
  for (const filename of mp4Files) {
    const caseFolder = filename.includes("005") ? "case-005" : "case-006";
    const media = await readFile(`assets/projects/${caseFolder}/${filename}`);
    assert.ok(media.byteLength > 1_000_000, `${filename} should contain a usable video`);
    assert.ok(media.byteLength < 25 * 1024 * 1024, `${filename} should remain deployable as a site asset`);
    assert.equal(media.subarray(4, 8).toString("ascii"), "ftyp", `${filename} should be an ISO MP4`);
    assert.ok(media.includes(Buffer.from("avc1")), `${filename} should use browser-safe H.264 video`);
    assert.ok(media.includes(Buffer.from("mp4a")), `${filename} should use browser-safe AAC audio`);
  }
});

test("Case 004 publishes stripped, deployable meal proof media", async () => {
  const jpegFiles = [
    "korbani-meals-004-thumbnail.jpg",
    "korbani-meals-004-main.jpg",
    "korbani-meals-004-proof.jpg",
  ];

  for (const filename of jpegFiles) {
    const media = await readFile(`assets/projects/case-004/${filename}`);
    assert.ok(media.byteLength > 50_000, `${filename} should contain a usable image`);
    assert.ok(media.byteLength < 1_500_000, `${filename} should remain web-sized`);
    assert.deepEqual([...media.subarray(0, 3)], [0xff, 0xd8, 0xff], `${filename} should have a JPEG signature`);
    assert.deepEqual([...media.subarray(-2)], [0xff, 0xd9], `${filename} should be a complete JPEG`);
    assert.equal(media.includes(Buffer.from("Exif")), false, `${filename} should not retain EXIF metadata`);
  }

  const video = await readFile("assets/projects/case-004/korbani-meals-004-primary.mp4");
  assert.ok(video.byteLength > 1_000_000, "Case 004 video should contain usable proof media");
  assert.ok(video.byteLength < 25 * 1024 * 1024, "Case 004 video should remain below Cloudflare's per-file limit");
  assert.equal(video.subarray(4, 8).toString("ascii"), "ftyp", "Case 004 video should be an ISO MP4");
  assert.ok(video.includes(Buffer.from("avc1")), "Case 004 video should use browser-safe H.264 video");
  assert.ok(video.includes(Buffer.from("mp4a")), "Case 004 video should use browser-safe AAC audio");
  assert.equal(video.includes(Buffer.from("location")), false, "Case 004 video should not retain location metadata");
});

test("projects page opens directly into project content", async () => {
  const projectsHtml = await readFile("projects.html", "utf8");

  assert.doesNotMatch(projectsHtml, /See where donations go/);
  assert.doesNotMatch(projectsHtml, /Clear giving categories/);
  assert.doesNotMatch(projectsHtml, /<section class="page-hero reveal">/);
  assert.match(projectsHtml, /project-filter-section/);
  assert.match(projectsHtml, /aria-label="Project filters"/);
  assert.match(projectsHtml, /id="projectBoard"/);
});

test("stripe webhook rejects invalid signatures", async () => {
  const webhook = await importFunctionModule("functions/charity/webhooks/stripe.js");
  const response = await webhook.onRequestPost({
    request: new Request("https://one-world-relief.org/charity/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1770000000,v1=bad" },
      body: JSON.stringify({ type: "checkout.session.completed" }),
    }),
    env: { OWR_STRIPE_WEBHOOK_SECRET: "whsec_test" },
  });

  assert.equal(response.status, 400);
});

test("stripe webhook returns 500 so Stripe retries when Sheets is not configured", async () => {
  const webhook = await importFunctionModule("functions/charity/webhooks/stripe.js");
  const secret = "whsec_test";
  const timestamp = "1770000000";
  const body = JSON.stringify({
    id: "evt_test",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        created: 1770000000,
        amount_total: 100,
        payment_status: "paid",
        customer_email: "donor@example.com",
        client_reference_id: "don_123",
        metadata: {
          donation_id: "don_123",
          donor_name: "Test Donor",
          donor_email: "donor@example.com",
          campaign: "General Fund",
          donor_note: "For school supplies",
          anonymous_public: "yes",
        },
      },
    },
  });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  const response = await webhook.onRequestPost({
    request: new Request("https://one-world-relief.org/charity/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
      body,
    }),
    env: { OWR_STRIPE_WEBHOOK_SECRET: secret },
  });

  assert.equal(response.status, 500);
});

test("stripe webhook sends custom OneWorld Relief receipt email when configured", async () => {
  const webhook = await importFunctionModule("functions/charity/webhooks/stripe.js");
  const originalFetch = globalThis.fetch;
  const secret = "whsec_test";
  const timestamp = "1770000000";
  const calls = [];
  const body = JSON.stringify({
    id: "evt_test",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        created: 1770000000,
        amount_total: 100,
        payment_status: "paid",
        customer_email: "donor@example.com",
        client_reference_id: "don_123",
        payment_intent: "pi_test_123",
        metadata: {
          donation_id: "don_123",
          donor_name: "Test Donor",
          donor_email: "donor@example.com",
          campaign: "General Fund",
          donor_note: "For school supplies",
          anonymous_public: "yes",
        },
      },
    },
  });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "google-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url).includes("api.resend.com")) {
      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url).includes("sheets.googleapis.com") && !String(url).includes(":append")) {
      return new Response(JSON.stringify({ values: [["Donation ID", "Date", "Donor Name", "Amount ($)", "Purpose/Fund", "Method", "Receipt ID", "Notes"]] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url).includes("sheets.googleapis.com") && String(url).includes(":append")) {
      return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const privateKey = await createGooglePrivateKey();

    const response = await webhook.onRequestPost({
      request: new Request("https://one-world-relief.org/charity/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
        body,
      }),
      env: {
        OWR_STRIPE_WEBHOOK_SECRET: secret,
        OWR_GOOGLE_SHEET_ID: "sheet_123",
        OWR_GOOGLE_SHEET_TAB: "Donations (2026)",
        OWR_GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.iam.gserviceaccount.com",
        OWR_GOOGLE_PRIVATE_KEY: privateKey,
        OWR_PUBLIC_SITE_URL: "https://one-world-relief.org",
        OWR_RESEND_API_KEY: "re_test",
        OWR_RECEIPT_FROM_EMAIL: "OneWorld Relief <receipts@one-world-relief.org>",
      },
    });

    assert.equal(response.status, 200);
    const emailCall = calls.find((call) => call.url.includes("api.resend.com"));
    assert.ok(emailCall, "custom receipt email should be sent");
    const emailPayload = JSON.parse(emailCall.options.body);
    assert.deepEqual(emailPayload.to, ["donor@example.com"]);
    assert.match(emailPayload.subject, /OneWorld Relief donation receipt R-2026-02-02-/);
    assert.match(emailPayload.text, /OneWorld Relief\nEIN: 41-5079927/);
    assert.match(emailPayload.text, /Receipt ID: R-2026-02-02-/);
    assert.match(emailPayload.text, /Donor Name: Test Donor/);
    assert.match(emailPayload.text, /Amount: \$1\.00/);
    assert.match(emailPayload.text, /No goods or services were provided/);

    const sheetReadCall = calls.find((call) => call.url.includes("sheets.googleapis.com") && !call.url.includes(":append"));
    assert.ok(sheetReadCall, "webhook should check for duplicate spreadsheet rows before sending a receipt");
    const sheetCall = calls.find((call) => call.url.includes("sheets.googleapis.com") && call.url.includes(":append"));
    assert.match(sheetCall.url, /A%3AH/);
    const sheetPayload = JSON.parse(sheetCall.options.body);
    assert.deepEqual(sheetPayload.values[0].slice(0, 7), [
      "don_123",
      "2/2/2026",
      "Test Donor",
      1,
      "General Fund",
      "Stripe",
      "R-2026-02-02-DON123",
    ]);
    assert.match(sheetPayload.values[0][7], /Receipt Email: sent/);
    assert.match(sheetPayload.values[0][7], /Payment Intent: pi_test_123/);
    assert.match(sheetPayload.values[0][7], /Public Display: Anonymous/);
    assert.match(sheetPayload.values[0][7], /Donor Note: For school supplies/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stripe webhook records recurring invoice payments with subscription metadata", async () => {
  const webhook = await importFunctionModule("functions/charity/webhooks/stripe.js");
  const originalFetch = globalThis.fetch;
  const secret = "whsec_test";
  const timestamp = "1770000000";
  const calls = [];
  const body = JSON.stringify({
    id: "evt_invoice_paid",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_recurring_123",
        created: 1770600000,
        amount_paid: 2500,
        total: 2500,
        status: "paid",
        customer_email: "monthly@example.com",
        customer_name: "Monthly Donor",
        subscription: "sub_123",
        payment_intent: "pi_invoice_123",
        parent: {
          subscription_details: {
            metadata: {
              donation_id: "don_sub_123",
              donor_name: "Monthly Donor",
              donor_email: "monthly@example.com",
              campaign: "Orphan Support",
              donor_note: "Monthly orphan care",
              anonymous_public: "no",
              giving_frequency: "monthly",
              recurring_interval: "month",
              schedule_label: "Monthly donation",
            },
          },
        },
      },
    },
  });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "google-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url).includes("api.resend.com")) {
      return new Response(JSON.stringify({ id: "email_recurring_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url).includes("sheets.googleapis.com") && !String(url).includes(":append")) {
      return new Response(JSON.stringify({ values: [["Donation ID", "Date", "Donor Name", "Amount ($)", "Purpose/Fund", "Method", "Receipt ID", "Notes"]] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url).includes("sheets.googleapis.com") && String(url).includes(":append")) {
      return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const privateKey = await createGooglePrivateKey();
    const response = await webhook.onRequestPost({
      request: new Request("https://one-world-relief.org/charity/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
        body,
      }),
      env: {
        OWR_STRIPE_WEBHOOK_SECRET: secret,
        OWR_GOOGLE_SHEET_ID: "sheet_123",
        OWR_GOOGLE_SHEET_TAB: "Donations (2026)",
        OWR_GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.iam.gserviceaccount.com",
        OWR_GOOGLE_PRIVATE_KEY: privateKey,
        OWR_PUBLIC_SITE_URL: "https://one-world-relief.org",
        OWR_RESEND_API_KEY: "re_test",
        OWR_RECEIPT_FROM_EMAIL: "OneWorld Relief <receipts@one-world-relief.org>",
      },
    });

    assert.equal(response.status, 200);
    const sheetCall = calls.find((call) => call.url.includes("sheets.googleapis.com") && call.url.includes(":append"));
    assert.ok(sheetCall, "recurring paid invoice should append a donation row");
    const sheetPayload = JSON.parse(sheetCall.options.body);
    assert.equal(sheetPayload.values[0][0], "don_sub_123-in_recurring_123");
    assert.equal(sheetPayload.values[0][2], "Monthly Donor");
    assert.equal(sheetPayload.values[0][3], 25);
    assert.equal(sheetPayload.values[0][4], "Orphan Support");
    assert.match(sheetPayload.values[0][6], /^R-2026-/);
    assert.match(sheetPayload.values[0][7], /Subscription: sub_123/);
    assert.match(sheetPayload.values[0][7], /Stripe Invoice: in_recurring_123/);
    assert.match(sheetPayload.values[0][7], /Giving Schedule: Monthly donation/);
    assert.match(sheetPayload.values[0][7], /Receipt Email: sent/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stripe webhook skips existing spreadsheet rows without duplicate receipt email", async () => {
  const webhook = await importFunctionModule("functions/charity/webhooks/stripe.js");
  const originalFetch = globalThis.fetch;
  const secret = "whsec_test";
  const timestamp = "1770000000";
  const calls = [];
  const body = JSON.stringify({
    id: "evt_test_duplicate",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_duplicate",
        created: 1770000000,
        amount_total: 100,
        payment_status: "paid",
        customer_email: "donor@example.com",
        client_reference_id: "don_duplicate",
        payment_intent: "pi_test_duplicate",
        metadata: {
          donation_id: "don_duplicate",
          donor_name: "Test Donor",
          donor_email: "donor@example.com",
          campaign: "General Fund",
        },
      },
    },
  });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "google-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url).includes("sheets.googleapis.com") && !String(url).includes(":append")) {
      return new Response(JSON.stringify({
        values: [
          ["Donation ID", "Date", "Donor Name", "Amount ($)", "Purpose/Fund", "Method", "Receipt ID", "Notes"],
          ["don_duplicate", "2/2/2026", "Test Donor", "$1.00", "General Fund", "Stripe", "R-2026-02-02-DONDUPLIC", "Stripe Session: cs_test_duplicate"],
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const privateKey = await createGooglePrivateKey();

    const response = await webhook.onRequestPost({
      request: new Request("https://one-world-relief.org/charity/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
        body,
      }),
      env: {
        OWR_STRIPE_WEBHOOK_SECRET: secret,
        OWR_GOOGLE_SHEET_ID: "sheet_123",
        OWR_GOOGLE_SHEET_TAB: "Donations (2026)",
        OWR_GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.iam.gserviceaccount.com",
        OWR_GOOGLE_PRIVATE_KEY: privateKey,
        OWR_PUBLIC_SITE_URL: "https://one-world-relief.org",
        OWR_RESEND_API_KEY: "re_test",
        OWR_RECEIPT_FROM_EMAIL: "OneWorld Relief <receipts@one-world-relief.org>",
      },
    });

    assert.equal(response.status, 200);
    assert.ok(calls.some((call) => call.url.includes("sheets.googleapis.com") && !call.url.includes(":append")));
    assert.equal(calls.some((call) => call.url.includes("api.resend.com")), false);
    assert.equal(calls.some((call) => call.url.includes("sheets.googleapis.com") && call.url.includes(":append")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
