// Author: Fahadbin Alam (fma52), 4/19/26
// Mod by Codex, 4/23/26
// From One World Relief donation backend integration and multi-page project rendering, 4/23/26
(function () {
  const API_BASE = (window.ONE_WORLD_RELIEF_API_BASE || window.location.origin).replace(/\/$/, "");
  const donationForm = document.getElementById("donationForm");
  const quickDonationForm = document.getElementById("quickDonationForm");
  const contactForm = document.getElementById("contactForm");
  const statusEl = document.getElementById("donationStatus");
  const donateButton = donationForm ? donationForm.querySelector(".donate-button") : null;
  const projectBoard = document.getElementById("projectBoard");
  const projectStats = document.getElementById("projectStats");

  const escapeHtml = (value) => {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const formatMoney = (value) => {
    return `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const formatProjectCount = (count) => {
    return `${count} ${count === 1 ? "project" : "projects"}`;
  };

  const renderProjects = () => {
    if (!projectBoard || !Array.isArray(window.ONE_WORLD_RELIEF_PROJECTS)) {
      return;
    }

    if (projectStats) {
      const completed = window.ONE_WORLD_RELIEF_PROJECTS.filter((project) => {
        return String(project.status || "").toLowerCase().includes("completed");
      }).length;
      const active = window.ONE_WORLD_RELIEF_PROJECTS.length - completed;
      projectStats.innerHTML = `
        <span>${formatProjectCount(window.ONE_WORLD_RELIEF_PROJECTS.length)}</span>
        <span>${completed} completed</span>
        <span>${active} active</span>
      `;
    }

    projectBoard.innerHTML = window.ONE_WORLD_RELIEF_PROJECTS.map((project) => {
      const title = escapeHtml(project.title);
      const category = escapeHtml(project.category);
      const status = escapeHtml(project.status);
      const location = escapeHtml(project.location);
      const date = escapeHtml(project.date);
      const amountRaised = escapeHtml(project.amountRaised);
      const impact = escapeHtml(project.impact);
      const summary = escapeHtml(project.summary);
      const update = escapeHtml(project.update);
      const mediaLabel = escapeHtml(project.mediaLabel || "View update");
      const thumbnailUrl = escapeHtml(project.thumbnailUrl);
      const mediaUrl = escapeHtml(project.mediaUrl || "#");
      const donationUrl = escapeHtml(project.donationUrl || "donate.html#donationForm");
      const goal = Number(project.goalAmount || 0);
      const raised = Number(project.raisedAmount || 0);
      const progressHtml = goal > 0
        ? (() => {
            const percent = Math.min(100, Math.round((raised / goal) * 100));
            const remaining = Math.max(0, goal - raised);
            return `
              <div class="project-progress" role="group" aria-label="Fundraising progress">
                <div class="project-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${raised}">
                  <span style="width: ${percent}%"></span>
                </div>
                <div class="project-progress-meta">
                  <strong>${formatMoney(raised)} raised</strong>
                  <span>${percent}% of ${formatMoney(goal)}${remaining > 0 ? ` &middot; ${formatMoney(remaining)} to go` : " &middot; Fully funded"}</span>
                </div>
              </div>
            `;
          })()
        : "";
      const donateLabel = goal > 0 && raised < goal ? "Fund this project" : "Donate";

      return `
        <article class="project-card">
          <a class="project-media" href="${mediaUrl}" target="_blank" rel="noreferrer" aria-label="${mediaLabel} for ${title}">
            <img src="${thumbnailUrl}" alt="${title}" loading="lazy" />
            <span>${mediaLabel}</span>
          </a>
          <div class="project-meta">
            <span>${category}</span>
            <span>${status}</span>
          </div>
          <div>
            <h3>${title}</h3>
            <p>${location}${date ? ` &middot; ${date}` : ""}</p>
          </div>
          <p>${summary}</p>
          <div class="project-impact">
            <strong>${amountRaised}</strong>
            <span>${impact}</span>
          </div>
          ${progressHtml}
          <p class="project-update">${update}</p>
          <div class="project-actions">
            <a class="button button-primary" href="${donationUrl}">${donateLabel}</a>
            <a class="button button-outline" href="${mediaUrl}" target="_blank" rel="noreferrer">${mediaLabel}</a>
          </div>
        </article>
      `;
    }).join("");
  };

  renderProjects();

  if (quickDonationForm) {
    quickDonationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const customAmount = Number(document.getElementById("quickCustomAmount")?.value || 0);
      const amount = customAmount > 0
        ? String(customAmount)
        : quickDonationForm.querySelector('input[name="quickAmount"]:checked')?.value || "25";
      const campaign = document.getElementById("quickCampaign")?.value || "General Fund";
      const frequency = quickDonationForm.querySelector('input[name="quickFrequency"]:checked')?.value || "once";
      const params = new URLSearchParams({ amount, campaign, frequency });
      window.location.href = `donate.html?${params.toString()}#donationForm`;
    });
  }

  if (contactForm) {
    contactForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = document.getElementById("nameField")?.value.trim() || "";
      const email = document.getElementById("emailField")?.value.trim() || "";
      const message = document.getElementById("messageField")?.value.trim() || "";
      const subject = encodeURIComponent("One World Relief question");
      const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
      window.location.href = `mailto:Oneworldrelief.fma@gmail.com?subject=${subject}&body=${body}`;
    });
  }

  if (!donationForm || !statusEl || !donateButton) {
    return;
  }

  const campaignSelect = document.getElementById("campaignSelect");
  const customInput = document.getElementById("customDonation");
  const impactLine = document.getElementById("impactLine");
  const impactList = document.getElementById("impactList");
  const projectTag = document.getElementById("projectTag");
  const coverFees = document.getElementById("coverFees");
  const feeAmountEl = document.getElementById("feeAmount");
  const dedicationInput = document.getElementById("dedication");
  let selectedProject = "";

  const applyDonationParams = () => {
    const params = new URLSearchParams(window.location.search);
    const amount = params.get("amount");
    const campaign = params.get("campaign");
    const project = params.get("project");
    const frequency = params.get("frequency");

    if (frequency === "monthly") {
      const monthlyRadio = donationForm.querySelector('input[name="frequency"][value="monthly"]');
      if (monthlyRadio) {
        monthlyRadio.checked = true;
      }
    }

    if (project && projectTag) {
      selectedProject = project;
      projectTag.textContent = `Your gift will go to: ${project}`;
      projectTag.hidden = false;
    }

    if (amount) {
      const amountRadio = donationForm.querySelector(`input[name="amount"][value="${amount}"]`);
      if (amountRadio) {
        amountRadio.checked = true;
      } else {
        const customInput = document.getElementById("customDonation");
        if (customInput) {
          customInput.value = amount;
        }
      }
    }

    if (campaignSelect && campaign) {
      const option = Array.from(campaignSelect.options).find((item) => item.value === campaign);
      if (option) {
        campaignSelect.value = campaign;
      }
    }
  };

  applyDonationParams();

  const getDonationAmount = () => {
    const customValue = customInput ? Number(customInput.value) : 0;
    if (customValue > 0) {
      return customValue;
    }
    const selected = donationForm.querySelector('input[name="amount"]:checked');
    return selected ? Number(selected.value) : 0;
  };

  const getFrequency = () => {
    return donationForm.querySelector('input[name="frequency"]:checked')?.value === "monthly" ? "monthly" : "once";
  };

  // Stripe US card pricing: 2.9% + $0.30. Gross-up so the project receives the full gift.
  const estimateFee = (amount) => {
    if (!amount || amount <= 0) {
      return 0;
    }
    return Math.round(((amount + 0.3) / (1 - 0.029) - amount) * 100) / 100;
  };

  const impactFor = (campaign, amount) => {
    const table = (window.ONE_WORLD_RELIEF_IMPACT || {})[campaign] || (window.ONE_WORLD_RELIEF_IMPACT || {})["General Fund"];
    if (!table) {
      return "";
    }
    const tiers = Object.keys(table).map(Number).sort((a, b) => a - b);
    let match = tiers[0];
    tiers.forEach((tier) => {
      if (amount >= tier) {
        match = tier;
      }
    });
    if (!match || amount < tiers[0]) {
      return "";
    }
    const multiple = Math.floor(amount / match);
    const prefix = multiple > 1 && match === tiers[tiers.length - 1] ? `${multiple}x: ` : "";
    return `${prefix}${table[match]}`;
  };

  const refreshDonationUi = () => {
    const amount = getDonationAmount();
    const campaign = campaignSelect?.value || "General Fund";
    const monthly = getFrequency() === "monthly";
    const fee = estimateFee(amount);
    const total = coverFees?.checked ? Math.round((amount + fee) * 100) / 100 : amount;

    if (feeAmountEl) {
      feeAmountEl.textContent = `$${fee.toFixed(2)}`;
    }

    if (impactLine) {
      const line = amount > 0 ? impactFor(campaign, amount) : "";
      impactLine.textContent = line ? `$${amount}${monthly ? " a month" : ""} ${line}.` : "";
    }

    if (impactList) {
      const table = (window.ONE_WORLD_RELIEF_IMPACT || {})[campaign];
      if (table) {
        impactList.innerHTML = Object.keys(table)
          .map(Number)
          .sort((a, b) => a - b)
          .map((tier) => `<li><strong>$${tier}</strong> ${escapeHtml(table[tier])}.</li>`)
          .join("");
      }
    }

    donateButton.textContent = amount > 0
      ? `Donate $${Number.isInteger(total) ? total : total.toFixed(2)}${monthly ? " monthly" : ""}`
      : "Complete Donation";
  };

  donationForm.addEventListener("change", refreshDonationUi);
  donationForm.addEventListener("input", refreshDonationUi);
  donationForm.querySelectorAll('input[name="amount"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (customInput) {
        customInput.value = "";
      }
      refreshDonationUi();
    });
  });

  const setStatus = (message, isError) => {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  };


  donationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("", false);

    const donorName = document.getElementById("donorName").value.trim();
    const donorEmail = document.getElementById("donorEmail").value.trim();
    const campaign = campaignSelect?.value || "General Fund";
    const amountUsd = getDonationAmount();
    const frequency = getFrequency();
    const feeUsd = coverFees?.checked ? estimateFee(amountUsd) : 0;
    const dedication = dedicationInput?.value.trim() || "";

    if (!donorName || !donorEmail) {
      setStatus("Please enter your name and email.", true);
      return;
    }
    if (!amountUsd || amountUsd <= 0) {
      setStatus("Please select or enter a valid donation amount.", true);
      return;
    }
    if (amountUsd > 10000) {
      setStatus("For gifts over $10,000, please email Oneworldrelief.fma@gmail.com so we can arrange it directly.", true);
      return;
    }

    donateButton.disabled = true;
    donateButton.textContent = "Preparing checkout...";

    try {
      const response = await fetch(`${API_BASE}/charity/donations/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donor_name: donorName,
          donor_email: donorEmail,
          amount_usd: amountUsd,
          fee_usd: feeUsd,
          frequency,
          dedication,
          project: selectedProject,
          payment_method: "stripe",
          campaign,
        }),
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch (_err) {
        payload = {};
      }

      if (!response.ok) {
        const errMessage =
          payload.detail ||
          (response.status === 405
            ? "Cloudflare checkout is not deployed on this route yet. Please redeploy the OneWorldRelief-Website project."
            : "Secure checkout could not be started. Please try again.");
        throw new Error(errMessage);
      }

      if (payload.redirect_url) {
        setStatus("Redirecting to secure payment...", false);
        window.location.href = payload.redirect_url;
        return;
      }

      setStatus(
        `Donation request saved (#${payload.donation_id}). We will issue your receipt after payment confirmation.`,
        false
      );
    } catch (error) {
      const fallbackMessage =
        window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
          ? "Cloudflare checkout is not connected yet for this deploy."
          : "Payment checkout failed. Make sure the backend is running and Stripe keys are configured.";
      setStatus(error.message || fallbackMessage, true);
    } finally {
      donateButton.disabled = false;
      refreshDonationUi();
    }
  });

  refreshDonationUi();
})();
