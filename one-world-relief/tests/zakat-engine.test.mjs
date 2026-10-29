import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const sibling = new URL("./zakat-calculator.js", import.meta.url);
const source = readFileSync(existsSync(sibling) ? sibling : new URL("../zakat-calculator.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const engine = context.ONE_WORLD_RELIEF_ZAKAT_CALCULATOR;
const base = { assets: { cashSavings: 10000 }, yearBasis: "hijri", nisabBasis: "custom", nisabValue: 5000, hawl: "yes" };
const calc = (changes = {}) => engine.calculate({ ...base, ...changes });

test("engine version is independent of the existing checkout handoff", () => {
  assert.equal(engine.VERSION, "owr-zakat-engine-v2");
  assert.equal(engine.HANDOFF_VERSION, "owr-zakat-v1");
  assert.equal(Object.isFrozen(engine), true);
});

test("custom nisab is an eligibility threshold, never an asset deduction", () => {
  const result = calc();
  assert.equal(result.valid, true);
  assert.equal(result.netWealth, 10000);
  assert.equal(result.grossZakat, 250);
  assert.equal(result.remainingZakat, 250);
  assert.equal(result.state, "due");
});

test("a cent below, exactly at, and a cent above nisab use cent-based boundaries", () => {
  const below = calc({ assets: { cashSavings: "4999.99" } });
  const exact = calc({ assets: { cashSavings: "5000.00" } });
  const above = calc({ assets: { cashSavings: "5000.01" } });
  assert.equal(below.state, "below-nisab");
  assert.equal(below.zakatDue, 0);
  assert.equal(exact.eligible, true);
  assert.equal(exact.zakatDue, 125);
  assert.equal(above.eligible, true);
});

test("solar and lunar year rates differ without changing assets or nisab", () => {
  assert.equal(calc().zakatDue, 250);
  assert.equal(calc({ yearBasis: "solar" }).zakatDue, 257.7);
  assert.equal(calc({ yearBasis: "solar" }).rate, 0.02577);
});

test("traditional and alternative metric nisab conversions are explicit", () => {
  assert.equal(engine.calculateNisab("gold", 100, "traditional"), 8748);
  assert.equal(engine.calculateNisab("silver", 1, "traditional"), 612.36);
  assert.equal(engine.calculateNisab("gold", 100, "metric"), 8500);
  assert.equal(engine.calculateNisab("silver", 1, "metric"), 595);
  assert.equal(engine.calculateNisab("custom", "1234.56", "traditional"), 1234.56);
});

test("price-per-gram precision is preserved until the resulting nisab is rounded", () => {
  assert.equal(engine.calculateNisab("silver", "0.975623", "traditional"), 597.43);
});

test("missing and invalid thresholds never produce a valid obligation", () => {
  for (const value of ["", null, undefined, -1, 0, Infinity, "word", "0.000001", "1000000000001"]) {
    assert.equal(engine.calculateNisab("custom", value), null);
  }
  assert.equal(engine.calculateNisab("silver", "0.000001"), null);
  assert.equal(calc({ nisabBasis: "" }).state, "missing");
  assert.equal(calc({ nisabValue: "" }).state, "missing");
  assert.equal(calc({ nisabValue: 0 }).state, "invalid");
  assert.equal(calc({ nisabValue: -1 }).canDonate, false);
});

test("ordinary assets, recoverable loans, crypto, and retirement values all contribute once", () => {
  const result = calc({ assets: { cashSavings: 10000, goldSilver: 2000, investments: 1000,
    moneyOwed: 500, businessAssets: 1500, otherAssets: 250, cryptoAssets: 750, retirementAssets: 4000 } });
  assert.equal(result.totalAssets, 20000);
  assert.equal(result.zakatDue, 500);
});

test("debts reduce wealth before applying nisab and the rate", () => {
  const result = calc({ liabilities: 1000 });
  assert.equal(result.liabilities, 1000);
  assert.equal(result.netWealth, 9000);
  assert.equal(result.zakatDue, 225);
  assert.equal(calc({ liabilities: 5000.01 }).state, "below-nisab");
});

test("both permitted deduction methods use only the amount entered, none excludes it", () => {
  for (const debtTreatment of ["dueNow", "next12Months"]) {
    assert.equal(calc({ debtTreatment, liabilities: 1000 }).zakatDue, 225);
  }
  const excluded = calc({ debtTreatment: "none", liabilities: 1000 });
  assert.equal(excluded.liabilities, 0);
  assert.equal(excluded.zakatDue, 250);
  assert.equal(calc({ debtTreatment: "none", liabilities: -1000 }).valid, true);
});

test("liabilities greater than assets cannot make net wealth or Zakat negative", () => {
  const result = calc({ liabilities: 25000 });
  assert.equal(result.netWealth, 0);
  assert.equal(result.zakatDue, 0);
  assert.equal(result.state, "below-nisab");
});

test("prior payments subtract from Zakat due, not from zakatable wealth", () => {
  const result = calc({ zakatPaid: 75 });
  assert.equal(result.netWealth, 10000);
  assert.equal(result.grossZakat, 250);
  assert.equal(result.paidZakat, 75);
  assert.equal(result.remainingZakat, 175);
});

test("exact payment and overpayment yield zero remaining with no negative refund", () => {
  for (const zakatPaid of [250, 300]) {
    const result = calc({ zakatPaid });
    assert.equal(result.state, "already-paid");
    assert.equal(result.remainingZakat, 0);
    assert.equal(result.canDonate, false);
  }
});

test("the $5 checkout minimum changes donation availability, never the Zakat result", () => {
  const lower = calc({ assets: { cashSavings: 199.6 }, nisabValue: 100 });
  const exact = calc({ assets: { cashSavings: 200 }, nisabValue: 100 });
  assert.equal(lower.zakatDue, 4.99);
  assert.equal(lower.canDonate, false);
  assert.equal(exact.zakatDue, 5);
  assert.equal(exact.canDonate, true);
});

test("hawl no or unsure only gives a conditional estimate and blocks donation", () => {
  for (const [hawl, state] of [["no", "not-due"], ["unsure", "hawl-unconfirmed"]]) {
    const result = calc({ hawl, zakatPaid: 25 });
    assert.equal(result.state, state);
    assert.equal(result.valid, true);
    assert.equal(result.potentialZakat, 250);
    assert.equal(result.potentialRemaining, 225);
    assert.equal(result.grossZakat, 0);
    assert.equal(result.remainingZakat, 0);
    assert.equal(result.eligible, false);
    assert.equal(result.canDonate, false);
  }
});

test("an unanswered hawl is incomplete, not silently treated as confirmed", () => {
  const result = calc({ hawl: "" });
  assert.equal(result.state, "missing");
  assert.equal(result.valid, false);
  assert.equal(result.canDonate, false);
  assert.equal(result.remainingZakat, 0);
  assert.ok(result.missing.zakatHawl);
});

test("metal value mode ignores leftover weight fields and uses direct value once", () => {
  const result = calc({ assets: { cashSavings: 10000, goldSilver: 3000 }, metalEntryMode: "value",
    metals: { goldWeight: 200, goldPricePerGram: 100, goldPurity: 24 } });
  assert.equal(result.assets.goldSilver, 3000);
  assert.equal(result.totalAssets, 13000);
  assert.equal(result.zakatDue, 325);
});

test("weight mode excludes a stale direct value and correctly values 18k gold and sterling silver", () => {
  const result = calc({ assets: { cashSavings: 10000, goldSilver: 999999 }, metalEntryMode: "weight",
    metals: { goldWeight: 20, goldPurity: 18, goldPricePerGram: 100,
      silverWeight: 100, silverPurity: 0.925, silverPricePerGram: 1 } });
  assert.equal(result.metalResult.goldValue, 1500);
  assert.equal(result.metalResult.silverValue, 92.5);
  assert.equal(result.assets.goldSilver, 1592.5);
  assert.equal(result.totalAssets, 11592.5);
  assert.equal(result.zakatDue, 289.81);
});

test("22k gold uses 22/24 purity rather than treating karats as a percent", () => {
  const result = engine.valueMetals({ mode: "weight", goldWeight: 24, goldPurity: 22, goldPricePerGram: 100 });
  assert.equal(result.valid, true);
  assert.equal(result.goldValue, 2200);
});

test("empty optional metal fields are zero but nonzero weights require spot prices", () => {
  assert.equal(engine.valueMetals({ mode: "weight" }).valid, true);
  const missing = engine.valueMetals({ mode: "weight", goldWeight: 10 });
  assert.equal(missing.valid, false);
  assert.ok(missing.missing.goldPricePerGram);
  const missingSilver = calc({ metalEntryMode: "weight", metals: { silverWeight: 100 } });
  assert.equal(missingSilver.state, "missing");
  assert.equal(missingSilver.canDonate, false);
});

test("invalid metal purity or weight is rejected rather than inflating a result", () => {
  assert.equal(engine.valueMetals({ mode: "weight", goldWeight: 1, goldPurity: 100, goldPricePerGram: 100 }).valid, false);
  assert.equal(engine.valueMetals({ mode: "weight", silverWeight: -1, silverPricePerGram: 1 }).valid, false);
  assert.equal(engine.valueMetals({ mode: "weight", goldWeight: 1e12, goldPricePerGram: 1e12 }).valid, false);
});

test("plain money precision and non-finite, negative, or malformed financial inputs are rejected", () => {
  for (const bad of [-1, Infinity, NaN, "NaN", "1000000000001", "abc", "1e3", true, "1,000", "12.345"]) {
    const result = calc({ assets: { cashSavings: bad } });
    assert.equal(result.state, "invalid", String(bad));
    assert.equal(result.canDonate, false);
    assert.ok(result.errors.cashSavings);
  }
  assert.equal(calc({ liabilities: -1 }).state, "invalid");
  assert.equal(calc({ zakatPaid: Infinity }).state, "invalid");
});

test("aggregate and nisab multiplication overflow fail closed", () => {
  assert.equal(calc({ assets: { cashSavings: 1e12, investments: 1 } }).state, "invalid");
  assert.equal(engine.calculateNisab("gold", 1e12), null);
  assert.equal(calc({ nisabBasis: "gold", nisabValue: 1e12 }).state, "invalid");
});

test("unsupported financial methods fail closed instead of silently selecting a school or rate", () => {
  for (const changes of [{ yearBasis: "other" }, { weightStandard: "other" },
    { nisabBasis: "other" }, { debtTreatment: "other" }, { hawl: "other" }, { metalEntryMode: "other" }]) {
    const result = calc(changes);
    assert.equal(result.state, "invalid");
    assert.equal(result.canDonate, false);
  }
});

test("cent arithmetic and half-cent rounding are stable", () => {
  const result = calc({ assets: { cashSavings: "1000.20", investments: "1000.30" }, liabilities: "0.10", nisabValue: 100 });
  assert.equal(result.totalAssets, 2000.5);
  assert.equal(result.netWealth, 2000.4);
  assert.equal(calc({ assets: { cashSavings: "100.60" }, nisabValue: 100 }).zakatDue, 2.52);
  assert.equal(calc({ assets: { cashSavings: ".50", investments: "10000." } }).totalAssets, 10000.5);
});

test("blank optional amounts do not invent wealth", () => {
  const result = calc({ assets: {}, liabilities: "", zakatPaid: "" });
  assert.equal(result.valid, true);
  assert.equal(result.totalAssets, 0);
  assert.equal(result.state, "below-nisab");
});

test("source persists only the existing non-financial handoff on an eligible click", () => {
  assert.equal((source.match(/sessionStorage\.setItem/g) || []).length, 1);
  assert.doesNotMatch(source, /localStorage|fetch\s*\(|XMLHttpRequest|sendBeacon/);
  assert.match(source, /const context = \{ version: HANDOFF_VERSION, language: "en", year_basis: latestResult\.yearBasis, nisab_basis: latestResult\.nisabBasis \}/);
});

// The lightweight DOM fixture boots the real controller against the real page's
// controls. It exercises navigation, error focus, payment handoff and reset;
// layout and browser rendering remain separate visual checks.
function bootController() {
  const siblingHtml = new URL("./zakat.html", import.meta.url);
  const html = readFileSync(existsSync(siblingHtml) ? siblingHtml : new URL("../zakat.html", import.meta.url), "utf8");
  const ids = new Map();
  const timers = new Map();
  const storage = new Map();
  let timerId = 0;
  const document = { activeElement: null };
  const matches = (element, selector) => selector.split(",").some((part) => {
    const token = part.trim();
    if (token.startsWith(".")) return element.classes.has(token.slice(1));
    const match = /^(\w+)?(?:\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\])?$/.exec(token);
    return !!match && (!match[1] || element.tagName === match[1].toUpperCase())
      && (!match[2] || (element.attributes.has(match[2]) && (match[3] === undefined || element.attributes.get(match[2]) === match[3])));
  });
  class Element {
    constructor(tagName, attributes = {}) {
      this.tagName = tagName.toUpperCase();
      this.attributes = new Map(Object.entries(attributes));
      this.classes = new Set((attributes.class || "").split(/\s+/).filter(Boolean));
      this.classList = { toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) };
      this.dataset = Object.fromEntries(Object.entries(attributes).filter(([name]) => name.startsWith("data-"))
        .map(([name, value]) => [name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
      this.children = []; this.listeners = new Map(); this.parentElement = null;
      this.hidden = has(attributes, "hidden"); this.disabled = has(attributes, "disabled");
      this.open = has(attributes, "open"); this.value = attributes.value || "";
      this.max = attributes.max || ""; this.validity = { badInput: false, rangeOverflow: false };
      this.textContent = ""; this.id = attributes.id || "";
    }
    set id(value) { this._id = value; if (value) ids.set(value, this); }
    get id() { return this._id; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
    append(...children) { children.forEach((child) => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    querySelectorAll(selector) { return this.children.flatMap((child) => [...(matches(child, selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return matches(this, selector) ? this : this.parentElement?.closest(selector) || null; }
    insertAdjacentElement(_where, element) { (this.parentElement || root).appendChild(element); }
    addEventListener(name, listener) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(listener); }
    emit(name, event = {}) { (this.listeners.get(name) || []).forEach((listener) => listener({ target: this, preventDefault() {}, ...event })); }
    focus() {
      for (let element = this; element; element = element.parentElement) {
        if (element.hidden || (element.tagName === "DETAILS" && !element.open)) return;
      }
      document.activeElement = this;
    }
    scrollIntoView() {}
  }
  function has(object, name) { return Object.prototype.hasOwnProperty.call(object, name); }
  const root = new Element("document");
  const stack = [root];
  const voids = new Set(["meta", "link", "input", "img", "br", "hr", "source", "wbr"]);
  for (const token of html.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const text = token[0], tag = token[1].toLowerCase();
    if (text.startsWith("</")) {
      const index = stack.findLastIndex((item) => item.tagName === tag.toUpperCase());
      if (index > 0) stack.length = index;
      continue;
    }
    const attrText = text.slice(tag.length + 1, -1);
    const attributes = {};
    for (const match of attrText.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
    }
    const element = new Element(tag, attributes);
    stack.at(-1).appendChild(element);
    if (!voids.has(tag) && !text.endsWith("/>")) stack.push(element);
  }
  root.querySelectorAll("select").forEach((select) => {
    const options = select.querySelectorAll("option");
    select.value = (options.find((option) => option.attributes.has("selected")) || options[0])?.value || "";
  });
  document.documentElement = root.querySelector("html");
  document.getElementById = (id) => ids.get(id) || null;
  document.querySelectorAll = (selector) => root.querySelectorAll(selector);
  document.querySelector = (selector) => root.querySelector(selector);
  document.createElement = (tag) => new Element(tag);
  document.createDocumentFragment = () => new Element("fragment");
  let prints = 0;
  const globalEvents = new Map();
  const window = {
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id), matchMedia: () => ({ matches: true }),
    sessionStorage: { setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    print: () => { prints += 1; },
    addEventListener: (name, callback) => globalEvents.set(name, callback),
  };
  vm.runInContext(source, vm.createContext({ window, document }));
  const form = ids.get("zakatCalculator");
  const set = (id, value) => { ids.get(id).value = String(value); form.emit("input", { target: ids.get(id) }); };
  const click = (id) => ids.get(id).emit("click");
  const step = () => Number(root.querySelectorAll("[data-step-panel]").find((panel) => !panel.hidden)?.dataset.stepPanel);
  const setup = () => { set("zakatHawl", "yes"); set("zakatNisabBasis", "custom"); set("zakatCustomNisab", "5000"); };
  return { document, root, ids, form, set, click, step, setup, storage, prints: () => prints,
    beforePrint: () => globalEvents.get("beforeprint")?.(),
    text: (id) => { const collect = (element) => [element.textContent, ...element.children.map(collect)].join(" "); return collect(ids.get(id)); },
    go: (target) => root.querySelectorAll("[data-step-target]").find((button) => Number(button.dataset.stepTarget) === target).emit("click"),
    flush: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); } };
}

test("controller starts in English, does not confirm incomplete inputs and validates Next", () => {
  const ui = bootController();
  assert.equal(ui.document.documentElement.lang, "en");
  assert.equal(ui.document.documentElement.dir, "ltr");
  assert.equal(ui.step(), 0);
  assert.equal(ui.form.dataset.review, "false");
  assert.equal(ui.root.querySelector(".zakat-results").hidden, true);
  assert.equal(ui.ids.get("resetZakat").closest(".zakat-results"), null);
  assert.equal(ui.ids.get("zakatResultAnnouncement").closest(".zakat-results"), null);
  assert.equal(ui.ids.get("zakatDueResult").textContent, "—");
  assert.equal(ui.ids.get("donateCalculatedZakat").getAttribute("aria-disabled"), "true");
  ui.click("zakatNext");
  assert.equal(ui.step(), 0);
  assert.equal(ui.document.activeElement.id, "zakatHawl");
  assert.equal(ui.ids.get("zakatHawl").getAttribute("aria-invalid"), "true");
  assert.ok(ui.ids.get("zakatHawlError").textContent);
  ui.setup();
  ui.click("zakatNext");
  assert.equal(ui.step(), 1);
  assert.equal(ui.ids.get("zakatHawl").getAttribute("aria-invalid"), null);
  ui.click("zakatPrevious");
  ui.set("zakatDueDate", "");
  const settings = ui.ids.get("zakatDateSettings");
  assert.equal(settings.open, false);
  ui.click("zakatNext");
  assert.equal(ui.step(), 0);
  assert.equal(settings.open, true);
  assert.equal(ui.document.activeElement.id, "zakatDueDate");
  assert.equal(ui.ids.get("zakatDueDate").getAttribute("aria-invalid"), "true");
});

test("forward nav cannot bypass invalid intermediate fields and opens a closed accordion to focus the error", () => {
  const ui = bootController();
  ui.setup();
  ui.set("investments", "-1");
  const details = ui.ids.get("investments").closest("details");
  assert.equal(details.open, false);
  ui.go(3);
  assert.equal(ui.step(), 1);
  assert.equal(details.open, true);
  assert.equal(ui.document.activeElement.id, "investments");
  assert.equal(ui.ids.get("investments").getAttribute("aria-invalid"), "true");
  ui.set("investments", "10000");
  ui.click("zakatNext");
  assert.equal(ui.step(), 2);
  ui.click("zakatPrevious");
  assert.equal(ui.ids.get("investments").value, "10000");
});

test("a valid review enables donation with the unchanged, non-financial checkout handoff", () => {
  const ui = bootController();
  ui.setup(); ui.click("zakatNext"); ui.set("cashSavings", 10000);
  assert.equal(ui.ids.get("donateCalculatedZakat").getAttribute("aria-disabled"), "true");
  ui.click("zakatNext"); ui.set("shortTermLiabilities", 1000); ui.set("zakatPaid", 25); ui.click("zakatNext");
  assert.equal(ui.step(), 3);
  assert.equal(ui.form.dataset.review, "true");
  assert.equal(ui.root.querySelector(".zakat-results").hidden, false);
  assert.equal(ui.ids.get("zakatDueResult").textContent, "$200.00");
  assert.equal(ui.ids.get("donateCalculatedZakat").getAttribute("aria-disabled"), "false");
  assert.match(ui.ids.get("donateCalculatedZakat").href, /amount=200\.00/);
  assert.equal(ui.storage.size, 0);
  ui.click("donateCalculatedZakat");
  assert.deepEqual(JSON.parse(ui.storage.get("owrZakatHandoff")), {
    version: "owr-zakat-v1", language: "en", year_basis: "hijri", nisab_basis: "custom",
  });
  ui.click("printZakat");
  assert.equal(ui.prints(), 1);
});

test("unconfirmed hawl stays conditional through review and print without donation access", () => {
  const ui = bootController();
  ui.setup(); ui.set("zakatHawl", "unsure"); ui.click("zakatNext");
  ui.set("cashSavings", 10000); ui.click("zakatNext"); ui.click("zakatNext");
  assert.equal(ui.step(), 3);
  assert.equal(ui.ids.get("zakatResultsTitle").textContent, "Planning estimate");
  assert.match(ui.ids.get("zakatResultStatus").textContent, /not a confirmed obligation/);
  assert.equal(ui.ids.get("donateCalculatedZakat").getAttribute("aria-disabled"), "true");
  ui.click("donateCalculatedZakat");
  assert.equal(ui.storage.size, 0);
  ui.click("printZakat");
  assert.equal(ui.prints(), 1);
});

test("switching metal/debt methods disables inactive controls and ignores their old values", () => {
  const ui = bootController();
  ui.setup(); ui.click("zakatNext"); ui.set("cashSavings", 10000); ui.set("goldSilver", 9000);
  ui.set("metalEntryMode", "weight"); ui.set("goldWeight", 20); ui.set("goldPurity", 18); ui.set("goldPricePerGram", 100);
  assert.equal(ui.ids.get("goldSilver").disabled, true);
  assert.equal(ui.ids.get("metalValueResult").textContent, "$1,500.00");
  assert.equal(ui.ids.get("totalAssetsResult").textContent, "$11,500.00");
  ui.click("zakatNext"); ui.set("shortTermLiabilities", 1000); ui.set("debtTreatment", "none");
  assert.equal(ui.ids.get("shortTermLiabilities").disabled, true);
  assert.equal(ui.ids.get("netWealthResult").textContent, "$11,500.00");
});

test("reset clears all financial inputs and the handoff, returns to setup and keeps English", () => {
  const ui = bootController();
  ui.setup(); ui.set("cashSavings", 10000); ui.go(3); ui.click("donateCalculatedZakat");
  ui.form.emit("reset"); ui.flush();
  assert.equal(ui.step(), 0);
  assert.equal(ui.form.dataset.review, "false");
  assert.equal(ui.root.querySelector(".zakat-results").hidden, true);
  assert.equal(ui.ids.get("cashSavings").value, "");
  assert.equal(ui.ids.get("zakatNisabBasis").value, "");
  assert.equal(ui.ids.get("zakatHawl").value, "");
  assert.equal(ui.ids.get("zakatDueResult").textContent, "—");
  assert.equal(ui.storage.size, 0);
  assert.equal(ui.document.documentElement.lang, "en");
});

test("native print cannot present incomplete or invalid inputs as a zero-Zakat conclusion", () => {
  const ui = bootController();
  ui.beforePrint();
  assert.match(ui.text("zakatReviewRows"), /Incomplete/);
  assert.match(ui.text("zakatReviewRows"), /Not available/);
  assert.doesNotMatch(ui.text("zakatReviewRows"), /\$0\.00|Remaining estimated Zakat/);
  ui.setup(); ui.set("cashSavings", 10000);
  ui.ids.get("cashSavings").validity.badInput = true;
  ui.beforePrint();
  assert.match(ui.text("zakatReviewRows"), /Incomplete/);
  assert.equal(ui.ids.get("zakatDueResult").textContent, "—");
  assert.equal(ui.ids.get("printZakat").disabled, true);
});

test("printed nisab metadata retains the entered per-gram price precision", () => {
  const ui = bootController();
  ui.set("zakatHawl", "yes"); ui.set("zakatNisabBasis", "silver");
  ui.set("zakatMetalPrice", "0.975623"); ui.set("cashSavings", 10000); ui.go(3);
  assert.equal(ui.step(), 3);
  assert.match(ui.ids.get("zakatReviewBasis").textContent, /\$0\.975623 per gram/);
  assert.equal(ui.ids.get("nisabResult").textContent, "$597.43");
});
