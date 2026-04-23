// Author: Fahadbin Alam (fma52), 4/19/26
// Mod by Codex, 4/23/26
// From One World Relief donation backend integration and multi-page project rendering, 4/23/26
(function () {
  const API_BASE = (window.ONE_WORLD_RELIEF_API_BASE || "http://localhost:8000").replace(/\/$/, "");
  const donationForm = document.getElementById("donationForm");
  const statusEl = document.getElementById("donationStatus");
  const donateButton = donationForm ? donationForm.querySelector(".donate-button") : null;
  const projectBoard = document.getElementById("projectBoard");

  const renderProjects = () => {
    if (!projectBoard || !Array.isArray(window.ONE_WORLD_RELIEF_PROJECTS)) {
      return;
    }

    projectBoard.innerHTML = window.ONE_WORLD_RELIEF_PROJECTS.map((project) => {
      return `
        <article class="project-card">
          <div class="project-meta">
            <span>${project.category}</span>
            <span>${project.status}</span>
          </div>
          <div>
            <h3>${project.title}</h3>
            <p>${project.location}</p>
          </div>
          <p>${project.summary}</p>
          <a class="button button-outline" href="${project.mediaUrl}" target="_blank" rel="noreferrer">
            ${project.mediaLabel}
          </a>
        </article>
      `;
    }).join("");
  };

  renderProjects();

  if (!donationForm || !statusEl || !donateButton) {
    return;
  }

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
          campaign: "General Fund",
        }),
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch (_err) {
        payload = {};
      }

      if (!response.ok) {
        const errMessage = payload.detail || "Could not start checkout. Please try again.";
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
          ? "Donation form is live, but the payment backend is not connected yet for this deploy."
          : "Donation request failed.";
      setStatus(error.message || fallbackMessage, true);
    } finally {
      donateButton.disabled = false;
      donateButton.textContent = "Complete Donation";
    }
  });
})();
