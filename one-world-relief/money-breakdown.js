// One World Relief "Where the money goes" totals, recomputed from project-data.js so the page never drifts
// from the projects board. The HTML holds the same numbers as a no-JS fallback.
(function () {
  const projects = Array.isArray(window.ONE_WORLD_RELIEF_PROJECTS) ? window.ONE_WORLD_RELIEF_PROJECTS : [];
  const list = document.getElementById("moneyBars");
  const total = document.getElementById("moneyDeliveredTotal");
  const note = document.getElementById("moneyDeliveredNote");
  if (!list || !projects.length) {
    return;
  }

  const formatUsd = (value) => `$${Math.round(value).toLocaleString("en-US")}`;
  const completed = projects
    .filter((project) => String(project.status || "").toLowerCase().includes("completed"))
    .map((project) => ({
      category: String(project.category || "Other").trim(),
      cost: Number(String(project.amountRaised || "").replace(/[^0-9.]/g, "")),
    }))
    .filter((project) => Number.isFinite(project.cost) && project.cost > 0);
  if (!completed.length) {
    return;
  }

  const byCategory = new Map();
  completed.forEach(({ category, cost }) => {
    const entry = byCategory.get(category) || { cost: 0, cases: 0 };
    entry.cost += cost;
    entry.cases += 1;
    byCategory.set(category, entry);
  });
  const rows = [...byCategory.entries()].sort((left, right) => right[1].cost - left[1].cost);
  const sum = completed.reduce((running, project) => running + project.cost, 0);
  const largest = rows[0][1].cost;

  if (total) total.textContent = formatUsd(sum);
  if (note) {
    note.textContent = `Across ${completed.length} completed case${completed.length === 1 ? "" : "s"}, each with its own public case page.`;
  }

  list.replaceChildren(...rows.map(([category, entry]) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = category;
    const cases = document.createElement("small");
    cases.textContent = `${entry.cases} case${entry.cases === 1 ? "" : "s"}`;
    label.appendChild(cases);
    const track = document.createElement("span");
    track.className = "money-bar-track";
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(4, Math.round((entry.cost / largest) * 100))}%`;
    track.appendChild(fill);
    const amount = document.createElement("strong");
    amount.textContent = formatUsd(entry.cost);
    item.append(label, track, amount);
    return item;
  }));
})();
