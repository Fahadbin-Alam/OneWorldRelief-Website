// One World Relief purpose-based one-time donation checkout.
(function () {
  const form = document.getElementById("donationForm");
  const programs = Array.isArray(window.ONE_WORLD_RELIEF_DONATION_PROGRAMS)
    ? window.ONE_WORLD_RELIEF_DONATION_PROGRAMS
    : [];

  if (!form || !programs.length) {
    return;
  }

  const API_BASE = (window.ONE_WORLD_RELIEF_API_BASE || window.location.origin).replace(/\/$/, "");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const status = document.getElementById("donationStatus");
  const submitButton = form.querySelector(".donate-button");
  const amountChoices = document.getElementById("donationAmountChoices");
  const customAmount = document.getElementById("customDonation");
  const customAmountField = customAmount?.closest("label");
  const minimumText = document.getElementById("minimumDonationText");
  const programSelect = document.getElementById("campaignSelect");
  const programIdInput = document.getElementById("selectedProgramId");
  const variantInput = document.getElementById("selectedProgramVariant");
  const referrerInput = document.getElementById("donationReferrerCase");
  const formTitle = document.getElementById("donationFormTitle");
  const summaryTitle = document.getElementById("selectedProgramTitle");
  const summaryAmount = document.getElementById("selectedProgramAmount");
  const summaryPurpose = document.getElementById("selectedProgramPurpose");
  const summaryStewardship = document.getElementById("selectedProgramStewardship");
  const programGrid = document.getElementById("donationProgramGrid");
  const donationSourceInput = document.getElementById("donationSource");
  const zakatContextVersionInput = document.getElementById("zakatContextVersion");
  const zakatContextLanguageInput = document.getElementById("zakatContextLanguage");
  const zakatContextYearInput = document.getElementById("zakatContextYearBasis");
  const zakatContextNisabInput = document.getElementById("zakatContextNisabBasis");
  const params = new URLSearchParams(window.location.search);
  const ZAKAT_HANDOFF_KEY = "owrZakatHandoff";
  let activeZakatContext = null;

  const getZakatHandoff = () => {
    if (params.get("source") !== "zakat-calculator" || params.get("program") !== "zakat") {
      try {
        sessionStorage.removeItem(ZAKAT_HANDOFF_KEY);
      } catch (_error) {
        // Direct giving still works when session storage is unavailable.
      }
      return null;
    }

    try {
      const parsed = JSON.parse(sessionStorage.getItem(ZAKAT_HANDOFF_KEY) || "null");
      const isValid = parsed
        && !Array.isArray(parsed)
        && Object.keys(parsed).length === 4
        && parsed.version === "owr-zakat-v1"
        && ["en", "bn", "ur", "ar"].includes(parsed.language)
        && ["hijri", "solar"].includes(parsed.year_basis)
        && ["gold", "silver", "custom"].includes(parsed.nisab_basis);
      return isValid ? parsed : null;
    } catch (_error) {
      return null;
    }
  };

  activeZakatContext = getZakatHandoff();
  if (activeZakatContext) {
    if (donationSourceInput) donationSourceInput.value = "zakat-calculator";
    if (zakatContextVersionInput) zakatContextVersionInput.value = activeZakatContext.version;
    if (zakatContextLanguageInput) zakatContextLanguageInput.value = activeZakatContext.language;
    if (zakatContextYearInput) zakatContextYearInput.value = activeZakatContext.year_basis;
    if (zakatContextNisabInput) zakatContextNisabInput.value = activeZakatContext.nisab_basis;
  }

  const legacyAliases = {
    "General Fund": "unrestricted",
    "Orphan Support": "orphan_annual",
    "Hafiz Student Support": "orphan_annual",
    "Orphan Education": "orphan_annual",
    Wells: "water_support",
    "Madrasa Water": "water_support",
    Feeding: "orphan_feeding",
    "Feeding Madrasa for Orphan Kids": "orphan_feeding",
    "Flood Relief": "emergency_aid",
    "Father's Business Support": "family_recovery",
    "Mosque Tiles": "mosque_build",
    "Mosque Gate": "mosque_build",
    Zakat: "zakat",
  };

  const formatUsd = (amount) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

  const getProgram = (value = "unrestricted") => {
    const requested = String(value || "unrestricted").trim();
    const normalized = legacyAliases[requested] || requested;
    return programs.find((program) => program.id === normalized || program.campaign === requested)
      || programs.find((program) => program.id === "unrestricted")
      || null;
  };

  const getVariant = (program, variantId) => {
    if (!program || !Array.isArray(program.variants)) {
      return null;
    }
    return program.variants.find((variant) => variant.id === variantId) || null;
  };

  const getDefaultVariant = (program) => {
    return Array.isArray(program?.variants) ? program.variants[0] || null : null;
  };

  const getAmountRule = (program, variant) => {
    if (variant && variant.id !== "water_contribution" && Number.isFinite(Number(variant.amount))) {
      const fixedAmount = Number(variant.amount);
      return {
        type: "fixed",
        min: fixedAmount,
        max: fixedAmount,
        defaultAmount: fixedAmount,
        presets: [fixedAmount],
      };
    }
    return {
      type: String(program.amountRule || "minimum"),
      min: Number(program.minAmount || 5),
      max: Number(program.maxAmount || 0),
      defaultAmount: Number(variant?.amount || program.defaultAmount || program.minAmount || 5),
      presets: Array.isArray(program.presets) ? program.presets.map(Number) : [],
    };
  };

  const isAllowedAmount = (program, variant, amount) => {
    const rule = getAmountRule(program, variant);
    if (!Number.isFinite(amount)) {
      return false;
    }
    if (rule.type === "fixed") {
      return amount === rule.min;
    }
    if (rule.type === "range") {
      return amount >= rule.min && amount <= rule.max;
    }
    return amount >= rule.min;
  };

  const amountError = (program, variant) => {
    const rule = getAmountRule(program, variant);
    if (rule.type === "fixed") {
      return `${program.title} is a fixed ${formatUsd(rule.min)} gift.`;
    }
    if (rule.type === "range") {
      return `Choose an amount from ${formatUsd(rule.min)} to ${formatUsd(rule.max)} for ${program.title}.`;
    }
    return `Enter at least ${formatUsd(rule.min)} for ${program.title}.`;
  };

  const setStatus = (message = "", isError = false) => {
    if (!status) {
      return;
    }
    status.textContent = message;
    status.classList.toggle("error", isError);
  };

  const populateProgramSelect = () => {
    if (!programSelect) {
      return;
    }
    programSelect.replaceChildren();

    const addOption = (parent, program) => {
      const option = document.createElement("option");
      option.value = program.id;
      option.textContent = program.shortLabel || program.title;
      parent.appendChild(option);
    };

    const unrestricted = getProgram("unrestricted");
    if (unrestricted) {
      addOption(programSelect, unrestricted);
    }

    const purposeGroup = document.createElement("optgroup");
    purposeGroup.label = "Purpose-based giving";
    programs.filter((program) => program.featured === true).forEach((program) => addOption(purposeGroup, program));
    programSelect.appendChild(purposeGroup);

    const otherGroup = document.createElement("optgroup");
    otherGroup.label = "Other giving";
    programs.filter((program) => program.featured !== true && program.id !== "unrestricted")
      .forEach((program) => addOption(otherGroup, program));
    if (otherGroup.children.length) {
      programSelect.appendChild(otherGroup);
    }
  };

  const renderAmountChoices = (program, variant, requestedAmount) => {
    if (!amountChoices || !customAmount || !customAmountField) {
      return;
    }
    const rule = getAmountRule(program, variant);
    const requested = Number(requestedAmount);
    const activeAmount = isAllowedAmount(program, variant, requested) ? requested : rule.defaultAmount;
    const presets = rule.presets.filter((amount, index, values) => {
      return Number.isFinite(amount)
        && amount >= rule.min
        && (!rule.max || amount <= rule.max)
        && values.indexOf(amount) === index;
    });
    const matchesPreset = presets.includes(activeAmount);

    amountChoices.replaceChildren();
    const legend = document.createElement("legend");
    legend.className = "sr-only";
    legend.textContent = "Select an amount";
    amountChoices.appendChild(legend);

    presets.forEach((amount) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      const value = document.createElement("strong");
      input.type = "radio";
      input.name = "amount";
      input.value = String(amount);
      input.checked = matchesPreset && amount === activeAmount;
      value.textContent = formatUsd(amount);
      label.append(input, value);
      amountChoices.appendChild(label);
    });

    const isFixed = rule.type === "fixed";
    customAmountField.hidden = isFixed;
    customAmount.readOnly = isFixed;
    customAmount.min = String(rule.min);
    if (rule.max) {
      customAmount.max = String(rule.max);
    } else {
      customAmount.removeAttribute("max");
    }
    customAmount.placeholder = rule.type === "range"
      ? `${formatUsd(rule.min)}–${formatUsd(rule.max)}`
      : `Enter ${formatUsd(rule.min)} or more`;
    customAmount.value = !isFixed && !matchesPreset ? String(activeAmount) : "";
    customAmount.removeAttribute("aria-invalid");

    if (minimumText) {
      minimumText.textContent = rule.type === "fixed"
        ? `This purpose is a fixed ${formatUsd(rule.min)} gift.`
        : rule.type === "range"
          ? `Choose from ${formatUsd(rule.min)} to ${formatUsd(rule.max)}.`
          : `Minimum for this purpose is ${formatUsd(rule.min)}.`;
    }
  };

  const updateSummary = (program, variant) => {
    const rule = getAmountRule(program, variant);
    if (summaryTitle) {
      summaryTitle.textContent = program.title;
    }
    if (summaryAmount) {
      summaryAmount.textContent = variant?.label
        || (rule.type === "fixed" ? formatUsd(rule.min) : program.amountLabel);
    }
    if (summaryPurpose) {
      summaryPurpose.textContent = variant?.description
        ? `${program.purposeSummary} ${variant.description}`
        : program.purposeSummary;
    }
    if (summaryStewardship) {
      const languageLabels = { en: "English", bn: "Bangla", ur: "Urdu", ar: "Arabic" };
      const yearLabels = { hijri: "Hijri year · 2.5%", solar: "solar year · 2.577%" };
      const nisabLabels = { gold: "gold nisab", silver: "silver nisab", custom: "custom nisab" };
      const calculatorContext = program.id === "zakat" && activeZakatContext
        ? ` Calculator estimate received: ${languageLabels[activeZakatContext.language]}, ${yearLabels[activeZakatContext.year_basis]}, ${nisabLabels[activeZakatContext.nisab_basis]}. Your asset and debt entries stayed on your device.`
        : "";
      summaryStewardship.textContent = `${program.stewardship || ""}${calculatorContext}`.trim();
      summaryStewardship.hidden = !summaryStewardship.textContent;
    }
    if (formTitle) {
      formTitle.textContent = program.id === "unrestricted"
        ? "Give any amount"
        : "Complete your purpose-based gift";
    }
  };

  const selectProgram = (programValue, options = {}) => {
    const program = getProgram(programValue);
    if (!program) {
      return;
    }
    const requestedAmount = Number(options.amount);
    let variant = getVariant(program, options.variant);
    if (!variant && program.id === "water_support" && Number.isFinite(requestedAmount)) {
      variant = requestedAmount === 350
        ? getVariant(program, "water_station")
        : requestedAmount === 3000
          ? getVariant(program, "community_well")
          : getVariant(program, "water_contribution");
    }
    variant = variant || getDefaultVariant(program);
    if (programIdInput) {
      programIdInput.value = program.id;
    }
    if (variantInput) {
      variantInput.value = variant?.id || "";
    }
    if (referrerInput && options.referrer !== undefined) {
      referrerInput.value = String(options.referrer || "").slice(0, 40);
    }
    if (programSelect) {
      programSelect.value = program.id;
    }
    updateSummary(program, variant);
    renderAmountChoices(program, variant, options.amount);
    setStatus();

    if (options.focus) {
      form.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
      window.setTimeout(() => formTitle?.focus({ preventScroll: true }), prefersReducedMotion ? 0 : 360);
    }
  };

  const createProgramAction = (program, variant = null) => {
    if (program.detailUrl && !variant) {
      const link = document.createElement("a");
      link.className = "donation-program-action";
      link.href = program.detailUrl;
      link.textContent = program.detailActionLabel || `Learn about ${program.title}`;
      return link;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "donation-program-action";
    if (variant?.id === "water_contribution") {
      button.classList.add("donation-program-action-secondary");
    }
    button.dataset.programChoice = program.id;
    button.dataset.programAmount = String(variant?.amount || program.defaultAmount);
    if (variant) {
      button.dataset.programVariant = variant.id;
    }
    button.textContent = variant?.label || `Choose this purpose — ${program.amountLabel}`;
    button.addEventListener("click", () => {
      selectProgram(program.id, {
        variant: variant?.id || "",
        amount: variant?.amount || program.defaultAmount,
        focus: true,
      });
    });
    return button;
  };

  const renderProgramGrid = () => {
    if (!programGrid) {
      return;
    }
    programGrid.replaceChildren();
    programs.filter((program) => program.featured === true).forEach((program) => {
      const card = document.createElement("article");
      card.className = "donation-program-card";

      const photo = document.createElement("figure");
      photo.className = "donation-program-photo";
      const image = document.createElement("img");
      image.src = program.imageUrl;
      image.alt = program.imageAlt;
      image.loading = "lazy";
      image.decoding = "async";
      const caption = document.createElement("figcaption");
      caption.textContent = program.photoContext;
      photo.append(image, caption);

      const copy = document.createElement("div");
      copy.className = "donation-program-copy";
      const amount = document.createElement("p");
      amount.className = "donation-program-amount";
      amount.textContent = program.amountLabel;
      const title = document.createElement("h3");
      title.textContent = program.title;
      const purpose = document.createElement("p");
      purpose.textContent = program.purposeSummary;
      copy.append(amount, title, purpose);

      if (program.stewardship) {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        const detailCopy = document.createElement("p");
        summary.textContent = "How this gift is attributed";
        detailCopy.textContent = program.stewardship;
        details.append(summary, detailCopy);
        copy.appendChild(details);
      }

      const actions = document.createElement("div");
      actions.className = "donation-program-actions";
      if (Array.isArray(program.variants) && program.variants.length) {
        program.variants.forEach((variant) => actions.appendChild(createProgramAction(program, variant)));
      } else {
        actions.appendChild(createProgramAction(program));
      }
      copy.appendChild(actions);
      card.append(photo, copy);
      programGrid.appendChild(card);
    });
  };

  const getDonationAmount = () => {
    if (customAmount?.value) {
      return Number(customAmount.value);
    }
    const selected = form.querySelector('input[name="amount"]:checked');
    return selected ? Number(selected.value) : 0;
  };

  populateProgramSelect();
  renderProgramGrid();

  amountChoices?.addEventListener("change", (event) => {
    if (event.target.matches('input[name="amount"]:checked') && customAmount) {
      customAmount.value = "";
      customAmount.removeAttribute("aria-invalid");
      setStatus();
    }
  });

  customAmount?.addEventListener("input", () => {
    if (customAmount.value) {
      form.querySelectorAll('input[name="amount"]').forEach((radio) => {
        radio.checked = false;
      });
    }
    const program = getProgram(programIdInput?.value);
    const variant = getVariant(program, variantInput?.value);
    const amount = Number(customAmount.value);
    customAmount.toggleAttribute(
      "aria-invalid",
      Boolean(customAmount.value) && !isAllowedAmount(program, variant, amount)
    );
  });

  programSelect?.addEventListener("change", () => {
    selectProgram(programSelect.value, { referrer: referrerInput?.value || "" });
  });

  selectProgram(params.get("program") || params.get("campaign") || "unrestricted", {
    variant: params.get("variant") || "",
    amount: params.get("amount"),
    referrer: params.get("referrer") || "",
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus();

    const donorName = document.getElementById("donorName")?.value.trim() || "";
    const donorEmail = document.getElementById("donorEmail")?.value.trim() || "";
    const program = getProgram(programIdInput?.value);
    const variant = getVariant(program, variantInput?.value);
    const amountUsd = getDonationAmount();
    const donorNote = document.getElementById("donorNote")?.value.trim() || "";
    const anonymous = Boolean(document.getElementById("anonymousDonation")?.checked);

    if (!donorName || !donorEmail) {
      setStatus("Please enter your name and email.", true);
      return;
    }
    if (!program || !isAllowedAmount(program, variant, amountUsd)) {
      setStatus(program ? amountError(program, variant) : "Please choose a valid donation purpose.", true);
      customAmount?.setAttribute("aria-invalid", "true");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Preparing checkout...";

    try {
      const checkoutData = {
        donor_name: donorName,
        donor_email: donorEmail,
        amount_usd: amountUsd,
        program_id: program.id,
        program_variant: variant?.id || "",
        referrer_case: referrerInput?.value || "",
        campaign: program.campaign,
        payment_method: "stripe",
        giving_frequency: "one_time",
        donor_note: donorNote,
        anonymous_public: anonymous,
      };
      if (program.id === "zakat" && activeZakatContext && donationSourceInput?.value === "zakat-calculator") {
        checkoutData.zakat_context = {
          version: activeZakatContext.version,
          language: activeZakatContext.language,
          year_basis: activeZakatContext.year_basis,
          nisab_basis: activeZakatContext.nisab_basis,
        };
      }
      const response = await fetch(`${API_BASE}/charity/donations/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutData),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "Secure checkout could not be started. Please try again.");
      }
      if (!payload.redirect_url) {
        throw new Error("Stripe did not return a secure checkout link. Please try again.");
      }
      setStatus("Redirecting to secure payment...");
      try {
        sessionStorage.removeItem(ZAKAT_HANDOFF_KEY);
      } catch (_error) {
        // Checkout is already ready to redirect.
      }
      window.location.href = payload.redirect_url;
    } catch (error) {
      setStatus(error.message || "Secure checkout could not be started. Please try again.", true);
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = 'Continue to secure checkout <span aria-hidden="true">&rarr;</span>';
    }
  });
})();
