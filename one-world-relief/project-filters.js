// One World Relief project board filters and delivered-total counter.
// Runs after the board is rendered; the static filter chips in projects.html stay as a no-JS fallback.
(function () {
  const board = document.getElementById("projectBoard");
  const filterRow = document.querySelector(".project-filter-row");
  const stats = document.getElementById("projectStats");
  const projects = Array.isArray(window.ONE_WORLD_RELIEF_PROJECTS) ? window.ONE_WORLD_RELIEF_PROJECTS : [];
  if (!board || !filterRow || !projects.length) {
    return;
  }

  const cards = Array.from(board.querySelectorAll(".project-card"));
  if (cards.length !== projects.length) {
    return;
  }

  const normalize = (value) => String(value || "").trim().toLowerCase();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const formatUsd = (value) => `$${Math.round(value).toLocaleString("en-US")}`;

  const parseCost = (project) => {
    const cost = Number(String(project.amountRaised || "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(cost) && cost > 0 ? cost : 0;
  };

  // Each card is tagged so filtering never depends on the card's visible text.
  cards.forEach((card, index) => {
    const project = projects[index];
    card.dataset.category = normalize(project.category);
    card.dataset.status = normalize(project.status);
  });

  const categories = [];
  projects.forEach((project) => {
    const label = String(project.category || "").trim();
    if (label && !categories.some((entry) => entry.label === label)) {
      categories.push({ label, key: normalize(label), type: "category" });
    }
  });
  const statusFilters = [
    { label: "Completed", key: "completed", type: "status" },
    { label: "Coming Soon", key: "coming soon", type: "status" },
  ].filter((entry) => projects.some((project) => normalize(project.status) === entry.key));

  const filters = [{ label: "All projects", key: "all", type: "all" }, ...statusFilters, ...categories];

  const countFor = (filter) => {
    if (filter.type === "all") {
      return projects.length;
    }
    return projects.filter((project) => normalize(project[filter.type]) === filter.key).length;
  };

  const matches = (card, filter) => {
    if (filter.type === "all") {
      return true;
    }
    return card.dataset[filter.type] === filter.key;
  };

  let activeKey = "all";
  const buttons = new Map();

  const showCard = (card) => {
    if (!card.hidden) {
      return;
    }
    card.hidden = false;
    if (reducedMotion.matches || typeof card.animate !== "function") {
      return;
    }
    card.animate(
      [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 260, easing: "cubic-bezier(.2,.8,.25,1)" }
    );
  };

  const applyFilter = (filter) => {
    activeKey = filter.key;
    let visible = 0;
    cards.forEach((card) => {
      if (matches(card, filter)) {
        showCard(card);
        visible += 1;
      } else {
        card.hidden = true;
      }
    });
    buttons.forEach((button, key) => {
      const isActive = key === filter.key;
      button.setAttribute("aria-pressed", String(isActive));
      button.classList.toggle("is-active", isActive);
    });
    board.setAttribute("data-filter", filter.key);
    if (liveNote) {
      liveNote.textContent = filter.type === "all"
        ? `Showing all ${visible} projects.`
        : `Showing ${visible} ${filter.label.toLowerCase()} ${visible === 1 ? "project" : "projects"}.`;
    }
  };

  // Replace the static chips with real buttons that carry counts.
  filterRow.replaceChildren();
  filterRow.setAttribute("role", "group");
  filterRow.setAttribute("aria-label", "Filter projects");
  filters.forEach((filter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-filter-button";
    button.dataset.filterKey = filter.key;
    button.setAttribute("aria-pressed", "false");
    const label = document.createElement("span");
    label.textContent = filter.label;
    const count = document.createElement("small");
    count.textContent = String(countFor(filter));
    count.setAttribute("aria-label", `${countFor(filter)} ${countFor(filter) === 1 ? "project" : "projects"}`);
    button.append(label, count);
    button.addEventListener("click", () => applyFilter(filter));
    buttons.set(filter.key, button);
    filterRow.appendChild(button);
  });

  const liveNote = document.createElement("p");
  liveNote.className = "project-filter-note";
  liveNote.setAttribute("role", "status");
  liveNote.setAttribute("aria-live", "polite");
  filterRow.insertAdjacentElement("afterend", liveNote);

  // A running total of confirmed, completed project costs, counted up on first view.
  const completed = projects.filter((project) => normalize(project.status) === "completed");
  const totalDelivered = completed.reduce((sum, project) => sum + parseCost(project), 0);
  if (stats && totalDelivered > 0) {
    const chip = document.createElement("span");
    chip.className = "project-total-delivered";
    const value = document.createElement("strong");
    value.textContent = formatUsd(0);
    value.setAttribute("aria-label", `${formatUsd(totalDelivered)} delivered`);
    const text = document.createElement("em");
    text.textContent = ` delivered across ${completed.length} completed ${completed.length === 1 ? "case" : "cases"}`;
    chip.append(value, text);
    stats.appendChild(chip);

    const finish = () => {
      value.textContent = formatUsd(totalDelivered);
    };
    const countUp = () => {
      if (reducedMotion.matches || typeof window.requestAnimationFrame !== "function") {
        finish();
        return;
      }
      const start = performance.now();
      const duration = 1200;
      const frame = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - (1 - progress) ** 3;
        value.textContent = formatUsd(totalDelivered * eased);
        if (progress < 1) {
          window.requestAnimationFrame(frame);
        } else {
          finish();
        }
      };
      window.requestAnimationFrame(frame);
    };

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          countUp();
        }
      }, { threshold: 0.4 });
      observer.observe(chip);
    } else {
      finish();
    }
  }

  // Deep links like projects.html#filter=feeding open on that filter.
  const requested = normalize(decodeURIComponent((window.location.hash.match(/filter=([^&]+)/) || [])[1] || ""));
  const initial = filters.find((filter) => filter.key === requested) || filters[0];
  applyFilter(initial);
})();
