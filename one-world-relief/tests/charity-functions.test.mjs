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
  assert.match(siteJs, /https:\/\/one-world-relief\.org\/donate/);
  assert.match(qrSvg, /stroke="#183447"/);
  assert.doesNotMatch(shareHtml, /one-world-relief\.com\/donate/);
  assert.doesNotMatch(siteJs, /one-world-relief\.com\/donate/);
});

test("donation page opens custom amount only when selected", async () => {
  const [donateHtml, siteJs, siteCss] = await Promise.all([
    readFile("donate.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
  ]);

  assert.match(donateHtml, /name="amount" value="custom"/);
  assert.match(donateHtml, /id="customDonationPanel" hidden/);
  assert.match(donateHtml, /inputmode="numeric"/);
  assert.match(siteJs, /syncCustomAmountPanel/);
  assert.match(siteJs, /selected\?\.value === "custom"/);
  assert.match(siteJs, /customDonationPanel\.hidden = !isCustomAmount/);
  assert.match(siteJs, /radio\.value !== "custom"/);
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

test("about page shows nonprofit status and EIN without a public home address", async () => {
  const aboutHtml = await readFile("about.html", "utf8");

  assert.match(aboutHtml, /501\(c\)\(3\) nonprofit organization/);
  assert.match(aboutHtml, /EIN/);
  assert.match(aboutHtml, /41-5079927/);
  assert.match(aboutHtml, /tax-deductible to the extent allowed by law/);
  assert.match(aboutHtml, /Available upon request/);
  assert.doesNotMatch(aboutHtml, /Middle Patenga/);
});

test("project cards publish approved cases with embedded local media", async () => {
  const [projectData, casePage, caseTwoPage, caseThreePage, caseFourPage] = await Promise.all([
    readFile("project-data.js", "utf8"),
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
  assert.match(projectData, /orphan-education-003-placeholder\.svg/);
  assert.match(projectData, /korbani-village-004-placeholder\.svg/);

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
  assert.match(caseThreePage, /Ongoing/);
  assert.match(caseThreePage, /Media coming soon/);
  assert.match(caseThreePage, /project-timeline/);
  assert.match(caseThreePage, /timeline-step-active/);
  assert.match(caseThreePage, /timeline-step-pending/);

  assert.match(caseFourPage, /Korbani meals for a village/);
  assert.match(caseFourPage, /Case 004/);
  assert.match(caseFourPage, /Ongoing/);
  assert.match(caseFourPage, /Media coming soon/);
  assert.match(caseFourPage, /project-timeline/);
  assert.match(caseFourPage, /timeline-step-active/);
  assert.match(caseFourPage, /timeline-step-pending/);
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});
