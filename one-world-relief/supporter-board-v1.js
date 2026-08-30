// One World Relief public supporter board.
(function () {
  const board = document.getElementById("supporterBoard");
  const boardGrid = document.getElementById("homeSupporterBoardGrid");
  const status = document.getElementById("supporterBoardStatus");
  const topList = document.getElementById("topSupportersList");
  const recentList = document.getElementById("recentSupportList");
  const topLoading = document.getElementById("topSupportersLoading");
  const recentLoading = document.getElementById("recentSupportLoading");
  const topEmpty = document.getElementById("topSupportersEmpty");
  const recentEmpty = document.getElementById("recentSupportEmpty");
  const periodLabel = document.getElementById("topSupportersPeriod");
  const updateLabel = document.getElementById("supporterBoardUpdateLabel");

  if (!board || !boardGrid || !status || !topList || !recentList) {
    return;
  }

  const LEADERBOARD_URL = "/charity/donors/leaderboard";
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const updateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });

  const cleanText = (value, maximumLength) => {
    if (typeof value !== "string") {
      return "";
    }
    return value.replace(/\s+/g, " ").trim().slice(0, maximumLength);
  };

  const validAmount = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  };

  const setStatus = (message, state = "") => {
    status.textContent = message;
    status.classList.toggle("error", state === "error");
  };

  const setEmptyCopy = (container, heading, message) => {
    if (!container) {
      return;
    }
    const title = container.querySelector("strong");
    const copy = container.querySelector("p");
    if (title) title.textContent = heading;
    if (copy) copy.textContent = message;
  };

  const buildSkeletonRows = (container) => {
    if (!container) {
      return;
    }
    container.replaceChildren();
    for (let index = 0; index < 5; index += 1) {
      const row = document.createElement("span");
      row.className = "home-supporter-skeleton-row";
      row.setAttribute("aria-hidden", "true");

      const marker = document.createElement("span");
      marker.className = "home-supporter-skeleton-marker";
      const name = document.createElement("span");
      name.className = "home-supporter-skeleton-name";
      const amount = document.createElement("span");
      amount.className = "home-supporter-skeleton-amount";

      row.append(marker, name, amount);
      container.appendChild(row);
    }
  };

  const showLoading = () => {
    boardGrid.setAttribute("aria-busy", "true");
    board.classList.remove("is-error", "is-ready");
    topList.hidden = true;
    recentList.hidden = true;
    if (topEmpty) topEmpty.hidden = true;
    if (recentEmpty) recentEmpty.hidden = true;
    if (topLoading) {
      buildSkeletonRows(topLoading);
      topLoading.hidden = false;
    }
    if (recentLoading) {
      buildSkeletonRows(recentLoading);
      recentLoading.hidden = false;
    }
    if (updateLabel) updateLabel.textContent = "Loading";
    setStatus("Loading public supporter activity…");
  };

  const hideLoading = () => {
    if (topLoading) topLoading.hidden = true;
    if (recentLoading) recentLoading.hidden = true;
    boardGrid.setAttribute("aria-busy", "false");
  };

  const createNameBlock = (displayName, supportingText) => {
    const copy = document.createElement("span");
    copy.className = "home-supporter-row-copy";

    const name = document.createElement("strong");
    name.textContent = displayName;
    copy.appendChild(name);

    if (supportingText) {
      const detail = document.createElement("small");
      detail.textContent = supportingText;
      copy.appendChild(detail);
    }

    return copy;
  };

  const renderTopSupporters = (entries) => {
    topList.replaceChildren();
    const validEntries = (Array.isArray(entries) ? entries : []).slice(0, 10).filter((entry) => {
      return entry && cleanText(entry.display_name, 40) && validAmount(entry.total_usd);
    });

    if (!validEntries.length) {
      topList.hidden = true;
      if (topEmpty) topEmpty.hidden = false;
      return 0;
    }

    validEntries.forEach((entry, index) => {
      const rankValue = Number(entry.rank);
      const rank = Number.isInteger(rankValue) && rankValue >= 1 && rankValue <= 10
        ? rankValue
        : index + 1;
      const donationCountValue = Number(entry.donation_count);
      const donationCount = Number.isInteger(donationCountValue) && donationCountValue > 0
        ? donationCountValue
        : 0;
      const item = document.createElement("li");
      item.className = `home-supporter-row home-supporter-rank-${Math.min(rank, 4)}`;

      const rankMarker = document.createElement("span");
      rankMarker.className = "home-supporter-rank";
      rankMarker.textContent = String(rank);
      rankMarker.setAttribute("aria-label", `Rank ${rank}`);

      const giftLabel = donationCount
        ? `${donationCount} public ${donationCount === 1 ? "gift" : "gifts"}`
        : "Confirmed public gifts";
      const nameBlock = createNameBlock(cleanText(entry.display_name, 40), giftLabel);

      const total = document.createElement("strong");
      total.className = "home-supporter-amount";
      total.textContent = currencyFormatter.format(validAmount(entry.total_usd));
      total.setAttribute("aria-label", `${total.textContent} public total`);

      item.append(rankMarker, nameBlock, total);
      topList.appendChild(item);
    });

    if (topEmpty) topEmpty.hidden = true;
    topList.hidden = false;
    return validEntries.length;
  };

  const renderRecentSupport = (entries) => {
    recentList.replaceChildren();
    const validEntries = (Array.isArray(entries) ? entries : []).slice(0, 10).filter((entry) => {
      return entry && cleanText(entry.display_name, 40) && validAmount(entry.amount_usd);
    });

    if (!validEntries.length) {
      recentList.hidden = true;
      if (recentEmpty) recentEmpty.hidden = false;
      return 0;
    }

    validEntries.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "home-supporter-row home-supporter-recent-row";

      const marker = document.createElement("span");
      marker.className = "home-supporter-recent-marker";
      marker.setAttribute("aria-hidden", "true");

      const copy = createNameBlock(cleanText(entry.display_name, 40));
      const detail = document.createElement("small");
      const cause = cleanText(entry.cause, 60) || "One World Relief";
      detail.appendChild(document.createTextNode(cause));

      const donatedAt = cleanText(entry.donated_at, 40);
      const donatedDate = donatedAt ? new Date(donatedAt) : null;
      if (donatedDate && !Number.isNaN(donatedDate.getTime())) {
        const separator = document.createTextNode(" · ");
        const time = document.createElement("time");
        time.dateTime = donatedDate.toISOString();
        time.textContent = dateFormatter.format(donatedDate);
        detail.append(separator, time);
      }
      copy.appendChild(detail);

      const amount = document.createElement("strong");
      amount.className = "home-supporter-amount";
      amount.textContent = currencyFormatter.format(validAmount(entry.amount_usd));

      item.append(marker, copy, amount);
      recentList.appendChild(item);
    });

    if (recentEmpty) recentEmpty.hidden = true;
    recentList.hidden = false;
    return validEntries.length;
  };

  const renderBoard = (payload) => {
    const period = cleanText(payload?.period, 12);
    if (periodLabel && /^\d{4}$/.test(period)) {
      periodLabel.textContent = period;
    }

    const topCount = renderTopSupporters(payload?.top);
    const recentCount = renderRecentSupport(payload?.recent);
    hideLoading();
    board.classList.add("is-ready");

    const generatedAt = cleanText(payload?.generated_at, 40);
    const generatedDate = generatedAt ? new Date(generatedAt) : null;
    if (generatedDate && !Number.isNaN(generatedDate.getTime())) {
      if (updateLabel) updateLabel.textContent = "Updated";
      setStatus(`Updated ${updateFormatter.format(generatedDate)}.`);
    } else if (topCount || recentCount) {
      if (updateLabel) updateLabel.textContent = "Public";
      setStatus("Showing confirmed public supporter activity.");
    } else {
      if (updateLabel) updateLabel.textContent = "Public";
      setStatus("No supporters have chosen to appear publicly yet.");
    }
  };

  const showError = () => {
    hideLoading();
    board.classList.add("is-error");
    topList.hidden = true;
    recentList.hidden = true;
    setEmptyCopy(topEmpty, "Top supporters are unavailable right now.", "Please check back soon. Donations still work normally.");
    setEmptyCopy(recentEmpty, "Recent support is unavailable right now.", "Please check back soon. Donations still work normally.");
    if (topEmpty) topEmpty.hidden = false;
    if (recentEmpty) recentEmpty.hidden = false;
    if (updateLabel) updateLabel.textContent = "Unavailable";
    setStatus("Supporter board is temporarily unavailable. Donations still work normally.", "error");
  };

  let hasLoaded = false;
  const loadBoard = async () => {
    if (hasLoaded) {
      return;
    }
    hasLoaded = true;
    showLoading();

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(LEADERBOARD_URL, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("Supporter board request failed.");
      }
      const payload = await response.json();
      renderBoard(payload);
    } catch (_error) {
      showError();
    } finally {
      window.clearTimeout(timeout);
    }
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        loadBoard();
      }
    }, { rootMargin: "320px 0px", threshold: 0.01 });
    observer.observe(board);
  } else {
    loadBoard();
  }
})();
