import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../home-welcome.js", import.meta.url), "utf8");

// Exercise the shipped controller with controllable browser geometry and events.
// This lets the scroll-path tests detect accidental layout reads, not just output.
function createSlider({ mobile = false, reduced = false, width = 1440, saveData = false } = {}) {
  let geometryReads = 0;
  let styleReads = 0;
  let cardWidth = 360;
  let gap = 20;
  let translation = -40;
  let nextFrame = 1;
  const frames = new Map();
  const resizeObservers = [];
  const intersectionObservers = [];

  class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    emit(type, detail = {}) {
      for (const listener of this.listeners.get(type) || []) listener(detail);
    }
  }

  class Element extends Events {
    constructor(attributes = {}) {
      super();
      this.attributes = { ...attributes };
      const classes = new Set();
      this.classList = {
        add: (...values) => values.forEach(value => classes.add(value)),
        remove: (...values) => values.forEach(value => classes.delete(value)),
        contains: value => classes.has(value),
        toggle(value, force) {
          const enabled = force === undefined ? !classes.has(value) : force;
          if (enabled) classes.add(value);
          else classes.delete(value);
          return enabled;
        },
      };
      this.styles = new Map();
      this.style = { setProperty: (name, value) => this.styles.set(name, value) };
    }
    getAttribute(name) { return this.attributes[name] ?? null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
  }

  class Card extends Element {
    constructor(index) {
      super({ "aria-label": `Open project ${index + 1}`, href: `projects/case-${index + 1}.html` });
      this.index = index;
      this.style.setProperty("--card-lift", ["0px", "1.8rem", ".85rem"][index % 3]);
      this.image = new Element({ alt: `Project ${index + 1}` });
      this.image.loading = "lazy";
      this.image.decodeCalls = 0;
      this.image.decode = () => {
        this.image.decodeCalls += 1;
        return Promise.resolve();
      };
    }
    querySelector(selector) { return selector === "img" ? this.image : null; }
    cloneNode() {
      const copy = new Card(this.index);
      copy.attributes = { ...this.attributes };
      copy.styles = new Map(this.styles);
      copy.image.attributes = { ...this.image.attributes };
      return copy;
    }
    remove() { track.cards.splice(track.cards.indexOf(this), 1); }
    getBoundingClientRect() {
      geometryReads += 1;
      const left = translation + track.cards.indexOf(this) * (cardWidth + gap);
      return { left, right: left + cardWidth, width: cardWidth };
    }
  }

  const track = new Element();
  track.cards = Array.from({ length: 7 }, (_, index) => new Card(index));
  track.querySelectorAll = selector => {
    if (selector === '.case-flow-card:not([aria-hidden="true"])') {
      return track.cards.filter(card => card.getAttribute("aria-hidden") !== "true");
    }
    if (selector === '.case-flow-card[aria-hidden="true"]') {
      return track.cards.filter(card => card.getAttribute("aria-hidden") === "true");
    }
    throw new Error(`Unimplemented selector: ${selector}`);
  };
  track.append = fragment => track.cards.push(...fragment.children);
  const originals = [...track.cards];
  const shell = { get clientWidth() { geometryReads += 1; return width; } };
  const flow = new Element();
  flow.querySelector = selector => selector === ".case-flow-track" ? track
    : selector === ".case-flow-shell" ? shell : null;
  const toggle = new Element({ "aria-pressed": "false" });
  toggle.hidden = true;
  const document = new Events();
  document.hidden = false;
  document.getElementById = id => id === "caseFlowToggle" ? toggle : null;
  document.querySelector = selector => selector === ".home-case-flow" ? flow : null;
  document.querySelectorAll = () => [];
  document.createDocumentFragment = () => ({ children: [], append(card) { this.children.push(card); } });

  const media = new Map([
    ["(prefers-reduced-motion: reduce)", Object.assign(new Events(), { matches: reduced })],
    ["(max-width: 720px)", Object.assign(new Events(), { matches: mobile })],
  ]);
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = []; resizeObservers.push(this); }
    observe(target) { this.targets.push(target); }
  }
  class IntersectionObserver {
    constructor(callback, options = {}) {
      this.callback = callback;
      this.options = options;
      this.disconnected = false;
      intersectionObservers.push(this);
    }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  }
  const window = Object.assign(new Events(), { ResizeObserver, IntersectionObserver });
  runInNewContext(source, {
    window, document, ResizeObserver, IntersectionObserver,
    navigator: { connection: { saveData } },
    matchMedia: query => media.get(query),
    getComputedStyle: () => { styleReads += 1; return { columnGap: `${gap}px` }; },
    requestAnimationFrame: callback => { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  });

  return {
    track, originals, flow, toggle, document, window, resizeObservers, intersectionObservers,
    get readCounts() { return { geometry: geometryReads, style: styleReads }; },
    get queuedFrames() { return frames.size; },
    flushFrames() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback(0));
    },
    setGeometry(next = {}) {
      width = next.width ?? width;
      cardWidth = next.cardWidth ?? cardWidth;
      gap = next.gap ?? gap;
      translation = next.translation ?? translation;
      resizeObservers.forEach(observer => observer.callback([]));
    },
    setMedia(query, matches) {
      const preference = media.get(query);
      preference.matches = matches;
      preference.emit("change", { matches });
    },
    intersect(visible) {
      intersectionObservers.find(observer => !observer.options.rootMargin)
        .callback([{ isIntersecting: visible, target: flow }]);
    },
    warmImages() {
      intersectionObservers.find(observer => observer.options.rootMargin)
        .callback([{ isIntersecting: true, target: flow }]);
    },
  };
}

test("desktop loop uses one extra set with a measured seam and accessible originals", () => {
  const slider = createSlider();
  assert.equal(slider.track.cards.length, 14);
  assert.equal(slider.track.styles.get("--case-flow-distance"), "2660px");
  assert.equal(slider.flow.classList.contains("is-loop-ready"), true);
  assert.equal(slider.toggle.hidden, false);
  assert.deepEqual(slider.track.cards.slice(0, 7), slider.originals);
  for (const [index, copy] of slider.track.cards.slice(7).entries()) {
    assert.equal(copy.getAttribute("aria-hidden"), "true");
    assert.equal(copy.getAttribute("tabindex"), "-1");
    assert.equal(copy.getAttribute("aria-label"), null);
    assert.equal(copy.image.getAttribute("alt"), "");
    assert.equal(copy.getAttribute("href"), slider.originals[index].getAttribute("href"));
    assert.equal(copy.styles.get("--card-lift"), slider.originals[index].styles.get("--card-lift"));
    assert.notEqual(slider.originals[index].getAttribute("aria-label"), null);
  }
});

test("ultrawide viewport gets enough copies for continuous coverage, but no surplus set", () => {
  const slider = createSlider({ width: 5200 });
  assert.equal(slider.track.cards.length, 21);
  const distance = Number.parseFloat(slider.track.styles.get("--case-flow-distance"));
  assert.ok(distance * 2 >= 5200);
  assert.ok(distance < 5200);
});

test("scrolling out and back changes rotation state without measuring layout or rebuilding cards", () => {
  const slider = createSlider();
  const reads = slider.readCounts;
  const cards = [...slider.track.cards];
  slider.intersect(true);
  assert.equal(slider.flow.classList.contains("is-motion-idle"), false);
  slider.intersect(false);
  assert.equal(slider.flow.classList.contains("is-motion-idle"), true);
  slider.intersect(true);
  assert.equal(slider.flow.classList.contains("is-motion-idle"), false);
  assert.deepEqual(slider.readCounts, reads);
  assert.deepEqual(slider.track.cards, cards);
  assert.equal(slider.queuedFrames, 0);
});

test("a visitor's pause survives offscreen, hidden-tab and page restoration changes", () => {
  const slider = createSlider();
  slider.intersect(true);
  slider.toggle.emit("click");
  assert.equal(slider.toggle.getAttribute("aria-pressed"), "true");
  assert.equal(slider.toggle.textContent, "Resume rotation");
  slider.intersect(false);
  slider.document.hidden = true;
  slider.document.emit("visibilitychange");
  slider.document.hidden = false;
  slider.document.emit("visibilitychange");
  slider.intersect(true);
  slider.window.emit("pageshow");
  slider.flushFrames();
  assert.equal(slider.flow.classList.contains("is-paused"), true);
  slider.toggle.emit("click");
  assert.equal(slider.flow.classList.contains("is-paused"), false);
  assert.equal(slider.toggle.getAttribute("aria-pressed"), "false");
  assert.equal(slider.toggle.textContent, "Pause rotation");
});

test("mobile and reduced-motion layouts start with originals only and no layout measurements", () => {
  for (const options of [{ mobile: true }, { reduced: true }]) {
    const slider = createSlider(options);
    assert.equal(slider.track.cards.length, 7);
    assert.equal(slider.flow.classList.contains("is-loop-ready"), false);
    assert.deepEqual(slider.readCounts, { geometry: 0, style: 0 });
  }
});

test("responsive changes rebuild only the needed copies and preserve the original links", () => {
  const slider = createSlider({ mobile: true });
  slider.setMedia("(max-width: 720px)", false);
  slider.flushFrames();
  assert.equal(slider.track.cards.length, 14);
  slider.setGeometry({ width: 5200 });
  slider.flushFrames();
  assert.equal(slider.track.cards.length, 21);
  slider.setMedia("(max-width: 720px)", true);
  slider.flushFrames();
  assert.deepEqual(slider.track.cards, slider.originals);
  assert.equal(slider.flow.classList.contains("is-loop-ready"), false);
});

test("a live reduced-motion preference change removes copies and recreates the loop when restored", () => {
  const slider = createSlider();
  slider.intersect(true);
  slider.setMedia("(prefers-reduced-motion: reduce)", true);
  slider.flushFrames();
  assert.equal(slider.track.cards.length, 7);
  assert.equal(slider.flow.classList.contains("is-motion-idle"), true);
  slider.setMedia("(prefers-reduced-motion: reduce)", false);
  slider.flushFrames();
  assert.equal(slider.track.cards.length, 14);
  assert.equal(slider.flow.classList.contains("is-loop-ready"), true);
  assert.equal(slider.flow.classList.contains("is-motion-idle"), false);
});

test("resize notifications coalesce and update seam geometry without being affected by animation position", () => {
  const slider = createSlider();
  const reads = slider.readCounts;
  const copies = slider.track.cards.slice(7);
  slider.setGeometry({ cardWidth: 320, gap: 12, translation: -900 });
  slider.setGeometry({ translation: -1200 });
  slider.setGeometry({ translation: -1800 });
  assert.equal(slider.queuedFrames, 1);
  assert.deepEqual(slider.readCounts, reads);
  slider.flushFrames();
  assert.equal(slider.track.styles.get("--case-flow-distance"), "2324px");
  assert.deepEqual(slider.track.cards.slice(7), copies);
  assert.equal(slider.readCounts.geometry - reads.geometry, 3);
});

test("nearby thumbnails warm without measuring layout, while data-saving mode stays lazy", () => {
  const slider = createSlider();
  const reads = slider.readCounts;
  slider.warmImages();
  assert.deepEqual(slider.readCounts, reads);
  assert.ok(slider.originals.every(card => card.image.loading === "eager" && card.image.decodeCalls === 1));
  assert.equal(slider.intersectionObservers.find(observer => observer.options.rootMargin).disconnected, true);
  const saving = createSlider({ saveData: true });
  saving.warmImages();
  assert.ok(saving.originals.every(card => card.image.loading === "lazy" && card.image.decodeCalls === 0));
});
