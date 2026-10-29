(() => {
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const input = document.getElementById('quickCustomAmount');
  const choices = [...document.querySelectorAll('[data-gift]')];
  const syncChoices = () => choices.forEach(button => {
    button.setAttribute('aria-pressed', String(Number(input?.value) === Number(button.dataset.gift)));
  });
  choices.forEach(button => button.addEventListener('click', () => {
    if (!input) return;
    input.value = button.dataset.gift;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }));
  input?.addEventListener('input', syncChoices);
  window.addEventListener('pageshow', syncChoices);
  syncChoices();

  const rotationToggle = document.getElementById('caseFlowToggle');
  const projectFlow = document.querySelector('.home-case-flow');
  const projectTrack = projectFlow?.querySelector('.case-flow-track');
  if (rotationToggle && projectFlow && projectTrack) {
    const mobileLayout = matchMedia('(max-width: 720px)');
    const shell = projectFlow.querySelector('.case-flow-shell');
    const originals = [...projectTrack.querySelectorAll('.case-flow-card:not([aria-hidden="true"])')];
    let isVisible = false;
    let measureFrame = 0;
    let lastDistance = 0;
    const syncRotation = () => {
      projectFlow.classList.toggle('is-motion-idle', !isVisible || document.hidden || motionPreference.matches);
    };
    const measureLoop = () => {
      measureFrame = 0;
      if (!originals.length || !shell) return;
      const copies = [...projectTrack.querySelectorAll('.case-flow-card[aria-hidden="true"]')];
      if (mobileLayout.matches || motionPreference.matches) {
        copies.forEach(card => card.remove());
        projectFlow.classList.remove('is-loop-ready');
        lastDistance = 0;
        return;
      }

      // Read geometry before writing, and only on resize (never on scroll/re-entry).
      const first = originals[0].getBoundingClientRect();
      const last = originals[originals.length - 1].getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(projectTrack).columnGap) || 0;
      const distance = last.right - first.left + gap;
      const viewportWidth = shell.clientWidth;
      if (distance <= 0) return;
      // Two sets normally suffice; wide monitors still get continuous coverage.
      const repeats = Math.max(1, Math.ceil(viewportWidth / distance));
      const desiredCopies = originals.length * repeats;
      if (copies.length !== desiredCopies) {
        copies.forEach(card => card.remove());
        const fragment = document.createDocumentFragment();
        for (let repeat = 0; repeat < repeats; repeat += 1) {
          originals.forEach(card => {
            const copy = card.cloneNode(true);
            copy.setAttribute('aria-hidden', 'true');
            copy.setAttribute('tabindex', '-1');
            copy.removeAttribute('aria-label');
            copy.querySelector('img')?.setAttribute('alt', '');
            fragment.append(copy);
          });
        }
        projectTrack.append(fragment);
      }
      if (Math.abs(distance - lastDistance) > .25) {
        projectTrack.style.setProperty('--case-flow-distance', `${distance}px`);
        lastDistance = distance;
      }
      projectFlow.classList.add('is-loop-ready');
    };
    const scheduleMeasure = () => {
      if (!measureFrame) measureFrame = requestAnimationFrame(measureLoop);
    };
    measureLoop();
    if ('ResizeObserver' in window && shell) {
      const resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(shell);
      if (originals[0]) resizeObserver.observe(originals[0]);
    } else {
      window.addEventListener('resize', scheduleMeasure, { passive: true });
    }
    mobileLayout.addEventListener?.('change', scheduleMeasure);
    motionPreference.addEventListener?.('change', () => {
      scheduleMeasure();
      syncRotation();
    });
    document.addEventListener('visibilitychange', syncRotation);
    window.addEventListener('pageshow', () => { scheduleMeasure(); syncRotation(); });
    if ('IntersectionObserver' in window) {
      const flowObserver = new IntersectionObserver(entries => {
        isVisible = entries.some(entry => entry.isIntersecting);
        syncRotation();
      });
      flowObserver.observe(projectFlow);
      // Warm the small thumbnails before they reach the viewport, not mid-scroll.
      const imageObserver = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        imageObserver.disconnect();
        if (navigator.connection?.saveData) return;
        originals.forEach(card => {
          const image = card.querySelector('img');
          if (!image) return;
          image.loading = 'eager';
          image.decode?.().catch(() => {});
        });
      }, { rootMargin: '400px 0px' });
      imageObserver.observe(projectFlow);
    } else {
      isVisible = true;
    }
    syncRotation();
    rotationToggle.hidden = false;
    rotationToggle.addEventListener('click', () => {
      const paused = projectFlow.classList.toggle('is-paused');
      rotationToggle.setAttribute('aria-pressed', String(paused));
      rotationToggle.textContent = paused ? 'Resume rotation' : 'Pause rotation';
    });
  }

  const strip = document.querySelector('.welcome-impact');
  if (!strip) return;
  let frameId = 0;
  let numbers = [];
  const finish = () => {
    cancelAnimationFrame(frameId);
    frameId = 0;
    numbers.forEach(({ element, label }) => { element.textContent = label; });
  };
  const animate = () => {
    strip.classList.add('is-visible');
    if (motionPreference.matches || document.hidden) return;
    numbers = [...strip.querySelectorAll('.welcome-stat strong')].map(element => ({
      element,
      label: element.textContent,
      target: Number(element.textContent.replaceAll(',', ''))
    })).filter(({ target }) => Number.isFinite(target));
    numbers.forEach(({ element, label }) => element.setAttribute('aria-label', label));
    const formatter = new Intl.NumberFormat('en-US');
    const start = performance.now();
    const frame = now => {
      const progress = Math.min(Math.max((now - start) / 850, 0), 1);
      const eased = 1 - (1 - progress) ** 3;
      numbers.forEach(({ element, target }) => {
        const value = formatter.format(Math.round(target * eased));
        if (element.textContent !== value) element.textContent = value;
      });
      if (progress < 1) frameId = requestAnimationFrame(frame);
      else finish();
    };
    frameId = requestAnimationFrame(frame);
  };
  motionPreference.addEventListener?.('change', event => {
    if (event.matches) finish();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finish();
  });
  if (!('IntersectionObserver' in window)) { animate(); return; }
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { animate(); observer.disconnect(); }
  }, { threshold: 0.3 });
  observer.observe(strip);
})();
