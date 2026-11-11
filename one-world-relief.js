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

  if (quickDonationForm) {
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
          : "Payment checkout failed. Make sure the backend is running and Stripe/PayPal keys are configured.";
      setStatus(error.message || fallbackMessage, true);
    } finally {
      donateButton.disabled = false;
      donateButton.textContent = "Complete Donation";
    }
  });
})();
