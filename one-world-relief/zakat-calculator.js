/* One World Relief — private, English-only Zakat al-mal calculator.
 * Pure API: window.ONE_WORLD_RELIEF_ZAKAT_CALCULATOR (also globalThis in Node).
 * calculate({ assets: { cashSavings, goldSilver, investments, moneyOwed,
 *   businessAssets, otherAssets, cryptoAssets, retirementAssets },
 *   metalEntryMode: "value" | "weight", metals: { goldWeight, goldPurity,
 *   goldPricePerGram, silverWeight, silverPurity, silverPricePerGram },
 *   liabilities, debtTreatment: "dueNow" | "next12Months" | "none", zakatPaid,
 *   yearBasis: "hijri" | "solar", nisabBasis: "gold" | "silver" | "custom",
 *   nisabValue, weightStandard: "traditional" | "metric", hawl: "yes" | "no" | "unsure"
 * }) returns a frozen result with state, valid, errors, missing, totals, potentialZakat,
 * grossZakat and remainingZakat. Monetary fields accept plain numbers with <= 2 dp;
 * weights and spot prices accept <= 6 dp. Blank optional amounts mean zero.
 * calculateNisab(basis, value, standard) returns a USD amount, or null if invalid.
 * valueMetals({ mode, value, ...weightFields }) returns the separate metal values.
 * No financial entries are persisted or fetched. Only a donation amount in the
 * donation URL and the existing non-financial v1 context are passed to checkout.
 */
(function (global) {
  "use strict";

  const VERSION = "owr-zakat-engine-v2";
  const HANDOFF_VERSION = "owr-zakat-v1";
  const HANDOFF_KEY = "owrZakatHandoff";
  const MAX_AMOUNT = 1e12;
  const RATES = Object.freeze({ hijri: 0.025, solar: 0.02577 });
  const NISAB_STANDARDS = Object.freeze({
    traditional: Object.freeze({ gold: 87.48, silver: 612.36 }),
    metric: Object.freeze({ gold: 85, silver: 595 }),
  });
  const ASSET_IDS = Object.freeze([
    "cashSavings", "goldSilver", "investments", "moneyOwed", "businessAssets",
    "otherAssets", "cryptoAssets", "retirementAssets",
  ]);
  const ASSET_LABELS = Object.freeze({
    cashSavings: "Cash and savings", goldSilver: "Gold and silver",
    investments: "Shares and investments", moneyOwed: "Recoverable money owed to you",
    businessAssets: "Business assets", otherAssets: "Other zakatable assets",
    cryptoAssets: "Cryptocurrency", retirementAssets: "Zakatable retirement and pension amount",
  });
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const isBlank = (value) => value == null || (typeof value === "string" && value.trim() === "");
  const toCents = (number) => Math.round((number + Number.EPSILON * Math.max(1, number)) * 100);
  const roundCurrency = (number) => toCents(number) / 100;

  function parseAmount(value, precision = 2, required = false) {
    if (isBlank(value)) return { value: 0, missing: required, error: "" };
    if (!["string", "number"].includes(typeof value)) return { value: 0, error: "Enter a valid number." };
    const text = String(value).trim();
    const number = Number(text);
    if (!Number.isFinite(number) || number < 0 || number > MAX_AMOUNT) {
      return { value: 0, error: "Enter a positive number or zero, up to 1 trillion." };
    }
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return { value: 0, error: "Use digits and a decimal point, without commas or exponents." };
    const decimalPlaces = (text.split(".")[1] || "").length;
    if (decimalPlaces > precision) return { value: 0, error: `Use no more than ${precision} decimal places.` };
    if (required && number === 0) return { value: 0, error: "Enter a value greater than zero." };
    return { value: number, error: "" };
  }

  function calculateNisab(basis, value, standard = "traditional") {
    if (!["gold", "silver", "custom"].includes(basis)) return null;
    if (!hasOwn(NISAB_STANDARDS, standard)) return null;
    const amount = parseAmount(value, basis === "custom" ? 2 : 6, true);
    if (amount.error || amount.missing) return null;
    const threshold = basis === "custom" ? amount.value : amount.value * NISAB_STANDARDS[standard][basis];
    const rounded = roundCurrency(threshold);
    return rounded > 0 && threshold <= MAX_AMOUNT ? rounded : null;
  }

  function valueMetals(input = {}) {
    const errors = {};
    const missing = {};
    const mode = input.mode || "value";
    if (mode === "value") {
      const amount = parseAmount(input.value);
      if (amount.error) errors.goldSilver = amount.error;
      return Object.freeze({ value: roundCurrency(amount.value), goldValue: null, silverValue: null,
        valid: !Object.keys(errors).length, errors: Object.freeze(errors), missing: Object.freeze(missing) });
    }
    if (mode !== "weight") errors.metalEntryMode = "Choose a metal entry method.";
    let totalCents = 0;
    const values = {};
    for (const metal of ["gold", "silver"]) {
      const weightId = `${metal}Weight`;
      const priceId = `${metal}PricePerGram`;
      const purityId = `${metal}Purity`;
      const weight = parseAmount(input[weightId], 6);
      const price = parseAmount(input[priceId], 6, weight.value > 0);
      if (weight.error) errors[weightId] = weight.error;
      if (price.error) errors[priceId] = price.error;
      if (price.missing) missing[priceId] = `Enter a current pure ${metal} price per gram.`;
      const purity = Number(input[purityId] ?? (metal === "gold" ? 24 : 1));
      const allowed = metal === "gold" ? [24, 22, 21, 18, 14, 9] : [1, 0.925, 0.9, 0.8];
      if (!allowed.includes(purity)) errors[purityId] = `Choose the ${metal} purity.`;
      const factor = metal === "gold" ? purity / 24 : purity;
      const amount = weight.value * price.value * factor;
      if (!Number.isFinite(amount) || amount > MAX_AMOUNT) errors[weightId] = "This metal value exceeds the calculator's limit.";
      values[`${metal}Value`] = Number.isFinite(amount) && amount <= MAX_AMOUNT ? roundCurrency(amount) : 0;
      totalCents += toCents(values[`${metal}Value`]);
    }
    if (totalCents > MAX_AMOUNT * 100) errors.goldWeight = "The combined metal value exceeds the calculator's limit.";
    return Object.freeze({ value: totalCents <= MAX_AMOUNT * 100 ? totalCents / 100 : 0, ...values,
      valid: !Object.keys(errors).length && !Object.keys(missing).length,
      errors: Object.freeze(errors), missing: Object.freeze(missing) });
  }

  function calculate(input = {}) {
    const errors = {};
    const missing = {};
    const assets = {};
    const suppliedAssets = input.assets || {};
    let totalCents = 0;
    const mode = input.metalEntryMode || "value";
    const directMetals = Array.isArray(suppliedAssets) ? suppliedAssets[1] : suppliedAssets.goldSilver;
    const metalResult = valueMetals({ ...(input.metals || {}), mode, value: directMetals });
    Object.assign(errors, metalResult.errors);
    Object.assign(missing, metalResult.missing);
    ASSET_IDS.forEach((id, index) => {
      const parsed = id === "goldSilver" ? { value: metalResult.value } : parseAmount(
        Array.isArray(suppliedAssets) ? suppliedAssets[index] : suppliedAssets[id]
      );
      if (parsed.error) errors[id] = parsed.error;
      assets[id] = roundCurrency(parsed.value);
      totalCents += toCents(assets[id]);
    });
    if (totalCents > MAX_AMOUNT * 100) errors.cashSavings = "Your combined assets exceed the calculator's 1 trillion USD limit.";
    const totalAssets = totalCents <= MAX_AMOUNT * 100 ? totalCents / 100 : 0;

    const debtTreatment = input.debtTreatment || "dueNow";
    if (!["dueNow", "next12Months", "none"].includes(debtTreatment)) errors.debtTreatment = "Choose how to treat debts.";
    const debt = parseAmount(debtTreatment === "none" ? 0 : input.liabilities);
    if (debt.error) errors.shortTermLiabilities = debt.error;
    const liabilities = roundCurrency(debt.value);
    const netCents = Math.max(0, toCents(totalAssets) - toCents(liabilities));
    const netWealth = netCents / 100;
    const paid = parseAmount(input.zakatPaid);
    if (paid.error) errors.zakatPaid = paid.error;
    const paidZakat = roundCurrency(paid.value);
    const yearBasis = input.yearBasis || "hijri";
    if (!hasOwn(RATES, yearBasis)) errors.zakatYearBasis = "Choose a Zakat year.";
    const rate = RATES[yearBasis] || RATES.hijri;
    const standard = input.weightStandard || "traditional";
    if (!hasOwn(NISAB_STANDARDS, standard)) errors.zakatWeightStandard = "Choose a weight standard.";
    const basis = input.nisabBasis || "";
    const nisabField = basis === "custom" ? "zakatCustomNisab" : "zakatMetalPrice";
    if (!basis) missing.zakatNisabBasis = "Choose a nisab standard.";
    else if (!["gold", "silver", "custom"].includes(basis)) errors.zakatNisabBasis = "Choose a valid nisab standard.";
    if (["gold", "silver", "custom"].includes(basis)) {
      const thresholdInput = parseAmount(input.nisabValue, basis === "custom" ? 2 : 6, true);
      if (thresholdInput.error) errors[nisabField] = thresholdInput.error;
      if (thresholdInput.missing) missing[nisabField] = basis === "custom"
        ? "Enter a trusted current nisab threshold." : `Enter a current pure ${basis} price per gram.`;
    }
    const nisab = calculateNisab(basis, input.nisabValue, standard);
    if (basis && !errors[nisabField] && !missing[nisabField] && nisab === null && !errors.zakatNisabBasis && !errors.zakatWeightStandard) {
      errors[nisabField] = "The calculated nisab must be greater than zero and no more than 1 trillion USD.";
    }
    const hawl = input.hawl || "";
    if (!hawl) missing.zakatHawl = "Tell us whether your Zakat year has completed.";
    else if (!["yes", "no", "unsure"].includes(hawl)) errors.zakatHawl = "Choose a hawl answer.";
    const valid = !Object.keys(errors).length && !Object.keys(missing).length;
    const meetsNisab = nisab !== null && toCents(nisab) > 0 && netCents >= toCents(nisab);
    const potentialZakat = meetsNisab ? roundCurrency(netWealth * rate) : 0;
    const grossZakat = valid && hawl === "yes" ? potentialZakat : 0;
    const remainingZakat = Math.max(0, toCents(grossZakat) - toCents(paidZakat)) / 100;
    const potentialRemaining = Math.max(0, toCents(potentialZakat) - toCents(paidZakat)) / 100;
    const eligible = valid && meetsNisab && hawl === "yes";
    let state = "due";
    if (Object.keys(errors).length) state = "invalid";
    else if (Object.keys(missing).length) state = "missing";
    else if (!meetsNisab) state = "below-nisab";
    else if (hawl === "no") state = "not-due";
    else if (hawl !== "yes") state = "hawl-unconfirmed";
    else if (remainingZakat === 0) state = "already-paid";
    return Object.freeze({ state, valid, errors: Object.freeze(errors), missing: Object.freeze(missing),
      assets: Object.freeze(assets), totalAssets, liabilities, netWealth, nisab, yearBasis,
      nisabBasis: basis, weightStandard: standard, debtTreatment, hawl, metalEntryMode: mode,
      metalResult, rate, meetsNisab, eligible, potentialZakat, potentialRemaining, grossZakat,
      paidZakat, remainingZakat, zakatDue: remainingZakat,
      canDonate: eligible && remainingZakat >= 5 });
  }

  global.ONE_WORLD_RELIEF_ZAKAT_CALCULATOR = Object.freeze({ VERSION, HANDOFF_VERSION, RATES,
    NISAB_STANDARDS, NISAB_GRAMS: NISAB_STANDARDS.traditional, ASSET_IDS, MAX_AMOUNT,
    calculateNisab, calculate, valueMetals, getNisab: calculateNisab, calculateEstimate: calculate });

  if (typeof document === "undefined") return;
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  const form = document.getElementById("zakatCalculator");
  if (!form) return;
  const byId = (id) => document.getElementById(id);
  const valueOf = (id) => byId(id)?.value ?? "";
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const pricePerGram = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 });
  const usd = (amount) => amount === null ? "—" : money.format(amount);
  const panels = [...form.querySelectorAll("[data-step-panel]")];
  const stepButtons = [...document.querySelectorAll("[data-step-target]")];
  const touched = new Set();
  const stepNames = ["Setup", "Assets", "Deductions", "Result"];
  const fieldSteps = {
    zakatDueDate: 0, zakatYearBasis: 0, zakatHawl: 0, zakatNisabBasis: 0,
    zakatWeightStandard: 0, zakatMetalPrice: 0, zakatCustomNisab: 0,
    ...Object.fromEntries(ASSET_IDS.map((id) => [id, 1])),
    metalEntryMode: 1, goldWeight: 1, goldPurity: 1, goldPricePerGram: 1,
    silverWeight: 1, silverPurity: 1, silverPricePerGram: 1,
    debtTreatment: 2, shortTermLiabilities: 2, zakatPaid: 2,
  };
  let currentStep = 0;
  let completedStep = -1;
  let latestResult;
  let latestIssues = {};
  let announceTimer;
  let lastAnnouncement = "";

  function setText(id, text) { if (byId(id)) byId(id).textContent = text; }
  function localDate() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function formattedDate(value) {
    return validDate(value) ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    }) : "Choose a valuation date";
  }
  if (byId("zakatDueDate")) byId("zakatDueDate").value = localDate();

  function toggleFields(id, visible) {
    const wrapper = byId(id);
    if (!wrapper) return;
    wrapper.hidden = !visible;
    wrapper.querySelectorAll("input, select").forEach((field) => { field.disabled = !visible; });
  }
  function syncChoices() {
    setText("zakatSettingsSummary", `${formattedDate(valueOf("zakatDueDate"))} · ${valueOf("zakatYearBasis") === "solar" ? "Solar, 2.577%" : "Lunar, 2.5%"}`);
    const basis = valueOf("zakatNisabBasis");
    const isMetal = basis === "gold" || basis === "silver";
    toggleFields("zakatWeightStandardField", isMetal);
    toggleFields("zakatMetalPriceField", isMetal);
    toggleFields("zakatCustomNisabField", basis === "custom");
    setText("zakatMetalPriceLabel", `Current pure ${basis === "gold" ? "gold" : "silver"} price per gram`);
    const standard = NISAB_STANDARDS[valueOf("zakatWeightStandard")] || NISAB_STANDARDS.traditional;
    setText("nisabCalculationHelp", isMetal ? `${standard[basis]} g × your current pure ${basis} price = your nisab. The threshold is not deducted from your wealth.`
      : basis === "custom" ? "Use a current USD threshold from a scholar or Zakat authority you trust. The threshold is not deducted from your wealth."
        : "Choose the nisab method you follow. Metal prices are entered by you, not fetched automatically.");
    const weighted = valueOf("metalEntryMode") === "weight";
    toggleFields("metalDirectFields", !weighted);
    toggleFields("metalWeightFields", weighted);
    const treatment = valueOf("debtTreatment");
    const liabilityInput = byId("shortTermLiabilities");
    if (liabilityInput) liabilityInput.disabled = treatment === "none";
    setText("debtAmountLabel", treatment === "next12Months" ? "Eligible payments due in the next 12 months"
      : treatment === "none" ? "Debt deduction turned off" : "Eligible debts and bills due now");
    setText("debtAmountHelp", treatment === "none" ? "Your full zakatable assets will be used. Your entered debt amount is excluded."
      : treatment === "next12Months" ? "Enter only payments permitted by the guidance you follow, not your entire mortgage or long-term loan balance."
        : "Enter only qualifying debts already due on your valuation date. Debt deductions differ among scholars.");
  }

  function readCalculation() {
    return calculate({ assets: Object.fromEntries(ASSET_IDS.map((id) => [id, valueOf(id)])),
      metalEntryMode: valueOf("metalEntryMode") || "value",
      metals: Object.fromEntries(["goldWeight", "goldPurity", "goldPricePerGram", "silverWeight", "silverPurity", "silverPricePerGram"].map((id) => [id, valueOf(id)])),
      liabilities: valueOf("shortTermLiabilities"), debtTreatment: valueOf("debtTreatment") || "dueNow",
      zakatPaid: valueOf("zakatPaid"), yearBasis: valueOf("zakatYearBasis"),
      nisabBasis: valueOf("zakatNisabBasis"), weightStandard: valueOf("zakatWeightStandard") || "traditional",
      nisabValue: valueOf("zakatNisabBasis") === "custom" ? valueOf("zakatCustomNisab") : valueOf("zakatMetalPrice"),
      hawl: valueOf("zakatHawl") });
  }

  function displayError(id, message) {
    const field = byId(id);
    if (!field) return;
    let error = byId(`${id}Error`);
    if (!error && message) {
      error = document.createElement("p");
      error.id = `${id}Error`;
      error.className = "zakat-field-error";
      const container = field.closest(".zakat-money-input, .zakat-input-wrap");
      (container || field).insertAdjacentElement("afterend", error);
    }
    if (error) { error.textContent = message || ""; error.hidden = !message; }
    if (message) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
    const descriptions = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    if (message) descriptions.add(`${id}Error`);
    else descriptions.delete(`${id}Error`);
    if (descriptions.size) field.setAttribute("aria-describedby", [...descriptions].join(" "));
    else field.removeAttribute("aria-describedby");
  }

  function collectIssues(result) {
    const issues = { ...result.errors, ...result.missing };
    if (!validDate(valueOf("zakatDueDate"))) issues.zakatDueDate = "Choose a valid valuation date.";
    form.querySelectorAll("input[type='number']").forEach((field) => {
      if (field.disabled) return;
      if (field.validity?.badInput) issues[field.id] = "Enter a valid number.";
      else if (field.validity?.rangeOverflow) issues[field.id] = `Enter a value no greater than ${Number(field.max).toLocaleString("en-US")}.`;
    });
    return issues;
  }

  function renderReview(result) {
    const holder = byId("zakatReviewRows");
    if (!holder) return;
    const incomplete = Object.keys(latestIssues).length > 0;
    const rows = ASSET_IDS.filter((id) => result.assets[id] > 0).map((id) => [ASSET_LABELS[id], usd(result.assets[id])]);
    if (!rows.length) rows.push(["Assets entered", usd(0)]);
    rows.push(["Total zakatable assets", usd(result.totalAssets)],
      ["Eligible debt deduction", `− ${usd(result.liabilities)}`], ["Net zakatable wealth", usd(result.netWealth)],
      ["Nisab threshold", usd(result.nisab)], ["Year and rate", result.yearBasis === "solar" ? "Solar year · 2.577%" : "Lunar year · 2.5%"],
      ["Zakat year (hawl)", result.hawl === "yes" ? "Confirmed by you" : result.hawl === "no" ? "Not yet completed" : "Not confirmed"],
      ["Debt method", result.debtTreatment === "none" ? "No deduction" : result.debtTreatment === "next12Months" ? "Eligible payments in the next 12 months" : "Eligible amounts due now"],
      [result.hawl === "yes" ? "Estimated Zakat before payments" : "Conditional estimate before payments", usd(result.potentialZakat)],
      ["Already paid toward this Zakat year", `− ${usd(result.paidZakat)}`],
      [result.hawl === "yes" ? "Remaining estimated Zakat" : "Conditional remaining estimate", usd(result.hawl === "yes" ? result.remainingZakat : result.potentialRemaining)]);
    if (incomplete) rows.splice(0, rows.length,
      ["Calculation status", "Incomplete — finish the required details and correct invalid entries before using this estimate."],
      ["Estimated Zakat", "Not available from the current entries"]);
    const fragment = document.createDocumentFragment();
    for (const [label, value] of rows) {
      const group = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      group.append(term, detail);
      fragment.appendChild(group);
    }
    holder.replaceChildren(fragment);
    const weightDescription = NISAB_STANDARDS[result.weightStandard];
    setText("zakatReviewBasis", incomplete ? "Calculation incomplete — no reliable estimate"
      : result.nisabBasis === "custom" ? "Your trusted custom threshold"
      : weightDescription && ["gold", "silver"].includes(result.nisabBasis)
        ? `${result.nisabBasis === "gold" ? "Gold" : "Silver"} nisab · ${weightDescription[result.nisabBasis]} g · ${pricePerGram.format(Number(valueOf("zakatMetalPrice")) || 0)} per gram`
        : "Choose a nisab basis");
    setText("zakatReviewDate", formattedDate(valueOf("zakatDueDate")));
  }

  function render() {
    syncChoices();
    latestResult = readCalculation();
    latestIssues = collectIssues(latestResult);
    Object.keys(fieldSteps).forEach((id) => displayError(id, touched.has(id) ? latestIssues[id] : ""));
    const result = latestResult;
    const hasIssues = Object.keys(latestIssues).length > 0;
    let state = result.state;
    if (hasIssues && result.valid) state = "invalid";
    const conditional = state === "not-due" || state === "hawl-unconfirmed";
    const displayedAmount = conditional ? result.potentialRemaining : result.remainingZakat;
    setText("zakatResultsTitle", conditional ? "Planning estimate" : "Zakat remaining");
    const messages = {
      missing: "Choose your basis and complete the required details to see your estimate.",
      invalid: "Check the highlighted entries before using this estimate.",
      "below-nisab": "Your net wealth is below the selected nisab. No Zakat is estimated on these entries.",
      "not-due": "Your hawl is not complete. This is a potential estimate for when the conditions are met, not Zakat confirmed due now.",
      "hawl-unconfirmed": "Confirm your hawl with a trusted scholar. This amount is conditional and is not a confirmed obligation.",
      "already-paid": "Your entered payments cover this year's estimated Zakat. No amount remains in this calculation.",
      due: "Your entries meet the chosen nisab and you confirmed your hawl. This is your estimated amount still to pay.",
    };
    const resultBox = document.querySelector(".zakat-results");
    if (resultBox) resultBox.dataset.state = state;
    setText("zakatDueResult", hasIssues ? "—" : usd(displayedAmount));
    setText("zakatResultStatus", messages[state] || messages.missing);
    setText("totalAssetsResult", usd(result.totalAssets));
    setText("liabilitiesResult", usd(result.liabilities));
    setText("netWealthResult", usd(result.netWealth));
    setText("nisabResult", usd(result.nisab));
    setText("rateResult", `${result.yearBasis === "solar" ? "2.577" : "2.5"}%`);
    setText("grossZakatResult", hasIssues ? "—" : usd(result.potentialZakat));
    setText("paidZakatResult", usd(result.paidZakat));
    setText("metalValueResult", result.metalResult.valid ? usd(result.metalResult.value) : "Add the missing metal details");
    const ratio = result.nisab > 0 ? (result.netWealth / result.nisab) * 100 : 0;
    const meter = byId("zakatThresholdMeter");
    if (meter) { meter.max = 100; meter.value = Math.max(0, Math.min(100, ratio)); }
    setText("zakatThresholdText", hasIssues ? "Complete your basis to compare your wealth with nisab."
      : result.meetsNisab ? `${usd(result.netWealth - result.nisab)} above your selected nisab`
        : `${usd(result.nisab - result.netWealth)} below your selected nisab`);
    const canDonate = !hasIssues && result.canDonate && currentStep === 3;
    const donate = byId("donateCalculatedZakat");
    if (donate) {
      donate.setAttribute("aria-disabled", String(!canDonate));
      donate.classList.toggle("is-disabled", !canDonate);
      if (canDonate) donate.href = `donate.html?program=zakat&amount=${result.remainingZakat.toFixed(2)}&source=zakat-calculator#donationForm`;
      else donate.removeAttribute("href");
    }
    const minimum = byId("zakatMinimumNote");
    if (minimum) {
      minimum.hidden = !(result.eligible && !hasIssues && result.remainingZakat > 0 && result.remainingZakat < 5);
      minimum.textContent = "Your estimate is below our $5 checkout minimum. The minimum does not change your Zakat calculation.";
    }
    if (byId("printZakat")) byId("printZakat").disabled = hasIssues || currentStep !== 3;
    if (currentStep === 3) renderReview(result);
    global.clearTimeout(announceTimer);
    const announcement = `${messages[state]} ${hasIssues ? "" : `${conditional ? "Conditional estimate" : "Remaining estimate"}: ${usd(displayedAmount)}.`}`;
    announceTimer = global.setTimeout(() => {
      if (currentStep === 3 && announcement !== lastAnnouncement) {
        setText("zakatResultAnnouncement", announcement);
        lastAnnouncement = announcement;
      }
    }, 450);
  }

  function showStep(step, focus = false) {
    currentStep = Math.max(0, Math.min(3, step));
    form.dataset.review = String(currentStep === 3);
    const resultBox = document.querySelector(".zakat-results");
    if (resultBox) resultBox.hidden = currentStep !== 3;
    panels.forEach((panel) => {
      const active = Number(panel.dataset.stepPanel) === currentStep;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    stepButtons.forEach((button) => {
      const index = Number(button.dataset.stepTarget);
      button.disabled = false;
      button.classList.toggle("is-active", index === currentStep);
      button.classList.toggle("is-complete", index <= completedStep && index !== currentStep);
      if (index === currentStep) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    if (byId("zakatPrevious")) byId("zakatPrevious").hidden = currentStep === 0;
    if (byId("zakatNext")) {
      byId("zakatNext").hidden = currentStep === 3;
      byId("zakatNext").textContent = ["Continue to assets →", "Continue to deductions →", "See my result →"][currentStep] || "Continue";
    }
    setText("zakatStepLabel", `Step ${currentStep + 1} of 4 · ${stepNames[currentStep]}`);
    if (byId("zakatProgress")) { byId("zakatProgress").max = 4; byId("zakatProgress").value = currentStep + 1; }
    render();
    if (focus) {
      const panel = panels.find((item) => Number(item.dataset.stepPanel) === currentStep);
      const heading = currentStep === 3 ? byId("zakatResultsTitle") : panel?.querySelector("h2, h3, legend");
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      const reduced = global.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      form.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" });
    }
  }

  function navigate(target) {
    if (!Number.isInteger(target) || target < 0 || target > 3) return;
    if (target <= currentStep) { showStep(target, true); return; }
    render();
    const requiredIds = Object.keys(fieldSteps).filter((id) => fieldSteps[id] < target);
    requiredIds.forEach((id) => touched.add(id));
    const failed = requiredIds.find((id) => latestIssues[id]);
    if (failed) {
      completedStep = Math.min(completedStep, fieldSteps[failed] - 1);
      showStep(fieldSteps[failed]);
      const field = byId(failed);
      for (let ancestor = field?.parentElement; ancestor && ancestor !== form; ancestor = ancestor.parentElement) {
        if (ancestor.tagName === "DETAILS") ancestor.open = true;
      }
      field?.focus();
      return;
    }
    completedStep = Math.max(completedStep, target - 1);
    showStep(target, true);
  }

  form.addEventListener("input", (event) => {
    if (event.target.id) touched.add(event.target.id);
    completedStep = Math.min(completedStep, currentStep - 1);
    render();
  });
  form.addEventListener("change", (event) => {
    if (event.target.id) touched.add(event.target.id);
    completedStep = Math.min(completedStep, currentStep - 1);
    render();
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); if (currentStep < 3) navigate(currentStep + 1); });
  byId("zakatNext")?.addEventListener("click", () => navigate(currentStep + 1));
  byId("zakatPrevious")?.addEventListener("click", () => navigate(currentStep - 1));
  stepButtons.forEach((button) => button.addEventListener("click", () => navigate(Number(button.dataset.stepTarget))));
  form.addEventListener("reset", () => {
    try { global.sessionStorage.removeItem(HANDOFF_KEY); } catch (_error) { /* Storage is optional. */ }
    global.setTimeout(() => {
      form.querySelectorAll("input[type='number']").forEach((field) => { field.value = ""; });
      const defaults = { zakatYearBasis: "hijri", zakatHawl: "", zakatNisabBasis: "",
        zakatWeightStandard: "traditional", metalEntryMode: "value", goldPurity: "24", silverPurity: "1", debtTreatment: "dueNow" };
      Object.entries(defaults).forEach(([id, value]) => { if (byId(id)) byId(id).value = value; });
      if (byId("zakatDueDate")) byId("zakatDueDate").value = localDate();
      touched.clear(); completedStep = -1; lastAnnouncement = "";
      showStep(0, true);
    }, 0);
  });
  byId("printZakat")?.addEventListener("click", () => {
    render();
    if (currentStep === 3 && !Object.keys(latestIssues).length) global.print();
  });
  global.addEventListener?.("beforeprint", () => {
    render();
    renderReview(latestResult);
  });
  byId("donateCalculatedZakat")?.addEventListener("click", (event) => {
    render();
    if (currentStep !== 3 || Object.keys(latestIssues).length || !latestResult.canDonate) {
      event.preventDefault(); return;
    }
    const context = { version: HANDOFF_VERSION, language: "en", year_basis: latestResult.yearBasis, nisab_basis: latestResult.nisabBasis };
    try { global.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(context)); } catch (_error) { /* The chosen amount remains in the donation URL. */ }
  });
  showStep(0);
})(typeof window !== "undefined" ? window : globalThis);
