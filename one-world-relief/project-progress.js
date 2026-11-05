// One World Relief funding progress bars for upcoming cases on the projects page.
// A bar appears only when a case in project-data.js has a confirmed fundingGoalUsd.
(function () {
  const board = document.getElementById("projectBoard");
  const projects = Array.isArray(window.ONE_WORLD_RELIEF_PROJECTS) ? window.ONE_WORLD_RELIEF_PROJECTS : [];
  if (!board || !projects.length) {
    return;
  }
  const cards = Array.from(board.querySelectorAll(".project-card"));
  if (cards.length !== projects.length) {
    return;
  }

  const formatUsd = (value) => `$${Math.round(value).toLocaleString("en-US")}`;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  cards.forEach((card, index) => {
    const project = projects[index];
    const goal = Number(project.fundingGoalUsd);
    const raised = Math.max(0, Number(project.fundingRaisedUsd) || 0);
    const isCompleted = String(project.status || "").toLowerCase().includes("completed");
    if (isCompleted || !Number.isFinite(goal) || goal <= 0) {
      return;
    }

    const percent = Math.min(100, Math.round((raised / goal) * 100));
    const remaining = Math.max(0, goal - raised);
    const impact = card.querySelector(".project-impact");
    const amountLine = impact?.querySelector("strong");
    if (amountLine) {
      amountLine.textContent = `${formatUsd(goal)} goal`;
    }

    const progress = document.createElement("div");
    progress.className = "project-progress";

    const numbers = document.createElement("p");
    numbers.className = "project-progress-numbers";
    const raisedText = document.createElement("strong");
    raisedText.textContent = `${formatUsd(raised)} raised`;
    const detail = document.createElement("span");
    detail.textContent = remaining > 0 ? `${percent}% · ${formatUsd(remaining)} to go` : "Fully funded";
    numbers.append(raisedText, detail);

    const bar = document.createElement("div");
    bar.className = "project-progress-bar";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(percent));
    bar.setAttribute("aria-label", `${project.title}: ${percent}% funded`);
    const fill = document.createElement("span");
    fill.style.width = reducedMotion ? `${percent}%` : "0%";
    bar.appendChild(fill);

    progress.append(numbers, bar);
    if (project.fundingUpdated) {
      const updated = document.createElement("small");
      updated.textContent = `Updated ${project.fundingUpdated}`;
      progress.appendChild(updated);
    }

    (impact || card.querySelector(".project-actions"))?.after(progress);

    if (!reducedMotion) {
      const grow = () => window.requestAnimationFrame(() => {
        fill.style.width = `${percent}%`;
      });
      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            grow();
          }
        }, { threshold: 0.3 });
        observer.observe(progress);
      } else {
        grow();
      }
    }
  });
})();
