const text = (message, status = 200) => {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
};

const timingSafeEqual = (left, right) => {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < left.length; i++) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
};

const hmacSha256Hex = async (secret, message) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const base64UrlEncode = (input) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const pemToArrayBuffer = (pem) => {
  const normalized = pem.replace(/\\n/g, "\n");
  const base64 = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const getGoogleAccessToken = async (env) => {
  if (!env.OWR_GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.OWR_GOOGLE_PRIVATE_KEY) {
    throw new Error("Google Sheets credentials are not configured.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: env.OWR_GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.OWR_GOOGLE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsignedJwt));
  const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const payload = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(payload.error_description || payload.error || "Google access token request failed.");
  }

  return payload.access_token;
};

const appendRowToGoogleSheet = async (env, row) => {
  if (!env.OWR_GOOGLE_SHEET_ID) {
    return;
  }

  const accessToken = await getGoogleAccessToken(env);
  const tabName = env.OWR_GOOGLE_SHEET_TAB || "Donations";
  const range = encodeURIComponent(`'${tabName}'!A:N`);
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${env.OWR_GOOGLE_SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const sheetResponse = await fetch(appendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });

  if (!sheetResponse.ok) {
    const payload = await sheetResponse.text();
    throw new Error(`Google Sheets append failed: ${payload}`);
  }
};

// Columns A-N: donation id, time, name, email, amount, campaign, session/invoice id,
// payment status, payment intent, checkout url, frequency, fee covered, dedication, project.
const appendDonationToGoogleSheet = async (env, session) => {
  const metadata = session.metadata || {};
  await appendRowToGoogleSheet(env, [
    metadata.donation_id || session.client_reference_id || "",
    new Date((session.created || Date.now() / 1000) * 1000).toISOString(),
    metadata.donor_name || session.customer_details?.name || "",
    metadata.donor_email || session.customer_details?.email || session.customer_email || "",
    ((session.amount_total || 0) / 100).toFixed(2),
    metadata.campaign || "General Fund",
    session.id || "",
    session.payment_status || "",
    session.payment_intent || session.subscription || "",
    session.url || "",
    metadata.frequency === "monthly" ? "monthly (first payment)" : "once",
    metadata.fee_covered || "",
    metadata.dedication || "",
    metadata.project || "",
  ]);
};

// Later monthly payments arrive as invoices, not checkout sessions.
const appendRenewalToGoogleSheet = async (env, invoice) => {
  const metadata = invoice.subscription_details?.metadata || invoice.metadata || {};
  await appendRowToGoogleSheet(env, [
    metadata.donation_id || "",
    new Date((invoice.created || Date.now() / 1000) * 1000).toISOString(),
    metadata.donor_name || invoice.customer_name || "",
    metadata.donor_email || invoice.customer_email || "",
    ((invoice.amount_paid || 0) / 100).toFixed(2),
    metadata.campaign || "General Fund",
    invoice.id || "",
    invoice.status || "",
    invoice.payment_intent || invoice.subscription || "",
    invoice.hosted_invoice_url || "",
    "monthly (renewal)",
    metadata.fee_covered || "",
    metadata.dedication || "",
    metadata.project || "",
  ]);
};

const verifyStripeSignature = async (body, header, configuredSecrets) => {
  if (!configuredSecrets) {
    return false;
  }

  const timestamp = header.match(/(?:^|,)t=([^,]+)/)?.[1];
  const signatures = [...header.matchAll(/(?:^|,)v1=([^,]+)/g)].map((match) => match[1]);
  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const signedPayload = `${timestamp}.${body}`;
  const secrets = configuredSecrets.split(",").map((secret) => secret.trim()).filter(Boolean);
  for (const secret of secrets) {
    const expected = await hmacSha256Hex(secret, signedPayload);
    if (signatures.some((signature) => timingSafeEqual(expected, signature))) {
      return true;
    }
  }

  return false;
};

export const onRequestPost = async ({ request, env }) => {
  const body = await request.text();
  const stripeSignature = request.headers.get("stripe-signature") || "";
  const isVerified = await verifyStripeSignature(body, stripeSignature, env.OWR_STRIPE_WEBHOOK_SECRET);

  if (!isVerified) {
    return text("Invalid Stripe signature", 400);
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch (_error) {
    return text("Invalid JSON", 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object;
    console.log("One World Relief donation completed", session?.id || event.id);
    try {
      await appendDonationToGoogleSheet(env, session);
    } catch (error) {
      console.error("One World Relief Google Sheets sync failed", error.message);
    }
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data?.object;
    // The first invoice is already logged by checkout.session.completed.
    if (invoice?.billing_reason === "subscription_cycle") {
      console.log("One World Relief monthly renewal", invoice.id);
      try {
        await appendRenewalToGoogleSheet(env, invoice);
      } catch (error) {
        console.error("One World Relief Google Sheets renewal sync failed", error.message);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
