const escapeHtml = (value) => {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const createReceiptNumber = (session, donationId) => {
  const compactId = String(donationId || session?.id || "unknown")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10)
    .toUpperCase();
  const created = session?.created ? new Date(session.created * 1000) : new Date();
  const stamp = created.toISOString().slice(0, 10).replace(/-/g, "");
  return `OWR-${stamp}-${compactId}`;
};

const fetchStripeSession = async (env, sessionId) => {
  if (!env.OWR_STRIPE_SECRET_KEY || !sessionId || sessionId === "{CHECKOUT_SESSION_ID}") {
    return null;
  }

  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: {
        Authorization: `Bearer ${env.OWR_STRIPE_SECRET_KEY}`,
        "Stripe-Version": "2026-02-25.clover",
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  return response.json();
};

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const donationId = url.searchParams.get("donation_id") || "";
  const sessionId = url.searchParams.get("session_id") || "";
  const session = await fetchStripeSession(env, sessionId);
  const metadata = session?.metadata || {};
  const donorName = metadata.donor_name || session?.customer_details?.name || "";
  const donorEmail = metadata.donor_email || session?.customer_details?.email || session?.customer_email || "";
  const campaign = metadata.campaign || "General Fund";
  const amountUsd = session?.amount_total ? (session.amount_total / 100).toFixed(2) : "";
  const receiptNumber = createReceiptNumber(session, donationId || metadata.donation_id);
  const paidDate = session?.created ? new Date(session.created * 1000).toLocaleDateString("en-US") : "";

  return new Response(
    `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>One World Relief | Thank You</title>
        <link rel="stylesheet" href="/one-world-relief.css" />
      </head>
      <body class="site-body">
        <main class="page-hero">
          <div class="container page-hero-content">
            <p class="eyebrow">Thank You</p>
            <h1>Your donation checkout was completed.</h1>
            <p class="lead">Thank you for supporting One World Relief. Save or print the receipt below for your records.</p>
            <article class="receipt-card" aria-label="Donation receipt">
              <h2>Donation Receipt</h2>
              <div class="receipt-grid">
                <p><strong>Receipt</strong><br />${escapeHtml(receiptNumber)}</p>
                <p><strong>Donation ID</strong><br />${escapeHtml(donationId || metadata.donation_id)}</p>
                <p><strong>Name</strong><br />${escapeHtml(donorName || "Donor")}</p>
                <p><strong>Email</strong><br />${escapeHtml(donorEmail || "Not available")}</p>
                <p><strong>Amount</strong><br />${amountUsd ? `$${escapeHtml(amountUsd)} USD` : "Confirmed by Stripe"}</p>
                <p><strong>Campaign</strong><br />${escapeHtml(campaign)}</p>
                <p><strong>Date</strong><br />${escapeHtml(paidDate || "Confirmed by Stripe")}</p>
                <p><strong>Payment Status</strong><br />${escapeHtml(session?.payment_status || "complete")}</p>
              </div>
              <p class="receipt-fine-print">
                One World Relief received this donation through Stripe Checkout. A Stripe email receipt may also be sent to the donor email address when Stripe receipts are enabled.
              </p>
              <div class="hero-actions">
                <button class="button button-primary" type="button" onclick="window.print()">Print Receipt</button>
                <a class="button button-outline" href="/projects.html">View Projects</a>
              </div>
            </article>
            <div class="hero-actions">
              <a class="button button-outline" href="/">Back Home</a>
              <a class="button button-outline" href="/share.html">Share</a>
            </div>
          </div>
        </main>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
};
