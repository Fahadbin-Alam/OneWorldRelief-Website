// Author: Fahadbin Alam (fma52), 4/19/26
// Mod by Codex, 4/23/26
// From One World Relief donation backend integration and multi-page project rendering, 4/23/26
(function () {
  document.documentElement.classList.add("motion-ready");

  const API_BASE = (window.ONE_WORLD_RELIEF_API_BASE || window.location.origin).replace(/\/$/, "");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let prefersReducedMotion = motionPreference.matches;
  motionPreference.addEventListener?.("change", (event) => {
    prefersReducedMotion = event.matches;
  });
  const donationForm = document.getElementById("donationForm");
  const quickDonationForm = document.getElementById("quickDonationForm");
  const contactForm = document.getElementById("contactForm");
  const statusEl = document.getElementById("donationStatus");
  const donateButton = donationForm ? donationForm.querySelector(".donate-button") : null;
  const projectBoard = document.getElementById("projectBoard");
  const projectStats = document.getElementById("projectStats");
  const homeCaseFlowTrack = document.getElementById("homeCaseFlowTrack");
  const homeCompletedCaseCount = document.getElementById("homeCompletedCaseCount");
  const homeOrphanImpactCount = document.getElementById("homeOrphanImpactCount");
  const faithVideo = document.querySelector(".faith-video-bg");
  const nativeShareButton = document.getElementById("nativeShareButton");
  const openQrPresentation = document.getElementById("openQrPresentation");
  const closeQrPresentation = document.getElementById("closeQrPresentation");
  const qrPresentationModal = document.getElementById("qrPresentationModal");
  const copyInstagramCaption = document.getElementById("copyInstagramCaption");
  const instagramShareStatus = document.getElementById("instagramShareStatus");
  const DONATION_URL = "https://one-world-relief.org/donate";
  const INSTAGRAM_URL = "https://www.instagram.com/";
  const SHARE_TEXT = "Donate to One World Relief and support direct aid projects.";
  const INSTAGRAM_CAPTION = `${SHARE_TEXT} ${DONATION_URL}`;
  const revealItems = Array.from(document.querySelectorAll(".reveal"));
  const flowLayers = Array.from(document.querySelectorAll("[data-flow-layer]"));

  const registerOfflineFallback = () => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const secureContext = window.location.protocol === "https:"
      || window.location.hostname === "localhost"
      || window.location.hostname === "127.0.0.1";

    if (!secureContext) {
      return;
    }

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  };

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

  const getProjectCaseClass = (project) => {
    const caseId = String(project.date || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return caseId ? `project-${caseId}` : "";
  };

  const donationPrograms = Array.isArray(window.ONE_WORLD_RELIEF_DONATION_PROGRAMS)
    ? window.ONE_WORLD_RELIEF_DONATION_PROGRAMS
    : [];

  const legacyProgramAliases = {
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

  const getDonationProgram = (value = "unrestricted") => {
    const requested = String(value || "unrestricted").trim();
    const normalizedId = legacyProgramAliases[requested] || requested;
    return donationPrograms.find((program) => {
      return program.id === normalizedId || program.campaign === requested;
    }) || donationPrograms.find((program) => program.id === "unrestricted") || null;
  };

  const populateDonationDestinations = (select) => {
    if (!select || !donationPrograms.length) {
      return;
    }

    select.replaceChildren();
    const appendProgramOption = (program) => {
      const option = document.createElement("option");
      option.value = program.id;
      option.textContent = String(program.shortLabel || program.title || program.campaign);
      select.appendChild(option);
    };

    donationPrograms.forEach(appendProgramOption);
  };

  const buildQuickDonationUrl = ({ amount, program = "unrestricted" }) => {
    const params = new URLSearchParams({
      amount: String(amount),
      program: String(program || "unrestricted"),
    });
    return `donate.html?${params.toString()}#donationForm`;
  };

  const setupReveals = () => {
    if (!revealItems.length) return;

    // IDs are not CSS selectors: unusual/encoded anchors must not stop page setup.
    let anchorId = window.location.hash.slice(1);
    try { anchorId = decodeURIComponent(anchorId); } catch (_) { /* Keep the literal ID. */ }
    const hashTarget = document.getElementById(anchorId);
    const hashReveal = hashTarget?.classList?.contains("reveal") ? hashTarget : hashTarget?.closest?.(".reveal");
    const show = (item, delay = 0) => {
      item.style.setProperty("--reveal-delay", `${delay}ms`);
      item.classList.add("is-visible");
    };

    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => show(item));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      let order = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        show(entry.target, Math.min(order++ * 45, 135));
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px 12% 0px", threshold: 0 });

    // Read layout once before writing styles; first-screen text is ready immediately.
    const initialItems = revealItems.map((item) => ({ item, rect: item.getBoundingClientRect() }));
    initialItems.forEach(({ item, rect }) => {
      item.dataset.revealVariant = item.dataset.revealVariant || "rise";
      if (item === hashReveal || (rect.top < window.innerHeight && rect.bottom > 0)) {
        item.dataset.revealImmediate = "true";
        show(item);
      } else {
        observer.observe(item);
      }
    });

    const finishReveals = () => {
      observer.disconnect();
      revealItems.forEach((item) => show(item));
    };
    motionPreference.addEventListener?.("change", (event) => {
      if (event.matches) finishReveals();
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) finishReveals();
    });
    document.addEventListener("focusin", (event) => {
      const item = event.target.closest?.(".reveal");
      if (!item) return;
      item.dataset.revealImmediate = "true";
      show(item);
      observer.unobserve(item);
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

  const setupHeaderExperience = () => {
    const header = document.querySelector(".site-header");
    if (!header) {
      return;
    }

    let headerFrame = 0;
    const updateHeaderDepth = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
      headerFrame = 0;
    };
    const requestHeaderUpdate = () => {
      if (!headerFrame) {
        headerFrame = window.requestAnimationFrame(updateHeaderDepth);
      }
    };

    updateHeaderDepth();
    window.addEventListener("scroll", requestHeaderUpdate, { passive: true });

    const mobileMenu = header.querySelector(".mobile-nav-menu");
    if (!mobileMenu) {
      return;
    }

    mobileMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => mobileMenu.removeAttribute("open"));
    });
    mobileMenu.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mobileMenu.open) {
        mobileMenu.removeAttribute("open");
        mobileMenu.querySelector("summary")?.focus();
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (mobileMenu.open && !mobileMenu.contains(event.target)) {
        mobileMenu.removeAttribute("open");
      }
    });
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
    if (
      prefersReducedMotion ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      return;
    }

    const targets = Array.from(document.querySelectorAll(
      ".project-card, .proof-card, .project-detail-feature, .flow-impact-media"
    )).filter((target) => !target.closest(".project-motion-page"));

    targets.forEach((target) => {
      target.classList.add("motion-surface");
      let pointerFrame = 0;
      let latestPointerEvent = null;

      target.addEventListener("pointermove", (event) => {
        latestPointerEvent = event;
        if (pointerFrame) {
          return;
        }

        pointerFrame = window.requestAnimationFrame(() => {
          if (!latestPointerEvent) {
            pointerFrame = 0;
            return;
          }

          const rect = target.getBoundingClientRect();
          const x = (latestPointerEvent.clientX - rect.left) / rect.width;
          const y = (latestPointerEvent.clientY - rect.top) / rect.height;
          const tiltX = (0.5 - y) * 8;
          const tiltY = (x - 0.5) * 8;

          target.style.setProperty("--tilt-x", `${tiltX.toFixed(2)}deg`);
          target.style.setProperty("--tilt-y", `${tiltY.toFixed(2)}deg`);
          pointerFrame = 0;
        });
      });

      target.addEventListener("pointerleave", () => {
        latestPointerEvent = null;
        if (pointerFrame) {
          window.cancelAnimationFrame(pointerFrame);
          pointerFrame = 0;
        }
        target.style.setProperty("--tilt-x", "0deg");
        target.style.setProperty("--tilt-y", "0deg");
      });
    });
  };

  const setupAnimatedNumbers = () => {
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      return;
    }

    const numberItems = Array.from(document.querySelectorAll("[data-impact-count], .flow-impact-stats strong, #projectStats span"));

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
        const progress = Math.min(Math.max((now - start) / duration, 0), 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(target * eased).toLocaleString();
        element.textContent = `${prefix}${value}${suffix}`;

        if (progress < 1 && !prefersReducedMotion && !document.hidden) {
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

  // Reuse smaller, uncropped previews across the home slider and project board.
  const projectPreviewImages = {
    "Case 001": "assets/home-slider/orphan-support-001.webp",
    "Case 002": "assets/home-slider/livelihood-support-002.webp",
    "Case 003": "assets/home-slider/orphan-education-003.webp",
    "Case 004": "assets/home-slider/korbani-meals-004.webp",
    "Case 005": "assets/home-slider/flood-relief-005.webp",
    "Case 006": "assets/home-slider/mosque-gate-006.webp",
    "Case 008": "assets/project-previews/mosque-tiles-008.webp",
    "Case 009": "assets/home-slider/mosque-fans-009.webp",
    "Case 010": "assets/project-previews/elder-care-010.webp",
  };
  const getProjectPreviewUrl = (project) => projectPreviewImages[project.date] || project.thumbnailUrl;

  const renderProjects = () => {
    if (!projectBoard || !Array.isArray(window.ONE_WORLD_RELIEF_PROJECTS)) {
      return;
    }

    if (projectStats) {
      const completed = window.ONE_WORLD_RELIEF_PROJECTS.filter((project) => {
        return String(project.status || "").toLowerCase().includes("completed");
      }).length;
      const comingSoon = window.ONE_WORLD_RELIEF_PROJECTS.filter((project) => {
        return String(project.status || "").toLowerCase().includes("coming soon");
      }).length;
      const active = window.ONE_WORLD_RELIEF_PROJECTS.length - completed - comingSoon;
      projectStats.innerHTML = `
        <span>${formatProjectCount(window.ONE_WORLD_RELIEF_PROJECTS.length)}</span>
        <span>${completed} completed</span>
        <span>${active} active</span>
        <span>${comingSoon} coming soon</span>
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
      const thumbnailUrl = escapeHtml(getProjectPreviewUrl(project));
      const caseNumber = escapeHtml(String(date).replace(/^Case\s*/i, "") || date);
      const hasBannerThumbnail = project.thumbnailType === "banner" || !project.thumbnailUrl;
      const thumbnailLabel = escapeHtml(project.thumbnailLabel || "Current Case");
      const locationAndDate = [location, date].filter(Boolean).join(" &middot; ");
      const rawMediaUrl = project.mediaUrl || "#";
      const mediaUrl = escapeHtml(rawMediaUrl);
      const projectCaseClass = getProjectCaseClass(project);
      const projectCardClass = ["project-card", projectCaseClass].filter(Boolean).join(" ");
      const mediaLinkAttrs = isExternalUrl(rawMediaUrl) ? ' target="_blank" rel="noreferrer"' : "";
      const donationUrl = escapeHtml(project.donationUrl || "donate.html#donationForm");
      const mediaMarkup = hasBannerThumbnail
        ? `
          <span class="project-media-banner" aria-hidden="true">
            <span>${thumbnailLabel}</span>
            <strong>${caseNumber}</strong>
          </span>
        `
        : `<img src="${thumbnailUrl}" alt="${title}" loading="lazy" decoding="async" />`;

      return `
        <article class="${projectCardClass}">
          <a class="project-media" href="${mediaUrl}"${mediaLinkAttrs} aria-label="${mediaLabel} for ${title}">
            ${mediaMarkup}
            <span>${mediaLabel}</span>
          </a>
          <div class="project-meta">
            <span>${category}</span>
            <span>${status}</span>
          </div>
          <div>
            <h3>${title}</h3>
            <p>${locationAndDate}</p>
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

  const renderHomeCaseFlow = () => {
    if (!homeCaseFlowTrack || !Array.isArray(window.ONE_WORLD_RELIEF_PROJECTS)) {
      return;
    }

    const projects = window.ONE_WORLD_RELIEF_PROJECTS.filter((project) => {
      return String(project.status || "").toLowerCase().includes("completed");
    });

    if (!projects.length) {
      homeCaseFlowTrack.hidden = true;
      return;
    }

    // Keep a steady, readable pace for each completed project in the loop.
    const secondsPerProject = 8;
    homeCaseFlowTrack.style.setProperty(
      "--case-flow-duration",
      `${projects.length * secondsPerProject}s`,
    );

    // Render one accessible set. The homepage adds only the copies its width needs.
    homeCaseFlowTrack.innerHTML = projects.map((project, index) => {
      const title = escapeHtml(project.title);
      const category = escapeHtml(project.category);
      const status = escapeHtml(project.status);
      const date = escapeHtml(project.date);
      const amountRaised = escapeHtml(project.amountRaised);
      const thumbnailUrl = escapeHtml(getProjectPreviewUrl(project));
      const rawMediaUrl = project.mediaUrl || "projects.html";
      const mediaUrl = escapeHtml(rawMediaUrl);
      const mediaLinkAttrs = isExternalUrl(rawMediaUrl) ? ' target="_blank" rel="noreferrer"' : "";
      const cardLift = (index + 1) % 3 === 0 ? ".85rem" : (index + 1) % 2 === 0 ? "1.8rem" : "0px";

      return `
        <a class="case-flow-card" href="${mediaUrl}"${mediaLinkAttrs} aria-label="Open ${title}" style="--card-lift: ${cardLift};">
          <img src="${thumbnailUrl}" alt="${title}" loading="lazy" decoding="async" />
          <span class="case-flow-copy">
            <span>${date} &middot; ${status}</span>
            <strong>${title}</strong>
            <small>${category} / ${amountRaised}</small>
          </span>
        </a>
      `;
    }).join("");

    homeCaseFlowTrack.setAttribute("aria-live", "off");
  };

  const renderHomeOrphanImpact = () => {
    if (!Array.isArray(window.ONE_WORLD_RELIEF_PROJECTS)) {
      return;
    }

    const completedCount = window.ONE_WORLD_RELIEF_PROJECTS.filter((project) => (
      String(project.status || "").toLowerCase().includes("completed")
    )).length;
    const verifiedCount = window.ONE_WORLD_RELIEF_PROJECTS.reduce((total, project) => {
      const isCompleted = String(project.status || "").toLowerCase().includes("completed");
      const beneficiaryCount = Number(project.verifiedOrphanBeneficiaries);
      if (!isCompleted || !Number.isSafeInteger(beneficiaryCount) || beneficiaryCount < 1) {
        return total;
      }
      return total + beneficiaryCount;
    }, 0);

    if (homeCompletedCaseCount && Number.isSafeInteger(completedCount) && completedCount > 0) {
      homeCompletedCaseCount.textContent = completedCount.toLocaleString("en-US");
    }

    if (!homeOrphanImpactCount || !Number.isSafeInteger(verifiedCount) || verifiedCount < 1) {
      return;
    }

    homeOrphanImpactCount.textContent = verifiedCount.toLocaleString("en-US");
  };

  const setupFaithVideo = () => {
    const source = faithVideo?.querySelector("source[data-src]");
    const section = faithVideo?.closest(".faith-video-section");
    const toggle = document.getElementById("backgroundVideoToggle");
    if (!faithVideo || !source || !section || !toggle) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let userPaused = motionPreference.matches || navigator.connection?.saveData === true;
    let isVisible = false;
    let hasLoaded = false;
    toggle.hidden = false;

    const syncToggle = () => {
      const playing = !faithVideo.paused;
      toggle.querySelector("[data-video-toggle-label]").textContent = playing ? "Pause background" : "Play background";
      toggle.querySelector("[data-video-toggle-icon]").textContent = playing ? "\u23f8" : "\u25b6";
    };
    const play = () => {
      if (!hasLoaded) {
        source.src = source.dataset.src;
        source.removeAttribute("data-src");
        faithVideo.load();
        hasLoaded = true;
      }
      faithVideo.play().catch(syncToggle);
    };
    const syncPlayback = () => {
      if (isVisible && !document.hidden && !userPaused) play();
      else faithVideo.pause();
    };
    toggle.addEventListener("click", () => {
      userPaused = !faithVideo.paused;
      if (userPaused) faithVideo.pause();
      else play();
    });
    faithVideo.addEventListener("play", syncToggle);
    faithVideo.addEventListener("pause", syncToggle);
    document.addEventListener("visibilitychange", syncPlayback);
    motionPreference.addEventListener?.("change", () => {
      userPaused = motionPreference.matches || navigator.connection?.saveData === true;
      syncPlayback();
    });
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        isVisible = entries.some((entry) => entry.isIntersecting);
        syncPlayback();
      }, { threshold: 0.1 });
      observer.observe(section);
    } else {
      isVisible = true;
      syncPlayback();
    }
  };

  registerOfflineFallback();
  setupReveals();
  setupHeaderExperience();
  setupScrollProgress();
  setupFlowLayers();
  renderProjects();
  renderHomeOrphanImpact();
  renderHomeCaseFlow();
  setupFaithVideo();
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
      const instagramWindow = window.open(INSTAGRAM_URL, "_blank");
      if (instagramWindow) {
        instagramWindow.opener = null;
      }
      const copied = await copyText(INSTAGRAM_CAPTION);
      const statusText = copied
        ? "Caption copied. Paste it into your Instagram post."
        : "Open Instagram and paste this donation link: one-world-relief.org/donate";

      if (instagramShareStatus) {
        instagramShareStatus.textContent = statusText;
      } else {
        temporarilySetText(copyInstagramCaption, copied ? "Caption Copied" : "Copy Manually");
      }

      if (!instagramWindow || instagramWindow.closed) {
        copyInstagramCaption.setAttribute("aria-label", "Instagram opened in a new tab or pop-up was blocked");
      }
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
    const quickCustomInput = document.getElementById("quickCustomAmount");
    const quickStatus = document.getElementById("quickDonationStatus");
    const orphanOption = document.getElementById("quickOrphanOption");
    const quickSubmitLabel = quickDonationForm.querySelector(".quick-donation-button > span");
    let previousQuickAmount = quickCustomInput?.value || "50";

    const setOrphanSelection = (selected) => {
      orphanOption?.setAttribute("aria-pressed", String(selected));
      if (quickSubmitLabel) {
        quickSubmitLabel.textContent = selected ? "Continue with orphan support" : "Choose a cause";
      }
    };

    const setQuickStatus = (message = "", isError = false) => {
      if (!quickStatus) {
        return;
      }
      quickStatus.textContent = message;
      quickStatus.classList.toggle("error", isError);
    };

    const clearQuickAmountError = () => {
      quickCustomInput?.removeAttribute("aria-invalid");
      setQuickStatus();
    };

    if (quickCustomInput) {
      quickCustomInput.addEventListener("input", clearQuickAmountError);
      quickCustomInput.addEventListener("input", () => {
        if (Number(quickCustomInput.value) !== 300) setOrphanSelection(false);
      });
    }

    orphanOption?.addEventListener("click", () => {
      if (!quickCustomInput) return;
      const selected = orphanOption.getAttribute("aria-pressed") !== "true";
      if (selected) previousQuickAmount = quickCustomInput.value;
      quickCustomInput.value = selected ? "300" : previousQuickAmount;
      setOrphanSelection(selected);
      quickCustomInput.dispatchEvent(new Event("input", { bubbles: true }));
      setQuickStatus(selected ? "$300 selected for one year of orphan support." : "");
    });

    quickDonationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const amount = quickCustomInput ? Number(quickCustomInput.value) : 0;
      if (!Number.isFinite(amount) || amount < 5) {
        quickCustomInput?.focus();
        quickCustomInput?.setAttribute("aria-invalid", "true");
        setQuickStatus("Please enter a donation amount of at least $5.", true);
        return;
      }
      const program = orphanOption?.getAttribute("aria-pressed") === "true" && amount === 300
        ? "orphan_annual" : "unrestricted";
      window.location.href = buildQuickDonationUrl({ amount: String(amount), program });
    });
  }

  const CONTACT_EMAIL = "Oneworldrelief.fma@gmail.com";
  const buildContactMailtoUrl = ({ name, email, message }) => {
    const subject = encodeURIComponent("One World Relief question");
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
    return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  if (contactForm) {
    const nameField = document.getElementById("nameField");
    const emailField = document.getElementById("emailField");
    const messageField = document.getElementById("messageField");
    const contactSubmit = document.getElementById("contactSubmit");
    const contactSubmitLabel = contactSubmit?.querySelector("[data-contact-submit-label]");
    const contactStatus = document.getElementById("contactFormStatus");
    const contactFields = [nameField, emailField, messageField].filter(Boolean);

    const fieldErrorElements = {
      nameField: document.getElementById("nameFieldError"),
      emailField: document.getElementById("emailFieldError"),
      messageField: document.getElementById("messageFieldError"),
    };

    const setContactStatus = (message = "", state = "") => {
      if (!contactStatus) {
        return;
      }
      contactStatus.textContent = message;
      contactStatus.classList.toggle("success", state === "success");
      contactStatus.classList.toggle("error", state === "error");
    };

    const getContactFieldError = (field) => {
      const value = field.value.trim();
      if (!value) {
        if (field === nameField) {
          return "Please enter your full name.";
        }
        if (field === emailField) {
          return "Please enter your email address.";
        }
        return "Please tell us how we can help.";
      }
      if (field === emailField && field.validity.typeMismatch) {
        return "Enter a valid email address, such as you@example.com.";
      }
      return "";
    };

    const validateContactField = (field) => {
      const error = getContactFieldError(field);
      const errorElement = fieldErrorElements[field.id];
      field.toggleAttribute("aria-invalid", Boolean(error));
      if (errorElement) {
        errorElement.textContent = error;
      }
      return !error;
    };

    contactFields.forEach((field) => {
      field.addEventListener("input", () => {
        if (field.hasAttribute("aria-invalid")) {
          validateContactField(field);
        }
        setContactStatus();
      });
      field.addEventListener("blur", () => {
        if (field.value.trim() || field.hasAttribute("aria-invalid")) {
          validateContactField(field);
        }
      });
    });

    contactForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (contactForm.dataset.submitting === "true") {
        return;
      }

      const invalidFields = contactFields.filter((field) => !validateContactField(field));
      const firstInvalidField = invalidFields[0];
      if (firstInvalidField) {
        setContactStatus("Please review the highlighted fields and try again.", "error");
        firstInvalidField.focus();
        return;
      }

      const mailtoUrl = buildContactMailtoUrl({
        name: nameField.value.trim(),
        email: emailField.value.trim(),
        message: messageField.value.trim(),
      });
      contactForm.dataset.submitting = "true";
      contactForm.setAttribute("aria-busy", "true");
      if (contactSubmit) {
        contactSubmit.disabled = true;
      }
      if (contactSubmitLabel) {
        contactSubmitLabel.textContent = "Opening email\u2026";
      }
      setContactStatus();

      window.requestAnimationFrame(() => {
        try {
          window.location.href = mailtoUrl;
          setContactStatus("Your email app is ready. Send the drafted message to finish.", "success");
        } catch (_error) {
          setContactStatus(`We couldn't open your email app. Please email ${CONTACT_EMAIL} directly.`, "error");
        } finally {
          window.setTimeout(() => {
            delete contactForm.dataset.submitting;
            contactForm.removeAttribute("aria-busy");
            if (contactSubmit) {
              contactSubmit.disabled = false;
            }
            if (contactSubmitLabel) {
              contactSubmitLabel.textContent = "Send Message";
            }
          }, 700);
        }
      });
    });
  }

  if (!donationForm || !statusEl || !donateButton) {
    return;
  }

  if (donationForm.dataset.programCheckout === "true") {
    return;
  }

  const customDonationInput = document.getElementById("customDonation");
  const campaignSelect = document.getElementById("campaignSelect");
  const campaignChoiceButtons = Array.from(donationForm.querySelectorAll("[data-campaign-choice]"));

  populateDonationDestinations(campaignSelect);

  const syncChoiceButtons = (buttons, selectedValue, dataKey) => {
    buttons.forEach((button) => {
      const isSelected = button.dataset[dataKey] === selectedValue;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  };

  const applyDonationParams = () => {
    const params = new URLSearchParams(window.location.search);
    const amount = params.get("amount");
    const campaign = params.get("campaign");
    const hydratedAmount = Number(amount);
    if (amount && Number.isFinite(hydratedAmount) && hydratedAmount >= 5) {
      const amountRadio = Array.from(donationForm.querySelectorAll('input[name="amount"]')).find((radio) => {
        return radio.value === amount;
      });
      if (amountRadio) {
        amountRadio.checked = true;
        if (customDonationInput) {
          customDonationInput.value = "";
        }
      } else {
        donationForm.querySelectorAll('input[name="amount"]').forEach((radio) => {
          radio.checked = false;
        });
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

    syncChoiceButtons(campaignChoiceButtons, campaignSelect?.value || "General Fund", "campaignChoice");
  };

  applyDonationParams();

  donationForm.querySelectorAll('input[name="amount"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked && customDonationInput) {
        customDonationInput.value = "";
        customDonationInput.removeAttribute("aria-invalid");
      }
    });
  });

  if (customDonationInput) {
    customDonationInput.addEventListener("input", () => {
      if (customDonationInput.value) {
        donationForm.querySelectorAll('input[name="amount"]').forEach((radio) => {
          radio.checked = false;
        });
      }
      const amount = Number(customDonationInput.value);
      const isInvalid = Boolean(customDonationInput.value) && (!Number.isFinite(amount) || amount < 5);
      customDonationInput.toggleAttribute("aria-invalid", isInvalid);
    });
  }

  campaignChoiceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!campaignSelect) {
        return;
      }
      campaignSelect.value = button.dataset.campaignChoice || campaignSelect.value;
      syncChoiceButtons(campaignChoiceButtons, campaignSelect.value, "campaignChoice");
    });
  });

  if (campaignSelect) {
    campaignSelect.addEventListener("change", () => {
      syncChoiceButtons(campaignChoiceButtons, campaignSelect.value, "campaignChoice");
    });
  }

  const setStatus = (message, isError) => {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  };

  const getDonationAmount = () => {
    if (customDonationInput?.value) {
      return Number(customDonationInput.value);
    }
    const selected = donationForm.querySelector('input[name="amount"]:checked');
    return selected ? Number(selected.value) : 0;
  };

  donationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("", false);

    const donorName = document.getElementById("donorName").value.trim();
    const donorEmail = document.getElementById("donorEmail").value.trim();
    const campaign = document.getElementById("campaignSelect")?.value || "General Fund";
    const donorNote = document.getElementById("donorNote")?.value.trim() || "";
    const anonymousDonation = Boolean(document.getElementById("anonymousDonation")?.checked);
    const amountUsd = getDonationAmount();

    if (!donorName || !donorEmail) {
      setStatus("Please enter your name and email.", true);
      return;
    }
    if (!Number.isFinite(amountUsd) || amountUsd < 5) {
      setStatus("Please select or enter a donation amount of at least $5.", true);
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
          payment_method: "stripe",
          campaign,
          giving_frequency: "one_time",
          donor_note: donorNote,
          anonymous_public: anonymousDonation,
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
      donateButton.textContent = "Continue to secure checkout →";
    }
  });
})();
