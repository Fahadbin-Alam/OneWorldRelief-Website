const MAX_SHEET_ROWS = 5000;
const PUBLIC_CACHE_CONTROL = "public, max-age=30, s-maxage=120, stale-while-revalidate=300";

const json = (payload, status = 200, cacheControl = "no-store") => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
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
  const normalized = String(pem || "").replace(/\\n/g, "\n");
  const base64 = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
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
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error("Google access token request failed.");
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("Google access token response was incomplete.");
  }
  return payload.access_token;
};

const getSheetRows = async (env, accessToken, tabName) => {
  const safeTabName = String(tabName).replace(/'/g, "''");
  const range = encodeURIComponent(`'${safeTabName}'!A1:H${MAX_SHEET_ROWS}`);
  const sheetId = encodeURIComponent(env.OWR_GOOGLE_SHEET_ID);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error("Google Sheets supporter board read failed.");
  }

  const payload = await response.json();
  return Array.isArray(payload.values) ? payload.values.slice(0, MAX_SHEET_ROWS) : [];
};

const normalizePublicDisplayName = (value) => {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
};

const isValidPublicDisplayName = (value) => {
  const normalized = normalizePublicDisplayName(value);
  const length = Array.from(normalized).length;
  return length >= 2
    && length <= 40
    && /^[\p{L}\p{N}][\p{L}\p{N} .'\u2019_-]*$/u.test(normalized)
    && !/(?:https?:\/\/|www\.|\b[\p{L}\p{N}-]+\.(?:com|org|net|io|co|me|app|dev)\b)/iu.test(normalized);
};

const normalizeEmail = (value) => {
  return String(value || "").trim().toLowerCase();
};

const isValidEmail = (value) => {
  return value.length <= 254
    && /^[^\s@|]{1,64}@[^\s@|]{1,189}\.[^\s@|]{2,}$/u.test(value);
};

const getNoteValue = (segments, label) => {
  const prefix = `${label}: `;
  const segment = segments.find((item) => item.startsWith(prefix));
  return segment ? segment.slice(prefix.length).trim() : "";
};

const parseAmountCents = (value) => {
  const normalized = typeof value === "number"
    ? value
    : Number(String(value || "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 0;
  }
  const cents = Math.round(normalized * 100);
  return Number.isSafeInteger(cents) ? cents : 0;
};

const sanitizeCause = (value) => {
  const normalized = String(value || "")
    .replace(/[\p{Cc}\p{Cf}<>\{\}|]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 80);
  return normalized || "General support";
};

const parseCompletedAt = (value) => {
  const timestamp = Date.parse(String(value || ""));
  const earliest = Date.UTC(2020, 0, 1);
  const latest = Date.now() + 24 * 60 * 60 * 1000;
  if (!Number.isFinite(timestamp) || timestamp < earliest || timestamp > latest) {
    return null;
  }
  return {
    timestamp,
    iso: new Date(timestamp).toISOString(),
  };
};

const getEligibleDonations = (rows) => {
  const eligible = [];
  const seenIdentifiers = new Set();

  rows.slice(1).forEach((row) => {
    if (!Array.isArray(row) || String(row[5] || "").trim() !== "Stripe") {
      return;
    }

    const notes = String(row[7] || "");
    const segments = notes.split(" | ").map((item) => item.trim());
    if (segments[0] !== "Supporter Board: Yes"
      || segments.includes("Public Display: Anonymous")
      || getNoteValue(segments, "Status").toLowerCase() !== "paid") {
      return;
    }

    const displayName = normalizePublicDisplayName(getNoteValue(segments, "Supporter Name"));
    const email = normalizeEmail(getNoteValue(segments, "Donor Email"));
    const completedAt = parseCompletedAt(getNoteValue(segments, "Completed At UTC"));
    const amountCents = parseAmountCents(row[3]);
    if (!isValidPublicDisplayName(displayName) || !isValidEmail(email) || !completedAt || !amountCents) {
      return;
    }

    const donationId = String(row[0] || "").trim();
    const receiptId = String(row[6] || "").trim();
    const sessionId = getNoteValue(segments, "Stripe Session");
    const identifiers = [
      donationId ? `donation:${donationId}` : "",
      receiptId ? `receipt:${receiptId}` : "",
      sessionId ? `session:${sessionId}` : "",
    ].filter(Boolean);
    if (!identifiers.length || identifiers.some((identifier) => seenIdentifiers.has(identifier))) {
      return;
    }
    identifiers.forEach((identifier) => seenIdentifiers.add(identifier));

    eligible.push({
      displayName,
      email,
      amountCents,
      cause: sanitizeCause(row[4]),
      donatedAt: completedAt.iso,
      donatedAtTimestamp: completedAt.timestamp,
      sortIdentifier: donationId || receiptId || sessionId,
    });
  });

  return eligible;
};

const createPublicLeaderboard = (rows, tabName) => {
  const donations = getEligibleDonations(rows);
  const donors = new Map();

  donations.forEach((donation) => {
    const current = donors.get(donation.email) || {
      displayName: donation.displayName,
      totalCents: 0,
      donationCount: 0,
      latestTimestamp: 0,
      latestSortIdentifier: "",
    };
    current.totalCents += donation.amountCents;
    current.donationCount += 1;
    if (donation.donatedAtTimestamp > current.latestTimestamp
      || (donation.donatedAtTimestamp === current.latestTimestamp
        && donation.sortIdentifier.localeCompare(current.latestSortIdentifier) > 0)) {
      current.displayName = donation.displayName;
      current.latestTimestamp = donation.donatedAtTimestamp;
      current.latestSortIdentifier = donation.sortIdentifier;
    }
    donors.set(donation.email, current);
  });

  const top = [...donors.values()]
    .sort((left, right) => right.totalCents - left.totalCents
      || right.latestTimestamp - left.latestTimestamp
      || left.displayName.localeCompare(right.displayName, "en", { sensitivity: "base" }))
    .slice(0, 10)
    .map((donor, index) => ({
      rank: index + 1,
      display_name: donor.displayName,
      total_usd: Number((donor.totalCents / 100).toFixed(2)),
      donation_count: donor.donationCount,
    }));

  const recent = [...donations]
    .sort((left, right) => right.donatedAtTimestamp - left.donatedAtTimestamp
      || right.sortIdentifier.localeCompare(left.sortIdentifier))
    .slice(0, 10)
    .map((donation) => ({
      display_name: donation.displayName,
      amount_usd: Number((donation.amountCents / 100).toFixed(2)),
      cause: donation.cause,
      donated_at: donation.donatedAt,
    }));

  const periodMatch = String(tabName || "").match(/\b(20\d{2})\b/);
  return {
    generated_at: new Date().toISOString(),
    period: periodMatch?.[1] || String(new Date().getUTCFullYear()),
    top,
    recent,
  };
};

const getCacheKey = (request) => {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return new Request(url.toString(), { method: "GET" });
};

export const onRequestGet = async (context) => {
  const { request, env } = context;
  const cache = globalThis.caches?.default;
  const cacheKey = getCacheKey(request);

  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    if (!env.OWR_GOOGLE_SHEET_ID) {
      throw new Error("Google Sheet is not configured.");
    }
    const tabName = env.OWR_GOOGLE_SHEET_TAB || "Donations (2026)";
    const accessToken = await getGoogleAccessToken(env);
    const rows = await getSheetRows(env, accessToken, tabName);
    const response = json(createPublicLeaderboard(rows, tabName), 200, PUBLIC_CACHE_CONTROL);

    if (cache && typeof context.waitUntil === "function") {
      context.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  } catch (error) {
    console.error("One World Relief supporter board unavailable", error instanceof Error ? error.message : "Unknown error");
    return json({ detail: "Supporter board is temporarily unavailable." }, 503, "no-store");
  }
};
