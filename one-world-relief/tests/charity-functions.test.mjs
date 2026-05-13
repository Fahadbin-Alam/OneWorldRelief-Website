import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const importFunctionModule = async (relativePath) => {
  const absolutePath = resolve(relativePath);
  const source = await readFile(absolutePath, "utf8");
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
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
  assert.doesNotMatch(shareHtml, /class="share-icon"/);
  assert.match(siteJs, /https:\/\/one-world-relief\.org\/donate/);
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
  assert.match(donateHtml, /Give in under a minute/);
  assert.match(donateHtml, /Continue to Secure Checkout/);
  assert.match(donateHtml, /Basic support/);
  assert.match(donateHtml, /Note for One World Relief/);
  assert.match(donateHtml, /anonymousDonation/);
  assert.match(donateHtml, /id="customDonationPanel" hidden/);
  assert.match(donateHtml, /inputmode="numeric"/);
  assert.match(siteJs, /syncCustomAmountPanel/);
  assert.match(siteJs, /donor_note: donorNote/);
  assert.match(siteJs, /anonymous_public: anonymousDonation/);
  assert.match(siteJs, /selected\?\.value === "custom"/);
  assert.match(siteJs, /customDonationPanel\.hidden = !isCustomAmount/);
  assert.match(siteJs, /radio\.value !== "custom"/);
  assert.match(siteCss, /\.donation-form-card-featured/);
  assert.match(siteCss, /\.donation-form-heading/);
  assert.match(siteCss, /\.donor-options/);
  assert.match(siteCss, /\.checkbox-line/);
  assert.match(siteCss, /\.custom-donation-panel/);
  assert.match(siteCss, /@keyframes custom-panel-open/);
  assert.match(siteCss, /@keyframes panel-current/);
  assert.match(siteCss, /\.amount-grid label:has\(input:checked\)/);
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

test("pages include the One World Relief favicon", async () => {
  const [homeHtml, projectHtml, faviconSvg] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("projects/case-001.html", "utf8"),
    readFile("favicon.svg", "utf8"),
  ]);

  assert.match(homeHtml, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml" \/>/);
  assert.match(projectHtml, /<link rel="icon" href="\.\.\/favicon\.svg" type="image\/svg\+xml" \/>/);
  assert.match(faviconSvg, /One World Relief/);
  assert.match(faviconSvg, /OWR/);
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
  assert.match(serviceWorker, /owr-offline-v1/);
  assert.match(serviceWorker, /caches\.match\("\/offline\.html"\)/);
  assert.match(siteCss, /\.offline-dino/);
  assert.match(siteCss, /@keyframes offline-dino-hop/);
});

test("home page renders a continuous completed-case photo flow from project data", async () => {
  const [homeHtml, siteJs, siteCss] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
  ]);

  assert.doesNotMatch(homeHtml, /See the work as it moves/);
  assert.doesNotMatch(homeHtml, /Project Flow/);
  assert.doesNotMatch(homeHtml, /From donation to proof/);
  assert.match(homeHtml, /Completed One World Relief cases/);
  assert.match(homeHtml, /faith-video-section/);
  assert.match(homeHtml, /faith-video-bg/);
  assert.match(homeHtml, /Why We Give/);
  assert.match(homeHtml, /Quran 2:215/);
  assert.match(homeHtml, /Sahih al-Bukhari 6005/);
  assert.match(homeHtml, /Quran 76:8/);
  assert.match(homeHtml, /Sunan Abi Dawud 1681/);
  assert.match(homeHtml, /id="homeCaseFlowTrack"/);
  assert.match(homeHtml, /<script src="project-data\.js"><\/script>/);
  assert.match(homeHtml, /name="quickAmount" value="custom"/);
  assert.match(homeHtml, /id="quickCustomPanel" hidden/);
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
  assert.match(siteJs, /\[\.\.\.projects, \.\.\.projects, \.\.\.projects, \.\.\.projects\]/);
  assert.match(siteJs, /syncQuickCustomPanel/);
  assert.match(siteJs, /cancelAnimationFrame\(pointerFrame\)/);
  assert.match(siteJs, /case-flow-card/);
  assert.match(siteCss, /\.home-case-flow/);
  assert.match(siteCss, /\.home-case-lanes/);
  assert.match(siteCss, /\.home-case-panel-section/);
  assert.match(siteCss, /grid-template-columns: minmax\(0, 0\.95fr\) minmax\(340px, 420px\)/);
  assert.match(siteCss, /\.faith-video-section/);
  assert.match(siteCss, /\.faith-quote-track/);
  assert.match(siteCss, /@keyframes faith-quote-scroll/);
  assert.match(siteCss, /\.case-flow-track/);
  assert.match(siteCss, /@keyframes case-river/);
  assert.match(siteCss, /will-change: transform/);
  assert.match(siteCss, /translate3d\(calc\(-50% - 0\.5rem\), 0, 0\)/);
  assert.doesNotMatch(siteCss, /case-flow-shell:hover \.case-flow-track/);
  assert.doesNotMatch(siteCss, /@keyframes case-shine/);
  assert.doesNotMatch(siteJs, /case-flow-shine/);
  assert.doesNotMatch(siteJs, /case-flow-card, \\.contact-message-card/);
});

test("contact page has the updated flowing contact layout", async () => {
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
  assert.match(contactHtml, /Send us a note/);
  assert.match(contactHtml, /Send Email/);
  assert.doesNotMatch(contactHtml, /Send a note and we will follow up/);
  assert.doesNotMatch(contactHtml, /We are here to help/);
  assert.match(siteCss, /\.contact-flow-section/);
  assert.match(siteCss, /\.contact-intro/);
  assert.match(siteCss, /\.contact-submit/);
  assert.match(siteCss, /\.contact-method-card/);
  assert.match(siteCss, /\.contact-message-card/);
  assert.match(siteCss, /min-height: calc\(100svh - 74px\)/);
  assert.match(siteCss, /contact-methods h1[\s\S]*font-family: "Manrope"/);
  assert.match(siteCss, /contact-message-card h2[\s\S]*font-family: "Manrope"/);
  assert.match(siteJs, /contact-message-card/);
  assert.match(siteJs, /rootMargin: "0px 0px 22% 0px"/);
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
  const [projectData, siteJs, siteCss, casePage, caseTwoPage, caseThreePage, caseFourPage] = await Promise.all([
    readFile("project-data.js", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
    readFile("projects/case-001.html", "utf8"),
    readFile("projects/case-002.html", "utf8"),
    readFile("projects/case-003.html", "utf8"),
    readFile("projects/case-004.html", "utf8"),
  ]);

  assert.doesNotMatch(projectData, /drive\.google\.com/);
  assert.doesNotMatch(projectData, /youtube\.com/);
  assert.match(projectData, /projects\/case-001\.html/);
  assert.match(projectData, /projects\/case-002\.html/);
  assert.match(projectData, /projects\/case-003\.html/);
  assert.match(projectData, /projects\/case-004\.html/);
  assert.doesNotMatch(projectData, /Village Qurbani Meal Support/);
  assert.doesNotMatch(projectData, /Two-Year Orphan Education Support/);
  assert.doesNotMatch(projectData, /Food Stand for a Father/);
  assert.doesNotMatch(projectData, /title: "Case 001:/);
  assert.doesNotMatch(projectData, /title: "Case 002:/);
  assert.doesNotMatch(projectData, /title: "Case 003:/);
  assert.doesNotMatch(projectData, /title: "Case 004:/);
  assert.match(projectData, /Keeping a Hafiz Student in School/);
  assert.match(projectData, /A Fresh Start for a Father's Business/);
  assert.match(projectData, /Keeping an Orphan Boy in School/);
  assert.match(projectData, /Korbani Meals for a Village/);
  assert.match(projectData, /orphan-support-001-thumbnail\.jpg/);
  assert.match(projectData, /livelihood-support-002-thumbnail\.jpg/);
  assert.match(projectData, /thumbnailType: "banner"/);
  assert.doesNotMatch(projectData, /orphan-education-003-placeholder\.svg/);
  assert.doesNotMatch(projectData, /korbani-village-004-placeholder\.svg/);
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
  assert.match(casePage, /timeline-step-active/);

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
  assert.match(caseThreePage, /Current Case/);
  assert.match(caseThreePage, /current-case-banner/);
  assert.match(caseThreePage, /Ongoing/);
  assert.match(caseThreePage, /Media coming soon/);
  assert.doesNotMatch(caseThreePage, /orphan-education-003-placeholder\.svg/);
  assert.match(caseThreePage, /project-timeline/);
  assert.match(caseThreePage, /timeline-step-active/);
  assert.match(caseThreePage, /timeline-step-pending/);

  assert.match(caseFourPage, /Korbani meals for a village/);
  assert.match(caseFourPage, /Case 004/);
  assert.match(caseFourPage, /Current Case/);
  assert.match(caseFourPage, /current-case-banner/);
  assert.match(caseFourPage, /Ongoing/);
  assert.match(caseFourPage, /Media coming soon/);
  assert.doesNotMatch(caseFourPage, /korbani-village-004-placeholder\.svg/);
  assert.match(caseFourPage, /project-timeline/);
  assert.match(caseFourPage, /timeline-step-active/);
  assert.match(caseFourPage, /timeline-step-pending/);
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
    if (String(url).includes("sheets.googleapis.com")) {
      return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const privateKey = await crypto.subtle.generateKey(
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

    const sheetCall = calls.find((call) => call.url.includes("sheets.googleapis.com"));
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
