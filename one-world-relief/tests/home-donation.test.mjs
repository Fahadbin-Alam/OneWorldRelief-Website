import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const siteSource = await readFile(new URL("../one-world-relief.js", import.meta.url), "utf8");
const welcomeSource = await readFile(new URL("../home-welcome.js", import.meta.url), "utf8");
const helperStart = siteSource.indexOf("  const buildQuickDonationUrl =");
const helperEnd = siteSource.indexOf("  const setupReveals =", helperStart);
const handlerStart = siteSource.indexOf("  if (quickDonationForm) {");
const handlerEnd = siteSource.indexOf("  const CONTACT_EMAIL =", handlerStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);

// Run the shipped form handler and preset controller together, in their page order.
// Navigation stays inside the fixture; these tests never create a checkout session.
function createDonationForm(initialAmount = "50") {
  class Element {
    constructor(attributes = {}) {
      this.attributes = { ...attributes };
      this.listeners = new Map();
      this.textContent = "";
      this.value = "";
      this.focused = false;
      const classes = new Set();
      this.classList = {
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
        contains(name) { return classes.has(name); },
      };
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    dispatchEvent(event) {
      for (const listener of this.listeners.get(event.type) || []) listener(event);
      return !event.defaultPrevented;
    }
    getAttribute(name) { return this.attributes[name] ?? null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    focus() { this.focused = true; }
  }

  const input = new Element();
  input.value = initialAmount;
  const status = new Element();
  const toggle = new Element({ "aria-pressed": "false" });
  const label = new Element();
  label.textContent = "Choose a cause";
  const form = new Element();
  form.querySelector = selector => selector === ".quick-donation-button > span" ? label : null;
  const choices = [25, 50, 100, 250].map(amount => {
    const button = new Element({ "aria-pressed": String(amount === Number(initialAmount)) });
    button.dataset = { gift: String(amount) };
    return button;
  });
  const elements = { quickCustomAmount: input, quickDonationStatus: status, quickOrphanOption: toggle };
  const window = new Element();
  window.location = { href: "" };
  const context = {
    Event, URLSearchParams, window, quickDonationForm: form,
    document: {
      getElementById: id => elements[id] || null,
      querySelector: () => null,
      querySelectorAll: selector => selector === "[data-gift]" ? choices : [],
    },
    matchMedia: () => ({ matches: false }),
  };
  runInNewContext(siteSource.slice(helperStart, helperEnd) + siteSource.slice(handlerStart, handlerEnd), context);
  runInNewContext(welcomeSource, context);

  return {
    input, status, toggle, label, choices, window,
    toggleOrphan() { toggle.dispatchEvent(new Event("click")); },
    enterAmount(value) {
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    choosePreset(amount) { choices.find(button => button.dataset.gift === String(amount)).dispatchEvent(new Event("click")); },
    submit() {
      const event = new Event("submit", { cancelable: true });
      form.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
      return window.location.href ? new URL(window.location.href, "https://one-world-relief.org/") : null;
    },
  };
}

test("orphan option selects a $300 annual gift and carries the cause into checkout", () => {
  const form = createDonationForm();
  form.toggleOrphan();
  assert.equal(form.toggle.getAttribute("aria-pressed"), "true");
  assert.equal(form.input.value, "300");
  assert.equal(form.label.textContent, "Continue with orphan support");
  assert.match(form.status.textContent, /\$300.*one year of orphan support/);
  assert.ok(form.choices.every(choice => choice.getAttribute("aria-pressed") === "false"));
  const url = form.submit();
  assert.equal(url.pathname, "/donate.html");
  assert.equal(url.hash, "#donationForm");
  assert.equal(url.searchParams.get("amount"), "300");
  assert.equal(url.searchParams.get("program"), "orphan_annual");
});

test("switching orphan support off restores the prior custom amount and general cause", () => {
  const form = createDonationForm("73.25");
  form.toggleOrphan();
  form.toggleOrphan();
  assert.equal(form.toggle.getAttribute("aria-pressed"), "false");
  assert.equal(form.input.value, "73.25");
  assert.equal(form.label.textContent, "Choose a cause");
  assert.equal(form.status.textContent, "");
  const url = form.submit();
  assert.equal(url.searchParams.get("amount"), "73.25");
  assert.equal(url.searchParams.get("program"), "unrestricted");
});

test("choosing a preset clears orphan support and synchronizes the amount buttons", () => {
  const form = createDonationForm();
  form.toggleOrphan();
  form.choosePreset(100);
  assert.equal(form.toggle.getAttribute("aria-pressed"), "false");
  assert.equal(form.input.value, "100");
  assert.equal(form.label.textContent, "Choose a cause");
  assert.equal(form.status.textContent, "");
  assert.equal(form.choices.find(choice => choice.dataset.gift === "100").getAttribute("aria-pressed"), "true");
  assert.equal(form.submit().searchParams.get("program"), "unrestricted");
});

test("editing the amount clears orphan support and later entering $300 does not reselect it", () => {
  const form = createDonationForm();
  form.toggleOrphan();
  form.enterAmount("75.50");
  assert.equal(form.toggle.getAttribute("aria-pressed"), "false");
  assert.equal(form.label.textContent, "Choose a cause");
  assert.equal(form.submit().searchParams.get("amount"), "75.5");
  assert.equal(form.submit().searchParams.get("program"), "unrestricted");
  form.enterAmount("300");
  assert.equal(form.toggle.getAttribute("aria-pressed"), "false");
  assert.equal(form.submit().searchParams.get("program"), "unrestricted");
});

test("a manually entered $300 gift stays unrestricted without explicit orphan selection", () => {
  const form = createDonationForm();
  form.enterAmount("300");
  assert.equal(form.submit().searchParams.get("amount"), "300");
  assert.equal(form.submit().searchParams.get("program"), "unrestricted");
});

test("returning from checkout synchronizes preset buttons with the browser-restored amount", () => {
  const form = createDonationForm();
  assert.equal(form.choices.find(choice => choice.dataset.gift === "50").getAttribute("aria-pressed"), "true");
  form.input.value = "300";
  form.window.dispatchEvent(new Event("pageshow"));
  assert.ok(form.choices.every(choice => choice.getAttribute("aria-pressed") === "false"));
  form.input.value = "25";
  form.window.dispatchEvent(new Event("pageshow"));
  assert.equal(form.choices.find(choice => choice.dataset.gift === "25").getAttribute("aria-pressed"), "true");
  assert.equal(form.choices.find(choice => choice.dataset.gift === "50").getAttribute("aria-pressed"), "false");
});

test("invalid amounts cannot navigate and correcting the amount clears the error", () => {
  for (const amount of ["", "0", "4.99", "-10", "invalid"]) {
    const form = createDonationForm();
    form.enterAmount(amount);
    assert.equal(form.submit(), null, `${JSON.stringify(amount)} should be rejected`);
    assert.equal(form.input.getAttribute("aria-invalid"), "true");
    assert.equal(form.input.focused, true);
    assert.equal(form.status.classList.contains("error"), true);
    assert.match(form.status.textContent, /at least \$5/);
    form.enterAmount("5");
    assert.equal(form.input.getAttribute("aria-invalid"), null);
    assert.equal(form.status.classList.contains("error"), false);
    assert.equal(form.status.textContent, "");
    assert.equal(form.submit().searchParams.get("amount"), "5");
  }
});

test("toggling orphan support twice restores an empty amount instead of inventing a gift", () => {
  const form = createDonationForm("");
  form.toggleOrphan();
  assert.equal(form.input.value, "300");
  form.toggleOrphan();
  assert.equal(form.input.value, "");
  assert.equal(form.toggle.getAttribute("aria-pressed"), "false");
  assert.equal(form.submit(), null);
});
