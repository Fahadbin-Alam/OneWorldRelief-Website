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
    console.log("One World Relief donation completed", event.data?.object?.id || event.id);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
