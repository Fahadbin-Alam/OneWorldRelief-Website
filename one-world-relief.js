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

  const isSafeHttpUrl = (value) => {
    if (!String(value || "").trim()) {
      return false;
    }
    try {
      const url = new URL(String(value || ""), window.location.href);
      // A bare site homepage (e.g. "https://www.youtube.com/") is a placeholder, not real media.
      return (url.protocol === "https:" || url.protocol === "http:") && url.pathname.length > 1;
    } catch (_error) {
      return false;
    }
  };

  const formatProjectCount = (count) => {
    return `${count} ${count === 1 ? "project" : "projects"}`;
  };

  const renderProjects = () => {
    if (!projectBoard || !Array.isArray(window.ONE_WORLD_RELIEF_PROJECTS)) {
      return;
    }

    if (projectStats) {
      // Count projects by their own status label so "Planned" work is not reported as "active".
      const statusCounts = new Map();
      window.ONE_WORLD_RELIEF_PROJECTS.forEach((project) => {
        const label = String(project.status || "Other").trim().toLowerCase();
        statusCounts.set(label, (statusCounts.get(label) || 0) + 1);
      });
      const statusChips = Array.from(statusCounts, ([label, count]) => {
        return `<span>${count} ${escapeHtml(label)}</span>`;
      }).join("");
      projectStats.innerHTML = `
        <span>${formatProjectCount(window.ONE_WORLD_RELIEF_PROJECTS.length)}</span>
        ${statusChips}
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
      const hasMedia = isSafeHttpUrl(project.mediaUrl);
      const mediaUrl = hasMedia ? escapeHtml(project.mediaUrl) : "";
      const donationUrl = escapeHtml(project.donationUrl || "donate.html#donationForm");
      const isIllustrative = Boolean(project.thumbnailIsIllustrative);
      // Stock photos are decorative (alt=""); the visible caption says they are illustrative.
      const imageAlt = isIllustrative ? "" : `Photo from ${title}`;
      const image = thumbnailUrl
        ? `<img src="${thumbnailUrl}" alt="${imageAlt}" width="800" height="500" loading="lazy" decoding="async" />`
        : "";
      const illustrativeNote = isIllustrative ? `<small class="photo-note">Illustrative stock photo</small>` : "";
      const newTabHint = `<span class="visually-hidden"> for ${title} (opens in a new tab)</span>`;
      const mediaBlock = hasMedia
        ? `<a class="project-media" href="${mediaUrl}" target="_blank" rel="noopener noreferrer">
            ${image}
            <span>${mediaLabel}${newTabHint}</span>
            ${illustrativeNote}
          </a>`
        : `<div class="project-media">
            ${image}
            <span>${mediaLabel}</span>
            ${illustrativeNote}
          </div>`;
      const mediaAction = hasMedia
        ? `<a class="button button-outline" href="${mediaUrl}" target="_blank" rel="noopener noreferrer">${mediaLabel}${newTabHint}</a>`
        : "";

      return `
        <article class="project-card">
          ${mediaBlock}
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
          ${update ? `<p class="project-update">${update}</p>` : ""}
          <div class="project-actions">
            <a class="button button-primary" href="${donationUrl}">Donate<span class="visually-hidden"> to ${category}</span></a>
            ${mediaAction}
          </div>
        </article>
      `;
    }).join("");
  };

  renderProjects();

  // Keep preset amount buttons and the custom amount field in sync, so it is always clear which amount will be charged.
  const linkAmountInputs = (form, radioName, customInput, onChange) => {
    if (!form || !customInput) {
      return;
    }
    const radios = Array.from(form.querySelectorAll(`input[name="${radioName}"]`));
    customInput.addEventListener("input", () => {
      if (Number(customInput.value) > 0) {
        radios.forEach((radio) => {
          radio.checked = false;
        });
      }
      onChange();
    });
    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        customInput.value = "";
        onChange();
      });
    });
  };

  const formatUsd = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  };

  if (quickDonationForm) {
    linkAmountInputs(quickDonationForm, "quickAmount", document.getElementById("quickCustomAmount"), () => {});
    quickDonationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const customAmount = Number(document.getElementById("quickCustomAmount")?.value || 0);
      const amount = customAmount > 0
        ? String(customAmount)
        : quickDonationForm.querySelector('input[name="quickAmount"]:checked')?.value || "25";
      const campaign = document.getElementById("quickCampaign")?.value || "General Fund";
      const params = new URLSearchParams({ amount, campaign });
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
      const contactStatus = document.getElementById("contactStatus");
      if (contactStatus) {
        contactStatus.textContent =
          "Your email app should open with this message filled in. If nothing happens, email Oneworldrelief.fma@gmail.com directly.";
      }
    });
  }

  if (!donationForm || !statusEl || !donateButton) {
    return;
  }

  const applyDonationParams = () => {
    const params = new URLSearchParams(window.location.search);
    const amount = params.get("amount");
    const campaign = params.get("campaign");
    const campaignSelect = document.getElementById("campaignSelect");

    const requestedAmount = Number(amount);
    if (Number.isFinite(requestedAmount) && requestedAmount > 0) {
      const amountRadio = Array.from(donationForm.querySelectorAll('input[name="amount"]')).find((radio) => {
        return Number(radio.value) === requestedAmount;
      });
      if (amountRadio) {
        amountRadio.checked = true;
      } else {
        const customInput = document.getElementById("customDonation");
        if (customInput) {
          customInput.value = String(requestedAmount);
          donationForm.querySelectorAll('input[name="amount"]').forEach((radio) => {
            radio.checked = false;
          });
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

  const DEFAULT_BUTTON_LABEL = "Continue to secure payment";
  const CONTACT_EMAIL = "Oneworldrelief.fma@gmail.com";

  const setStatus = (message, isError) => {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  };

  const getDonationAmount = () => {
    const customInput = document.getElementById("customDonation");
    const customValue = customInput ? Number(customInput.value) : 0;
    if (customValue > 0) {
      return customValue;
    }
    const selected = donationForm.querySelector('input[name="amount"]:checked');
    return selected ? Number(selected.value) : 0;
  };

  const updateDonateButtonLabel = () => {
    const amount = getDonationAmount();
    donateButton.textContent = amount > 0 ? `${DEFAULT_BUTTON_LABEL} (${formatUsd(amount)})` : DEFAULT_BUTTON_LABEL;
  };

  linkAmountInputs(donationForm, "amount", document.getElementById("customDonation"), updateDonateButtonLabel);
  updateDonateButtonLabel();

  // If the donor comes back from Stripe with the browser's Back button, the page may be restored from cache
  // with the button still disabled; re-enable it.
  window.addEventListener("pageshow", () => {
    donateButton.disabled = false;
    updateDonateButtonLabel();
  });

  donationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("", false);

    const donorName = document.getElementById("donorName").value.trim();
    const donorEmail = document.getElementById("donorEmail").value.trim();
    const paymentMethod = document.getElementById("paymentMethod").value;
    const campaign = document.getElementById("campaignSelect")?.value || "General Fund";
    const amountUsd = getDonationAmount();

    if (!donorName || !donorEmail) {
      setStatus("Please enter your name and email.", true);
      return;
    }
    if (!amountUsd || amountUsd <= 0) {
      setStatus("Please select or enter a valid donation amount.", true);
      return;
    }

    const unavailableMessage =
      `Secure checkout is temporarily unavailable. No payment was taken. Please try again in a few minutes or email ${CONTACT_EMAIL}.`;

    donateButton.disabled = true;
    donateButton.textContent = "Preparing secure checkout...";

    try {
      const response = await fetch(`${API_BASE}/charity/donations/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donor_name: donorName,
          donor_email: donorEmail,
          amount_usd: amountUsd,
          payment_method: paymentMethod,
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
        // 4xx responses carry a donor-facing validation message; anything else is a server/config problem
        // that donors cannot fix, so show a calm message instead of internal details.
        const isDonorError = response.status >= 400 && response.status < 500 && response.status !== 405;
        throw new Error(isDonorError && payload.detail ? payload.detail : unavailableMessage);
      }

      if (payload.redirect_url) {
        // Leave the button disabled while the browser navigates away, so the donor cannot start a second checkout.
        setStatus("Redirecting to Stripe's secure checkout...", false);
        window.location.href = payload.redirect_url;
        return;
      }

      setStatus(
        `Donation request saved (#${payload.donation_id}). We will issue your receipt after payment confirmation.`,
        false
      );
      donateButton.disabled = false;
      updateDonateButtonLabel();
    } catch (error) {
      // Network failures (TypeError from fetch) get the same donor-friendly message.
      const message = error instanceof TypeError ? unavailableMessage : error.message || unavailableMessage;
      console.error("Checkout could not be started", error);
      setStatus(message, true);
      donateButton.disabled = false;
      updateDonateButtonLabel();
    }
  });
})();
