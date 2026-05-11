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
  const serviceAccount = env.OWR_GOOGLE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(env.OWR_GOOGLE_SERVICE_ACCOUNT_JSON)
    : {};
  const serviceAccountEmail = env.OWR_GOOGLE_SERVICE_ACCOUNT_EMAIL || serviceAccount.client_email;
  const privateKey = env.OWR_GOOGLE_PRIVATE_KEY || serviceAccount.private_key;

  if (!serviceAccountEmail || !privateKey) {
    throw new Error("Google Sheets credentials are not configured.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
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

const createReceiptNumber = (session) => {
  const donationId = session.metadata?.donation_id || session.client_reference_id || session.id || "unknown";
  const compactId = donationId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase();
  const date = new Date((session.created || Date.now() / 1000) * 1000);
  const dateStamp = date.toISOString().slice(0, 10);
  return `R-${dateStamp}-${compactId || "000"}`;
};

const getAmountUsd = (session) => {
  return ((session.amount_total || 0) / 100).toFixed(2);
};

const getReceiptDetails = (session) => {
  const metadata = session.metadata || {};
  const donorName = metadata.donor_name || session.customer_details?.name || "";
  const donorEmail = metadata.donor_email || session.customer_details?.email || session.customer_email || "";
  const paidDate = new Date((session.created || Date.now() / 1000) * 1000);
  return {
    receiptNumber: createReceiptNumber(session),
    donorName,
    donorEmail,
    date: paidDate.toLocaleDateString("en-US", { timeZone: "UTC" }),
    amount: getAmountUsd(session),
    method: "Stripe",
  };
};

const createReceiptText = (receipt) => {
  return `OneWorld Relief
EIN: 41-5079927

Donation Receipt

Receipt ID: ${receipt.receiptNumber}
Donor Name: ${receipt.donorName || "Donor"}
Date: ${receipt.date}
Amount: $${receipt.amount}
Method: ${receipt.method}

Thank you for your generous contribution to OneWorld Relief, a 501(c)(3) nonprofit organization.

No goods or services were provided in exchange for this contribution.

This donation may be tax-deductible to the extent allowed by law.

Sincerely,
OneWorld Relief`;
};

const sendReceiptEmail = async (env, session) => {
  const receipt = getReceiptDetails(session);
  if (!receipt.donorEmail) {
    return "not_sent_missing_email";
  }

  if (!env.OWR_RESEND_API_KEY || !env.OWR_RECEIPT_FROM_EMAIL) {
    console.error("One World Relief custom receipt email is not configured.");
    return "not_sent_email_not_configured";
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OWR_RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.OWR_RECEIPT_FROM_EMAIL,
      to: [receipt.donorEmail],
      reply_to: env.OWR_RECEIPT_REPLY_TO || env.OWR_RECEIPT_FROM_EMAIL,
      subject: `OneWorld Relief donation receipt ${receipt.receiptNumber}`,
      text: createReceiptText(receipt),
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Receipt email failed: ${payload}`);
  }

  return "sent";
};

const appendDonationToGoogleSheet = async (env, session) => {
  if (!env.OWR_GOOGLE_SHEET_ID) {
    throw new Error("OWR_GOOGLE_SHEET_ID is not configured.");
  }

  const accessToken = await getGoogleAccessToken(env);
  const metadata = session.metadata || {};
  const receipt = getReceiptDetails(session);
  let receiptEmailStatus = "not_attempted";
  try {
    receiptEmailStatus = await sendReceiptEmail(env, session);
  } catch (error) {
    console.error("One World Relief custom receipt email failed", error.message);
    receiptEmailStatus = "failed";
  }
  const origin = env.OWR_PUBLIC_SITE_URL || env.OWR_SUCCESS_URL?.replace(/\/charity\/thank-you.*$/, "") || "";
  const receiptUrl = origin ? `${origin.replace(/\/$/, "")}/charity/thank-you?donation_id=${encodeURIComponent(metadata.donation_id || session.client_reference_id || "")}&session_id=${encodeURIComponent(session.id || "")}` : "";
  const notes = [
    session.payment_status ? `Status: ${session.payment_status}` : "",
    session.id ? `Stripe Session: ${session.id}` : "",
    session.payment_intent ? `Payment Intent: ${session.payment_intent}` : "",
    receiptEmailStatus ? `Receipt Email: ${receiptEmailStatus}` : "",
    receiptUrl ? `Receipt URL: ${receiptUrl}` : "",
    metadata.anonymous_public === "yes" ? "Public Display: Anonymous" : "",
    metadata.donor_note ? `Donor Note: ${metadata.donor_note}` : "",
  ].filter(Boolean).join(" | ");
  const row = [
    metadata.donation_id || session.client_reference_id || "",
    new Date((session.created || Date.now() / 1000) * 1000).toLocaleDateString("en-US", { timeZone: "UTC" }),
    receipt.donorName,
    Number(receipt.amount),
    metadata.campaign || "General Fund",
    "Stripe",
    receipt.receiptNumber,
    notes,
  ];
  const tabName = env.OWR_GOOGLE_SHEET_TAB || "Donations";
  const range = encodeURIComponent(`'${tabName}'!A:H`);
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
      return text("Google Sheets sync failed; retry webhook later", 500);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
