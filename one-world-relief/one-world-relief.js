// Author: Fahadbin Alam (fma52), 4/19/26
// Mod by Codex, 4/23/26
// From One World Relief donation backend integration and multi-page project rendering, 4/23/26
(function () {
  document.documentElement.classList.add("motion-ready");

  const API_BASE = (window.ONE_WORLD_RELIEF_API_BASE || window.location.origin).replace(/\/$/, "");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const donationForm = document.getElementById("donationForm");
  const quickDonationForm = document.getElementById("quickDonationForm");
  const contactForm = document.getElementById("contactForm");
  const statusEl = document.getElementById("donationStatus");
  const donateButton = donationForm ? donationForm.querySelector(".donate-button") : null;
  const projectBoard = document.getElementById("projectBoard");
  const projectStats = document.getElementById("projectStats");
  const nativeShareButton = document.getElementById("nativeShareButton");
  const openQrPresentation = document.getElementById("openQrPresentation");
  const closeQrPresentation = document.getElementById("closeQrPresentation");
  const qrPresentationModal = document.getElementById("qrPresentationModal");
  const copyInstagramCaption = document.getElementById("copyInstagramCaption");
  const DONATION_URL = "https://one-world-relief.org/donate";
  const SHARE_TEXT = "Donate to One World Relief and support direct aid projects.";
  const INSTAGRAM_CAPTION = `${SHARE_TEXT} ${DONATION_URL}`;
  const revealItems = Array.from(document.querySelectorAll(".reveal"));
  const flowLayers = Array.from(document.querySelectorAll("[data-flow-layer]"));

  const escapeHtml = (value) => {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const formatProjectCount = (count) => {
    return `${count} ${count === 1 ? "project" : "projects"}`;
  };

  const isExternalUrl = (url) => /^https?:\/\//i.test(String(url || ""));

  const setupReveals = () => {
    if (!revealItems.length) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.16 });

    revealItems.forEach((item, index) => {
      item.style.setProperty("--reveal-delay", `${Math.min(index * 70, 280)}ms`);
      item.dataset.revealVariant = item.dataset.revealVariant || ["rise", "slide-left", "slide-right", "scale"][index % 4];
      observer.observe(item);
    });
  };

  const setupScrollProgress = () => {
    if (prefersReducedMotion) {
      return;
    }

    const progress = document.createElement("span");
    progress.className = "scroll-progress";
    progress.setAttribute("aria-hidden", "true");
    document.body.appendChild(progress);

    let ticking = false;
    const update = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const value = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      progress.style.transform = `scaleX(${Math.min(Math.max(value, 0), 1).toFixed(4)})`;
      ticking = false;
    };

    const requestUpdate = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
  };

  const setupFlowLayers = () => {
    if (!flowLayers.length || prefersReducedMotion) {
      return;
    }

    let ticking = false;
    const update = () => {
      flowLayers.forEach((layer) => {
        const strength = Number(layer.dataset.flowLayer || 0.06);
        const rect = layer.getBoundingClientRect();
        const viewportCenter = window.innerHeight / 2;
        const layerCenter = rect.top + rect.height / 2;
        const offset = (viewportCenter - layerCenter) * strength;
        layer.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
      });
      ticking = false;
    };

    const requestUpdate = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
  };

  const setupPointerMotion = () => {
    if (prefersReducedMotion) {
      return;
    }

    const targets = Array.from(document.querySelectorAll(
      ".project-card, .proof-card, .project-detail-feature, .flow-impact-media, .home-stories, .donation-form-card"
    ));

    targets.forEach((target) => {
      target.classList.add("motion-surface");

      target.addEventListener("pointermove", (event) => {
        const rect = target.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const tiltX = (0.5 - y) * 8;
        const tiltY = (x - 0.5) * 8;

        target.style.setProperty("--tilt-x", `${tiltX.toFixed(2)}deg`);
        target.style.setProperty("--tilt-y", `${tiltY.toFixed(2)}deg`);
      });

      target.addEventListener("pointerleave", () => {
        target.style.setProperty("--tilt-x", "0deg");
        target.style.setProperty("--tilt-y", "0deg");
      });
    });
  };

  const setupAnimatedNumbers = () => {
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      return;
    }

    const numberItems = Array.from(document.querySelectorAll(".flow-impact-stats strong, #projectStats span"));

    const animateNumber = (element) => {
      if (element.dataset.counted === "true") {
        return;
      }

      const original = element.textContent || "";
      const match = original.match(/^([^0-9]*)([0-9,]+)(.*)$/);
      if (!match) {
        return;
      }

      element.dataset.counted = "true";
      const prefix = match[1];
      const target = Number(match[2].replace(/,/g, ""));
      const suffix = match[3];
      const duration = 900;
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(target * eased).toLocaleString();
        element.textContent = `${prefix}${value}${suffix}`;

        if (progress < 1) {
          window.requestAnimationFrame(tick);
        } else {
          element.textContent = original;
        }
      };

      window.requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateNumber(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.7 });

    numberItems.forEach((item) => observer.observe(item));
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
      const rawMediaUrl = project.mediaUrl || "#";
      const mediaUrl = escapeHtml(rawMediaUrl);
      const mediaLinkAttrs = isExternalUrl(rawMediaUrl) ? ' target="_blank" rel="noreferrer"' : "";
      const donationUrl = escapeHtml(project.donationUrl || "donate.html#donationForm");

      return `
        <article class="project-card">
          <a class="project-media" href="${mediaUrl}"${mediaLinkAttrs} aria-label="${mediaLabel} for ${title}">
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
          <p class="project-update">${update}</p>
          <div class="project-actions">
            <a class="button button-primary" href="${donationUrl}">Donate</a>
            <a class="button button-outline" href="${mediaUrl}"${mediaLinkAttrs}>${mediaLabel}</a>
          </div>
        </article>
      `;
    }).join("");
  };

  setupReveals();
  setupScrollProgress();
  setupFlowLayers();
  renderProjects();
  setupPointerMotion();
  setupAnimatedNumbers();

  const copyText = async (text) => {
    if (!navigator.clipboard?.writeText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const temporarilySetText = (element, text, delay = 1800) => {
    const originalText = element.textContent;
    element.textContent = text;
    window.setTimeout(() => {
      element.textContent = originalText;
    }, delay);
  };

  if (nativeShareButton) {
    nativeShareButton.addEventListener("click", async () => {
      const shareData = {
        title: "Donate to One World Relief",
        text: SHARE_TEXT,
        url: DONATION_URL,
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
          return;
        } catch (_error) {
          return;
        }
      }

      const copied = await copyText(DONATION_URL);
      temporarilySetText(nativeShareButton, copied ? "Link Copied" : "Copy Manually");
    });
  }

  if (copyInstagramCaption) {
    copyInstagramCaption.addEventListener("click", async () => {
      const copied = await copyText(INSTAGRAM_CAPTION);
      temporarilySetText(copyInstagramCaption, copied ? "Caption Copied" : "Copy Manually");
    });
  }

  if (openQrPresentation && closeQrPresentation && qrPresentationModal) {
    let lastFocusedElement = null;

    const closePresentation = () => {
      qrPresentationModal.hidden = true;
      qrPresentationModal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("qr-modal-open");
      lastFocusedElement?.focus();
    };

    openQrPresentation.addEventListener("click", () => {
      lastFocusedElement = document.activeElement;
      qrPresentationModal.hidden = false;
      qrPresentationModal.setAttribute("aria-hidden", "false");
      document.body.classList.add("qr-modal-open");
      closeQrPresentation.focus();
    });

    closeQrPresentation.addEventListener("click", closePresentation);
    qrPresentationModal.addEventListener("click", (event) => {
      if (event.target === qrPresentationModal) {
        closePresentation();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !qrPresentationModal.hidden) {
        closePresentation();
      }
    });
  }

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

  const customDonationPanel = document.getElementById("customDonationPanel");
  const customDonationInput = document.getElementById("customDonation");
  const customDonationRadio = donationForm.querySelector('input[name="amount"][value="custom"]');

  const syncCustomAmountPanel = ({ focus = false, clear = false } = {}) => {
    const selected = donationForm.querySelector('input[name="amount"]:checked');
    const isCustomAmount = selected?.value === "custom";

    if (!customDonationPanel || !customDonationInput) {
      return;
    }

    customDonationPanel.hidden = !isCustomAmount;
    customDonationInput.required = isCustomAmount;

    if (!isCustomAmount && clear) {
      customDonationInput.value = "";
    }

    if (isCustomAmount && focus) {
      requestAnimationFrame(() => customDonationInput.focus());
    }
  };

  const applyDonationParams = () => {
    const params = new URLSearchParams(window.location.search);
    const amount = params.get("amount");
    const campaign = params.get("campaign");
    const campaignSelect = document.getElementById("campaignSelect");

    if (amount) {
      const amountRadio = donationForm.querySelector(`input[name="amount"][value="${amount}"]`);
      if (amountRadio) {
        amountRadio.checked = true;
        if (customDonationInput) {
          customDonationInput.value = "";
        }
      } else {
        if (customDonationRadio) {
          customDonationRadio.checked = true;
        }
        if (customDonationInput) {
          customDonationInput.value = amount;
        }
      }
    }

    if (campaignSelect && campaign) {
      const option = Array.from(campaignSelect.options).find((item) => item.value === campaign);
      if (option) {
        campaignSelect.value = campaign;
      }
    }

    syncCustomAmountPanel();
  };

  applyDonationParams();

  donationForm.querySelectorAll('input[name="amount"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      syncCustomAmountPanel({
        focus: radio.value === "custom",
        clear: radio.value !== "custom",
      });
    });
  });

  if (customDonationInput && customDonationRadio) {
    customDonationInput.addEventListener("input", () => {
      if (customDonationInput.value && !customDonationRadio.checked) {
        customDonationRadio.checked = true;
        syncCustomAmountPanel();
      }
    });
  }

  const setStatus = (message, isError) => {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  };

  const getDonationAmount = () => {
    const selected = donationForm.querySelector('input[name="amount"]:checked');
    if (selected?.value === "custom") {
      return customDonationInput ? Number(customDonationInput.value) : 0;
    }
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
          ? "Payment checkout is not connected yet for this deploy."
          : "Payment checkout failed. Make sure the backend is running and Stripe/PayPal keys are configured.";
      setStatus(error.message || fallbackMessage, true);
    } finally {
      donateButton.disabled = false;
      donateButton.textContent = "Complete Donation";
    }
  });
})();
