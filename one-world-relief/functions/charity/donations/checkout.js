const json = (payload, status = 200) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};

export const onRequestOptions = async () => {
  return json({});
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.OWR_STRIPE_SECRET_KEY) {
    return json({ detail: "Stripe is not configured." }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return json({ detail: "Invalid JSON body." }, 400);
  }

  const donorName = String(body.donor_name || "").trim();
  const donorEmail = String(body.donor_email || "").trim();
  const amountUsd = Number(body.amount_usd || 0);
  const paymentMethod = String(body.payment_method || "stripe").trim().toLowerCase().replace(/-/g, "_");
  const campaign = String(body.campaign || "General Fund").trim() || "General Fund";

  if (donorName.length < 2 || !donorEmail.includes("@")) {
    return json({ detail: "Please enter a valid donor name and email." }, 400);
  }

  if (!amountUsd || amountUsd <= 0) {
    return json({ detail: "Donation amount must be greater than zero." }, 400);
  }

  const stripeMethods = ["stripe", "credit_card", "card", "apple_pay", "cash_app", "cashapp"];
  if (paymentMethod === "venmo") {
    const venmoUrl = env.OWR_VENMO_URL || env.OWR_PAYPAL_VENMO_URL;
    if (!venmoUrl) {
      return json({ detail: "Venmo giving is not configured yet. Please use Apple Pay, card, or Cash App Pay." }, 503);
    }

    const redirectUrl = new URL(venmoUrl);
    redirectUrl.searchParams.set("txn", "pay");
    redirectUrl.searchParams.set("note", `One World Relief - ${campaign}`);
    redirectUrl.searchParams.set("amount", amountUsd.toFixed(2));
    return json({
      donation_id: crypto.randomUUID(),
      provider: "venmo",
      status: "external_redirect",
      redirect_url: redirectUrl.toString(),
      message: "Redirect donor to Venmo. Add this payment manually to the donation sheet after confirming it clears.",
    });
  }

  if (!stripeMethods.includes(paymentMethod)) {
    return json({ detail: "Please use Apple Pay, Cash App Pay, card, or Venmo." }, 400);
  }

  const origin = new URL(request.url).origin;
  const donationId = crypto.randomUUID();
  const amountCents = Math.round(amountUsd * 100);
  const successBaseUrl = body.success_url || env.OWR_SUCCESS_URL || `${origin}/charity/thank-you`;
  const cancelBaseUrl = body.cancel_url || env.OWR_CANCEL_URL || `${origin}/charity/cancelled`;
  const successUrl = new URL(successBaseUrl);
  successUrl.searchParams.set("donation_id", donationId);
  successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  const cancelUrl = new URL(cancelBaseUrl);
  cancelUrl.searchParams.set("donation_id", donationId);

  const form = new URLSearchParams();
  form.set("mode", "payment");
  if (paymentMethod === "apple_pay") {
    form.set("payment_method_types[0]", "card");
  } else if (paymentMethod === "cash_app" || paymentMethod === "cashapp") {
    form.set("payment_method_types[0]", "cashapp");
    form.set("payment_method_types[1]", "card");
  }
  form.set("success_url", successUrl.toString());
  form.set("cancel_url", cancelUrl.toString());
  form.set("customer_email", donorEmail);
  form.set("client_reference_id", donationId);
  form.set("metadata[donation_id]", donationId);
  form.set("metadata[source]", "one-world-relief");
  form.set("metadata[campaign]", campaign);
  form.set("metadata[donor_name]", donorName);
  form.set("metadata[donor_email]", donorEmail);
  form.set("payment_intent_data[metadata][donation_id]", donationId);
  form.set("payment_intent_data[metadata][source]", "one-world-relief");
  form.set("payment_intent_data[metadata][campaign]", campaign);
  form.set("payment_intent_data[metadata][donor_name]", donorName);
  form.set("payment_intent_data[metadata][donor_email]", donorEmail);
  form.set("payment_intent_data[receipt_email]", donorEmail);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", String(amountCents));
  form.set("line_items[0][price_data][product_data][name]", `One World Relief - ${campaign}`);
  form.set("line_items[0][price_data][product_data][description]", `Donation from ${donorName}`);

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OWR_STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2026-02-25.clover",
    },
    body: form,
  });

  const payload = await stripeResponse.json();
  if (!stripeResponse.ok) {
    return json({ detail: payload.error?.message || "Stripe checkout could not be started." }, 502);
  }

  return json({
    donation_id: donationId,
    provider: "stripe",
    status: "pending",
    redirect_url: payload.url,
    message: "Redirect donor to Stripe Checkout URL",
  });
};
