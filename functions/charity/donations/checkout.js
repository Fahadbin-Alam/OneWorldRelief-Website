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
  const feeUsd = Math.max(0, Number(body.fee_usd || 0));
  const paymentMethod = String(body.payment_method || "stripe").trim().toLowerCase();
  const campaign = String(body.campaign || "General Fund").trim() || "General Fund";
  const frequency = String(body.frequency || "once").trim().toLowerCase() === "monthly" ? "monthly" : "once";
  const dedication = String(body.dedication || "").trim().slice(0, 120);
  const project = String(body.project || "").trim().slice(0, 120);

  if (donorName.length < 2 || !donorEmail.includes("@")) {
    return json({ detail: "Please enter a valid donor name and email." }, 400);
  }

  if (!amountUsd || amountUsd <= 0) {
    return json({ detail: "Donation amount must be greater than zero." }, 400);
  }

  if (amountUsd > 10000 || feeUsd > amountUsd) {
    return json({ detail: "For gifts over $10,000, please contact us directly." }, 400);
  }

  if (!["stripe", "credit_card", "card"].includes(paymentMethod)) {
    return json({ detail: "Live PayPal checkout is not configured yet. Please use Stripe." }, 400);
  }

  const origin = new URL(request.url).origin;
  const donationId = crypto.randomUUID();
  const amountCents = Math.round(amountUsd * 100);
  const feeCents = Math.round(feeUsd * 100);
  const totalUsd = ((amountCents + feeCents) / 100).toFixed(2);
  const thankYouParams = new URLSearchParams({
    donation_id: donationId,
    amount: totalUsd,
    campaign,
    frequency,
  });
  if (project) {
    thankYouParams.set("project", project);
  }
  const successUrl = body.success_url || `${origin}/charity/thank-you?${thankYouParams.toString()}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = body.cancel_url || `${origin}/charity/cancelled?donation_id=${donationId}`;

  const metadata = {
    donation_id: donationId,
    source: "one-world-relief",
    campaign,
    donor_name: donorName,
    donor_email: donorEmail,
    frequency,
    fee_covered: feeCents > 0 ? "yes" : "no",
    dedication,
    project,
  };

  const form = new URLSearchParams();
  form.set("mode", frequency === "monthly" ? "subscription" : "payment");
  form.set("success_url", successUrl);
  form.set("cancel_url", cancelUrl);
  form.set("customer_email", donorEmail);
  form.set("client_reference_id", donationId);
  Object.entries(metadata).forEach(([key, value]) => {
    form.set(`metadata[${key}]`, value);
    if (frequency === "monthly") {
      form.set(`subscription_data[metadata][${key}]`, value);
    } else {
      form.set(`payment_intent_data[metadata][${key}]`, value);
    }
  });

  const productName = project
    ? `One World Relief - ${project}`
    : `One World Relief - ${campaign}`;
  const productDescription = frequency === "monthly"
    ? `Monthly donation from ${donorName}`
    : `Donation from ${donorName}`;

  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", String(amountCents));
  form.set("line_items[0][price_data][product_data][name]", productName);
  form.set("line_items[0][price_data][product_data][description]", productDescription);
  if (frequency === "monthly") {
    form.set("line_items[0][price_data][recurring][interval]", "month");
  }

  if (feeCents > 0) {
    form.set("line_items[1][quantity]", "1");
    form.set("line_items[1][price_data][currency]", "usd");
    form.set("line_items[1][price_data][unit_amount]", String(feeCents));
    form.set("line_items[1][price_data][product_data][name]", "Card processing fee cover");
    if (frequency === "monthly") {
      form.set("line_items[1][price_data][recurring][interval]", "month");
    }
  }

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
    frequency,
    redirect_url: payload.url,
    message: "Redirect donor to Stripe Checkout URL",
  });
};
