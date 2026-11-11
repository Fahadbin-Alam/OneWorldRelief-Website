// One World Relief case pages: tap-to-enlarge photo viewer and a "More cases" strip.
// Loaded after project-data.js on projects/case-NNN.html. Both features are additive:
// without JavaScript the page shows the same photos and links as before.
(() => {
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);

  // ---------- Photo viewer ----------
  const photos = [...document.querySelectorAll(".project-proof-grid .proof-card img, .project-detail-feature img")]
    .filter((image) => !image.closest("a"));

  if (photos.length && typeof HTMLDialogElement === "function") {
    const viewer = document.createElement("dialog");
    viewer.className = "case-photo-viewer";
    viewer.setAttribute("aria-label", "Case photo viewer");
    viewer.innerHTML = `
      <figure class="case-photo-viewer-frame">
        <img alt="" />
        <figcaption>
          <span class="case-photo-viewer-caption"></span>
          <span class="case-photo-viewer-count" aria-live="polite"></span>
        </figcaption>
      </figure>
      <button class="case-photo-viewer-close" type="button" aria-label="Close photo">&times;</button>
      <button class="case-photo-viewer-step case-photo-viewer-prev" type="button" aria-label="Previous photo">&#8249;</button>
      <button class="case-photo-viewer-step case-photo-viewer-next" type="button" aria-label="Next photo">&#8250;</button>
    `;
    document.body.append(viewer);

    const viewerImage = viewer.querySelector("img");
    const caption = viewer.querySelector(".case-photo-viewer-caption");
    const count = viewer.querySelector(".case-photo-viewer-count");
    const stepButtons = viewer.querySelectorAll(".case-photo-viewer-step");
    let current = 0;
    let returnFocus = null;

    const show = (index) => {
      current = (index + photos.length) % photos.length;
      const photo = photos[current];
      viewerImage.src = photo.currentSrc || photo.src;
      viewerImage.alt = photo.alt;
      caption.textContent = photo.closest("figure")?.querySelector("figcaption")?.textContent.trim() || photo.alt;
      count.textContent = photos.length > 1 ? `${current + 1} of ${photos.length}` : "";
    };

    const open = (index) => {
      returnFocus = photos[index];
      show(index);
      stepButtons.forEach((button) => { button.hidden = photos.length < 2; });
      viewer.showModal();
      document.documentElement.classList.add("case-photo-viewer-open");
    };

    viewer.addEventListener("close", () => {
      document.documentElement.classList.remove("case-photo-viewer-open");
      returnFocus?.focus({ preventScroll: true });
    });
    viewer.querySelector(".case-photo-viewer-close").addEventListener("click", () => viewer.close());
    viewer.querySelector(".case-photo-viewer-prev").addEventListener("click", () => show(current - 1));
    viewer.querySelector(".case-photo-viewer-next").addEventListener("click", () => show(current + 1));
    // Clicking the dark backdrop (outside the photo and buttons) closes the viewer.
    viewer.addEventListener("click", (event) => {
      if (event.target === viewer || event.target.classList.contains("case-photo-viewer-frame")) viewer.close();
    });
    viewer.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") show(current - 1);
      if (event.key === "ArrowRight") show(current + 1);
    });

    // Swipe left or right on phones.
    let touchStartX = null;
    viewer.addEventListener("touchstart", (event) => { touchStartX = event.touches[0].clientX; }, { passive: true });
    viewer.addEventListener("touchend", (event) => {
      if (touchStartX === null) return;
      const distance = event.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(distance) > 50 && photos.length > 1) show(current + (distance < 0 ? 1 : -1));
    });

    photos.forEach((photo, index) => {
      photo.classList.add("case-photo-zoomable");
      photo.tabIndex = 0;
      photo.setAttribute("role", "button");
      photo.setAttribute("aria-label", `Enlarge photo: ${photo.alt}`);
      photo.addEventListener("click", () => open(index));
      photo.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open(index);
        }
      });
    });
  }

  // ---------- More cases ----------
  const projects = Array.isArray(window.ONE_WORLD_RELIEF_PROJECTS) ? window.ONE_WORLD_RELIEF_PROJECTS : [];
  const currentFile = location.pathname.split("/").pop().replace(/\.html$/, "");
  const currentIndex = projects.findIndex((project) =>
    String(project.mediaUrl || "").replace(/^projects\//, "").replace(/\.html$/, "") === currentFile);
  const main = document.querySelector("main");
  if (currentIndex < 0 || !main) return;

  // The next cases in order (wrapping around), skipping any without a photo yet.
  const others = [];
  for (let step = 1; step < projects.length && others.length < 3; step += 1) {
    const project = projects[(currentIndex + step) % projects.length];
    if (project.thumbnailUrl && project.mediaUrl) others.push(project);
  }
  if (!others.length) return;

  const section = document.createElement("section");
  section.className = "container project-detail-section case-more";
  section.setAttribute("aria-labelledby", "caseMoreTitle");
  section.innerHTML = `
    <div class="case-more-heading">
      <h2 id="caseMoreTitle">More cases</h2>
      <a href="../projects.html">See all projects <span aria-hidden="true">&rarr;</span></a>
    </div>
    <div class="case-more-grid">
      ${others.map((project) => {
        const status = String(project.status || "");
        const detail = /completed/i.test(status) && project.amountRaised
          ? `${escapeHtml(project.amountRaised)} delivered`
          : escapeHtml(status);
        return `
          <a class="case-more-card" href="../${escapeHtml(project.mediaUrl)}">
            <img src="../${escapeHtml(project.thumbnailUrl)}" alt="" loading="lazy" decoding="async" />
            <span class="case-more-copy">
              <small>${escapeHtml(project.date)} &middot; ${escapeHtml(project.category)}</small>
              <strong>${escapeHtml(project.title)}</strong>
              <span>${detail}</span>
            </span>
          </a>`;
      }).join("")}
    </div>
  `;
  main.append(section);
})();
