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

const frequencyLabels = {
  one_time: "One-time donation",
  monthly: "Monthly donation",
  weekly_jummah: "Weekly Jummah donation",
};

const donationPrograms = {
  unrestricted: {
    id: "unrestricted",
    campaign: "General Fund",
    label: "Where Needed Most",
    purposeSummary: "Flexible support directed to One World Relief's most urgent verified charitable need.",
    amountRule: "minimum",
    minCents: 500,
  },
  orphan_annual: {
    id: "orphan_annual",
    campaign: "Orphan Annual Support",
    label: "Orphan Annual Support",
    purposeSummary: "A $300 gift designated toward one year of food and education support for an orphan.",
    amountRule: "fixed",
    fixedCents: 30000,
  },
  mosque_build: {
    id: "mosque_build",
    campaign: "Mosque Construction",
    label: "Mosque Construction Support",
    purposeSummary: "A $1,000 gift that helps fund verified mosque construction or completion needs.",
    amountRule: "fixed",
    fixedCents: 100000,
  },
  water_support: {
    id: "water_support",
    campaign: "Water Support",
    label: "Water Support",
    purposeSummary: "Support for approved clean-water access and community water projects.",
    amountRule: "range",
    minCents: 35000,
    maxCents: 300000,
  },
  orphan_feeding: {
    id: "orphan_feeding",
    campaign: "Orphan Feeding",
    label: "Orphan Feeding",
    purposeSummary: "Meal and food support for orphan students through verified feeding programs.",
    amountRule: "minimum",
    minCents: 10000,
  },
  family_recovery: {
    id: "family_recovery",
    campaign: "Family Recovery",
    label: "Family Recovery and Livelihood Support",
    purposeSummary: "A $600 gift that helps a verified family recover through assessed medical, household, or livelihood needs.",
    amountRule: "fixed",
    fixedCents: 60000,
  },
  emergency_aid: {
    id: "emergency_aid",
    campaign: "Emergency Aid",
    label: "Emergency Aid",
    purposeSummary: "Rapid support for verified emergencies such as floods and other urgent relief needs.",
    amountRule: "minimum",
    minCents: 2500,
  },
  zakat: {
    id: "zakat",
    campaign: "Zakat",
    label: "Zakat",
    purposeSummary: "Zakat designated for eligible, verified charitable needs.",
    amountRule: "minimum",
    minCents: 500,
  },
};

const zakatContextKeys = ["version", "language", "year_basis", "nisab_basis"];

const zakatLanguageLabels = {
  en: "English",
  bn: "Bangla",
  ur: "Urdu",
  ar: "Arabic",
};

const zakatYearBasisDetails = {
  hijri: { label: "Hijri year", rate: "2.5%" },
  solar: { label: "Solar year", rate: "2.577%" },
};

const zakatNisabBasisLabels = {
  gold: "Gold",
  silver: "Silver",
  custom: "Custom",
};

const parseZakatContext = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Please use a valid Zakat calculator context." };
  }

  const suppliedKeys = Object.keys(value);
  if (suppliedKeys.length !== zakatContextKeys.length
    || suppliedKeys.some((key) => !zakatContextKeys.includes(key))) {
    return { error: "Please use a valid Zakat calculator context." };
  }

  if (zakatContextKeys.some((key) => typeof value[key] !== "string")) {
    return { error: "Please use a valid Zakat calculator context." };
  }

  const version = value.version;
  const language = value.language;
  const yearBasis = value.year_basis;
  const nisabBasis = value.nisab_basis;
  const languageLabel = zakatLanguageLabels[language];
  const yearBasisDetails = zakatYearBasisDetails[yearBasis];
  const nisabBasisLabel = zakatNisabBasisLabels[nisabBasis];

  if (version !== "owr-zakat-v1" || !languageLabel || !yearBasisDetails || !nisabBasisLabel) {
    return { error: "Please use a valid Zakat calculator context." };
  }

  return {
    context: {
      calculator: "One World Relief Zakat Calculator",
      version,
      language: languageLabel,
      yearBasis: yearBasisDetails.label,
      rate: yearBasisDetails.rate,
      nisabBasis: nisabBasisLabel,
      summary: `${version} | ${languageLabel} | ${yearBasisDetails.label} ${yearBasisDetails.rate} | ${nisabBasisLabel} nisab`,
    },
  };
};

const waterProgramVariants = {
  water_station: {
    id: "water_station",
    label: "Filtered Water Station",
    purposeSummary: "A $350 gift that helps fund a filtered water cooler or station for hot-weather drinking water.",
    amountRule: "fixed",
    fixedCents: 35000,
  },
  water_contribution: {
    id: "water_contribution",
    label: "Water Project Contribution",
    amountRule: "range",
    minCents: 35000,
    maxCents: 300000,
  },
  community_well: {
    id: "community_well",
    label: "Community Well Support",
    purposeSummary: "A $3,000 gift that helps fund a verified community well project.",
    amountRule: "fixed",
    fixedCents: 300000,
  },
};

const legacyCampaignAliases = {
  "general fund": "unrestricted",
  "where needed most": "unrestricted",
  "where it's needed most": "unrestricted",
  "orphan annual support": "orphan_annual",
  "orphan support": "orphan_annual",
  "hafiz student support": "orphan_annual",
  "orphan education": "orphan_annual",
  "mosque construction": "mosque_build",
  "mosque construction support": "mosque_build",
  "mosque tiles": "mosque_build",
  "mosque gate": "mosque_build",
  "water support": "water_support",
  wells: "water_support",
  "madrasa water": "water_support",
  "orphan feeding": "orphan_feeding",
  feeding: "orphan_feeding",
  "feeding madrasa for orphan kids": "orphan_feeding",
  "family recovery": "family_recovery",
  "family recovery and livelihood support": "family_recovery",
  "father's business support": "family_recovery",
  "emergency aid": "emergency_aid",
  "emergency relief": "emergency_aid",
  "flood relief": "emergency_aid",
  zakat: "zakat",
};

const normalizeProgramToken = (value) => {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
};

const normalizeCampaignAlias = (value) => {
  return String(value || "").trim().toLowerCase().replace(/\u2019/g, "'").replace(/\s+/g, " ");
};

const formatUsdFromCents = (amountCents) => {
  const amount = amountCents / 100;
  return `$${Number.isInteger(amount) ? amount.toLocaleString("en-US") : amount.toFixed(2)}`;
};

const getAmountRuleError = (program, amountCents) => {
  if (program.amountRule === "fixed" && amountCents !== program.fixedCents) {
    return `${program.label} requires a ${formatUsdFromCents(program.fixedCents)} donation.`;
  }

  if (program.amountRule === "minimum" && amountCents < program.minCents) {
    return `${program.label} donations must be at least ${formatUsdFromCents(program.minCents)}.`;
  }

  if (program.amountRule === "range" && (amountCents < program.minCents || amountCents > program.maxCents)) {
    return `${program.label} donations must be between ${formatUsdFromCents(program.minCents)} and ${formatUsdFromCents(program.maxCents)}.`;
  }

  return "";
};

const resolveWaterVariant = (requestedVariant, amountCents) => {
  let variantId = normalizeProgramToken(requestedVariant);
  if (!variantId) {
    variantId = amountCents === 35000
      ? "water_station"
      : amountCents === 300000
        ? "community_well"
        : "water_contribution";
  }

  return waterProgramVariants[variantId] || null;
};

const normalizeReferrerCase = (value) => {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  const match = normalized.match(/^case-?(\d{1,3})$/);
  return match ? `case-${match[1].padStart(3, "0")}` : "";
};

const normalizeGivingFrequency = (value) => {
  return String(value || "one_time").trim().toLowerCase().replace(/[-\s]+/g, "_");
};

const getRecurringInterval = (givingFrequency) => {
  if (givingFrequency === "monthly") {
    return "month";
  }

  if (givingFrequency === "weekly_jummah") {
    return "week";
  }

  return "";
};

const getNextFridayJummahAnchor = (now = new Date()) => {
  const target = new Date(now.getTime());
  const friday = 5;
  const day = target.getUTCDay();
  const daysUntilFriday = (friday - day + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysUntilFriday);
  target.setUTCHours(17, 30, 0, 0);

  if (target.getTime() <= now.getTime() + 5 * 60 * 1000) {
    target.setUTCDate(target.getUTCDate() + 7);
  }

  return Math.floor(target.getTime() / 1000);
};

const setFormMetadata = (form, prefix, metadata) => {
  Object.entries(metadata).forEach(([key, value]) => {
    form.set(`${prefix}[${key}]`, String(value ?? ""));
  });
};

const parseHttpsUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }
    url.hash = "";
    return url;
  } catch (_error) {
    return null;
  }
};

const getCheckoutRedirectBases = (requestUrl, env) => {
  const requestOrigin = new URL(requestUrl).origin;
  const fallbackSuccessUrl = new URL("/charity/thank-you", requestOrigin);
  const fallbackCancelUrl = new URL("/charity/cancelled", requestOrigin);
  const configuredPublicSite = parseHttpsUrl(env.OWR_PUBLIC_SITE_URL);
  const configuredSuccessUrl = parseHttpsUrl(env.OWR_SUCCESS_URL);
  const configuredCancelUrl = parseHttpsUrl(env.OWR_CANCEL_URL);

  let trustedConfiguredOrigin = configuredPublicSite?.origin || "";
  if (!trustedConfiguredOrigin && configuredSuccessUrl && configuredCancelUrl && configuredSuccessUrl.origin === configuredCancelUrl.origin) {
    trustedConfiguredOrigin = configuredSuccessUrl.origin;
  }

  if (!trustedConfiguredOrigin) {
    return {
      successUrl: configuredSuccessUrl?.origin === requestOrigin ? configuredSuccessUrl : fallbackSuccessUrl,
      cancelUrl: configuredCancelUrl?.origin === requestOrigin ? configuredCancelUrl : fallbackCancelUrl,
    };
  }

  if ((configuredSuccessUrl && configuredSuccessUrl.origin !== trustedConfiguredOrigin)
    || (configuredCancelUrl && configuredCancelUrl.origin !== trustedConfiguredOrigin)) {
    return { successUrl: fallbackSuccessUrl, cancelUrl: fallbackCancelUrl };
  }

  return {
    successUrl: configuredSuccessUrl || new URL("/charity/thank-you", trustedConfiguredOrigin),
    cancelUrl: configuredCancelUrl || new URL("/charity/cancelled", trustedConfiguredOrigin),
  };
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
  const amountCents = Math.round(amountUsd * 100);
  const paymentMethod = String(body.payment_method || "stripe").trim().toLowerCase().replace(/-/g, "_");
  const requestedCampaign = String(body.campaign || "General Fund").trim() || "General Fund";
  const requestedProgramId = normalizeProgramToken(body.program_id);
  const requestedProgramVariant = normalizeProgramToken(body.program_variant);
  const hasZakatContext = Object.prototype.hasOwnProperty.call(body, "zakat_context");
  const rawReferrerCase = String(body.referrer_case || "").trim();
  const referrerCase = normalizeReferrerCase(rawReferrerCase);
  const donorNote = String(body.donor_note || "").trim().slice(0, 180);
  const anonymousPublic = Boolean(body.anonymous_public);
  const givingFrequency = normalizeGivingFrequency(body.giving_frequency);
  const recurringInterval = getRecurringInterval(givingFrequency);
  const isRecurring = givingFrequency !== "one_time";

  if (donorName.length < 2 || !donorEmail.includes("@")) {
    return json({ detail: "Please enter a valid donor name and email." }, 400);
  }

  if (!frequencyLabels[givingFrequency]) {
    return json({ detail: "Please choose one-time, monthly, or weekly Friday giving." }, 400);
  }

  if (!Number.isFinite(amountUsd) || amountUsd < 5) {
    return json({ detail: "Donation amount must be at least $5." }, 400);
  }

  if (!Number.isSafeInteger(amountCents) || Math.abs(amountUsd * 100 - amountCents) > 0.000001) {
    return json({ detail: "Please enter a valid donation amount with no more than two decimal places." }, 400);
  }

  if (rawReferrerCase && !referrerCase) {
    return json({ detail: "Please use a valid project reference." }, 400);
  }

  const resolvedProgramId = requestedProgramId
    || legacyCampaignAliases[normalizeCampaignAlias(requestedCampaign)];
  const program = donationPrograms[resolvedProgramId];

  if (!program) {
    return json({ detail: requestedProgramId ? "Please choose a valid donation program." : "Please choose a valid donation destination." }, 400);
  }

  let zakatContext = null;
  if (hasZakatContext) {
    if (requestedProgramId !== "zakat" || program.id !== "zakat") {
      return json({ detail: "Zakat calculator context can only be used for a Zakat donation." }, 400);
    }

    const parsedZakatContext = parseZakatContext(body.zakat_context);
    if (parsedZakatContext.error) {
      return json({ detail: parsedZakatContext.error }, 400);
    }
    zakatContext = parsedZakatContext.context;
  }

  // The public catalog is one-time. Existing recurring integrations omit program_id
  // and continue to use an explicit legacy campaign alias with the global $5 minimum.
  if (isRecurring && requestedProgramId) {
    return json({ detail: "Catalog giving programs are currently available for one-time donations only." }, 400);
  }

  let programVariant = "";
  let programOptionLabel = "";
  let purposeSummary = program.purposeSummary;
  let stripeProgramLabel = program.label;
  let amountRuleTarget = program;

  if (program.id === "water_support" && !isRecurring) {
    const waterVariant = resolveWaterVariant(requestedProgramVariant, amountCents);
    if (!waterVariant) {
      return json({ detail: "Please choose a valid water-support option." }, 400);
    }
    programVariant = waterVariant.id;
    programOptionLabel = waterVariant.label;
    amountRuleTarget = waterVariant;
    purposeSummary = waterVariant.id === "water_contribution"
      ? `A ${formatUsdFromCents(amountCents)} gift that contributes to approved water work.`
      : waterVariant.purposeSummary;
    stripeProgramLabel = `${program.label} - ${waterVariant.label}`;
  } else if (requestedProgramVariant) {
    return json({ detail: "This donation program does not accept that option." }, 400);
  }

  if (!isRecurring) {
    const amountRuleError = getAmountRuleError(amountRuleTarget, amountCents);
    if (amountRuleError) {
      return json({ detail: amountRuleError }, 400);
    }
  }

  const campaign = program.campaign;

  const stripeMethods = ["stripe", "credit_card", "card", "apple_pay", "cash_app", "cashapp"];
  if (isRecurring && paymentMethod === "venmo") {
    return json({ detail: "Recurring donations use Stripe card checkout. Please choose Apple Pay, card, or Stripe Checkout." }, 400);
  }

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
      program_id: program.id,
      program_label: program.label,
      program_variant: programVariant,
      campaign,
      status: "external_redirect",
      redirect_url: redirectUrl.toString(),
      message: "Redirect donor to Venmo. Add this payment manually to the donation sheet after confirming it clears.",
    });
  }

  if (!stripeMethods.includes(paymentMethod)) {
    return json({ detail: "Please use Apple Pay, Cash App Pay, card, or Venmo." }, 400);
  }

  if (isRecurring && (paymentMethod === "cash_app" || paymentMethod === "cashapp")) {
    return json({ detail: "Recurring donations use Stripe card checkout. Please choose Apple Pay, card, or Stripe Checkout." }, 400);
  }

  const donationId = crypto.randomUUID();
  const redirectBases = getCheckoutRedirectBases(request.url, env);
  const successUrl = new URL(redirectBases.successUrl);
  successUrl.searchParams.set("donation_id", donationId);
  successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  const cancelUrl = new URL(redirectBases.cancelUrl);
  cancelUrl.searchParams.set("donation_id", donationId);

  const form = new URLSearchParams();
  form.set("mode", isRecurring ? "subscription" : "payment");
  form.set("submit_type", "donate");
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

  const metadata = {
    donation_id: donationId,
    source: "one-world-relief",
    campaign,
    program_id: program.id,
    program_label: program.label,
    program_variant: programVariant,
    program_option_label: programOptionLabel,
    purpose_summary: purposeSummary,
    referrer_case: referrerCase,
    donor_name: donorName,
    donor_email: donorEmail,
    donor_note: donorNote,
    anonymous_public: anonymousPublic ? "yes" : "no",
    giving_frequency: givingFrequency,
    recurring_interval: recurringInterval || "one_time",
    schedule_label: frequencyLabels[givingFrequency],
  };

  if (zakatContext) {
    Object.assign(metadata, {
      zakat_calculator: zakatContext.calculator,
      zakat_context_version: zakatContext.version,
      zakat_language: zakatContext.language,
      zakat_year_basis: zakatContext.yearBasis,
      zakat_rate: zakatContext.rate,
      zakat_nisab_basis: zakatContext.nisabBasis,
      zakat_summary: zakatContext.summary,
    });
  }

  setFormMetadata(form, "metadata", metadata);

  if (isRecurring) {
    form.set("payment_method_collection", "always");
    setFormMetadata(form, "subscription_data[metadata]", metadata);
    form.set("subscription_data[description]", `${frequencyLabels[givingFrequency]} for One World Relief - ${campaign}`);
    if (givingFrequency === "weekly_jummah") {
      form.set("subscription_data[billing_cycle_anchor]", String(getNextFridayJummahAnchor()));
      form.set("subscription_data[proration_behavior]", "none");
    }
  } else {
    setFormMetadata(form, "payment_intent_data[metadata]", metadata);
    form.set("payment_intent_data[receipt_email]", donorEmail);
  }

  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", String(amountCents));
  if (isRecurring) {
    form.set("line_items[0][price_data][recurring][interval]", recurringInterval);
  }
  form.set("line_items[0][price_data][product_data][name]", `One World Relief - ${stripeProgramLabel}`);
  form.set("line_items[0][price_data][product_data][description]", purposeSummary);

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
    program_id: program.id,
    program_label: program.label,
    program_variant: programVariant,
    program_option_label: programOptionLabel,
    campaign,
    giving_frequency: givingFrequency,
    status: "pending",
    redirect_url: payload.url,
    message: "Redirect donor to Stripe Checkout URL",
  });
};
