/* =========================================================
   Radius Wealth 401(k) — single-page JS.
   - Inline-expand gate on any [data-cta]
   - sessionStorage persistence
   - Calculator math (5 inputs) per Content/calculator-logic-new.md
   - Email #2 fires on explicit "See My Results" click
   - IntersectionObserver fade-ups, animated number counter
   ========================================================= */

(() => {
  "use strict";

  const STORAGE_KEY = "radius401k.lead";
  const CALC_INPUTS_KEY = "radius401k.calcInputs";
  const RADIUS_FEE_PCT = 0.0065;          // TODO: confirm with Christian before launch
  const TURNSTILE_SITEKEY = (document.querySelector('meta[name="turnstile-sitekey"]')?.content || "").trim();
  const CALENDLY_URL = (document.querySelector('meta[name="calendly-url"]')?.content || "").trim();

  // ---------- utilities ----------

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const debounce = (fn, ms) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const formatCurrency = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return "$0";
    return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  };
  const formatPercent2 = (n) => `${(Number(n) * 100).toFixed(2)}%`;

  const getLead = () => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  };
  const setLead = (lead) => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lead)); }
    catch {}
    document.documentElement.classList.add("gate-cleared");
  };

  // ---------- calendly redirect ----------

  function calendlyHref(lead) {
    if (!CALENDLY_URL) return "#";
    if (!lead) return CALENDLY_URL;
    const url = new URL(CALENDLY_URL);
    if (lead.name) url.searchParams.set("name", lead.name);
    if (lead.email) url.searchParams.set("email", lead.email);
    if (lead.company) url.searchParams.set("a1", lead.company);
    return url.toString();
  }

  // ---------- gate ----------

  function getGateTemplate() {
    const tmpl = document.getElementById("gate-form-template");
    return tmpl.content.cloneNode(true).firstElementChild;
  }

  function attachGateHandler(button) {
    if (button.dataset.gateBound === "1") return;
    button.dataset.gateBound = "1";
    button.addEventListener("click", (e) => {
      e.preventDefault();
      const intent = button.dataset.ctaIntent || "schedule";
      const source = button.dataset.ctaSource || "unknown";
      const lead = getLead();
      if (lead) {
        // Already cleared the gate — fire intent action directly.
        completeIntent(intent, source, lead, button);
        return;
      }
      openGate(button, intent, source);
    });
  }

  function openGate(button, intent, source) {
    // Replace the button with an inline gate form host.
    const host = document.createElement("div");
    host.className = "gate-host";
    const form = getGateTemplate();
    host.appendChild(form);

    button.replaceWith(host);

    // Focus the first input.
    const firstInput = form.querySelector('input[name="name"]');
    setTimeout(() => firstInput?.focus(), 50);

    const cancelBtn = form.querySelector("[data-gate-cancel]");
    cancelBtn.addEventListener("click", () => {
      host.replaceWith(button);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = form.querySelector("[data-gate-error]");
      errEl.hidden = true;

      const fd = new FormData(form);
      const name = (fd.get("name") || "").toString().trim();
      const email = (fd.get("email") || "").toString().trim();
      const company = (fd.get("company") || "").toString().trim();
      const honeypot = (fd.get("website") || "").toString();

      if (!name || !email || !company) {
        showError(errEl, "Please fill in all three fields.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError(errEl, "That email address doesn't look right.");
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending";

      let turnstileToken = "";
      if (TURNSTILE_SITEKEY && window.turnstile) {
        try { turnstileToken = await getTurnstileToken(); } catch {}
      }

      try {
        const res = await fetch("/api/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name, email, company, intent, source,
            honeypot, turnstileToken,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "submit_failed");
        }

        const lead = { name, email, company, gatedAt: Date.now() };
        setLead(lead);

        completeIntent(intent, source, lead, button, host);
      } catch (err) {
        console.error("Gate submit failed:", err);
        showError(errEl, "Something went wrong. Please try again, or call us directly at 617-765-2200.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Continue";
      }
    });
  }

  function showError(el, msg) { el.textContent = msg; el.hidden = false; }

  function getTurnstileToken() {
    return new Promise((resolve, reject) => {
      const tmp = document.createElement("div");
      tmp.style.position = "absolute";
      tmp.style.left = "-9999px";
      document.body.appendChild(tmp);
      try {
        window.turnstile.render(tmp, {
          sitekey: TURNSTILE_SITEKEY,
          callback: (t) => { resolve(t); tmp.remove(); },
          "error-callback": () => { reject(new Error("turnstile")); tmp.remove(); },
        });
      } catch (e) { reject(e); tmp.remove(); }
    });
  }

  function completeIntent(intent, source, lead, originalButton, host) {
    if (intent === "schedule") {
      window.location.href = calendlyHref(lead);
      return;
    }
    if (intent === "calculate") {
      // Restore button (so re-click works without staying expanded).
      if (host && originalButton) host.replaceWith(originalButton);
      // Smooth scroll to calculator.
      const calc = document.getElementById("calculator");
      if (calc) calc.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }

  // ---------- calculator ----------

  function readInputs() {
    const employees = clamp(parseFloat($('[data-calc-input="employees"]').value) || 0, 0, 999999);
    const planAssets = clamp(parseFloat($('[data-calc-input="planAssets"]').value) || 0, 0, 1e10);
    const currentFeeRaw = parseFloat($('[data-calc-input="currentFeePct"]').value) || 0;
    const currentFeePct = clamp(currentFeeRaw / 100, 0, 0.05);
    const hasPlan = $('[data-calc-input="hasPlan"]:checked')?.value === "yes";
    const avgComp = clamp(parseFloat($('[data-calc-input="avgComp"]').value) || 0, 0, 1e7);
    return { employees, planAssets, currentFeePct, hasPlan, avgComp };
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function compute(inputs) {
    const { employees, planAssets, currentFeePct, hasPlan, avgComp } = inputs;
    const currentAnnualFee = planAssets * currentFeePct;
    const radiusAnnualFee = planAssets * RADIUS_FEE_PCT;
    const annualSavings = Math.max(0, currentAnnualFee - radiusAnnualFee);
    const tenYearSavings = annualSavings * 10;
    const secure2CreditEstimate = secure2Credits({ employees, hasPlan, avgComp });
    return { currentAnnualFee, radiusAnnualFee, annualSavings, tenYearSavings, secure2CreditEstimate };
  }

  function secure2Credits({ employees, hasPlan, avgComp }) {
    // Per spec §4 — simplified, hedged estimate. Not advice.
    if (employees < 1) return 0;

    let total = 0;

    // Startup credit — only for new plans, ≤100 employees.
    if (!hasPlan && employees <= 100) {
      const startupRate = employees <= 50 ? 1.0 : 0.5;
      // Assume $4K/yr qualified costs, capped $5K/yr × 3 years.
      const annualStartup = Math.min(5000, 4000 * startupRate);
      total += annualStartup * 3;
    }

    // Auto-enrollment credit — assume the employer adopts auto-enroll (typical).
    total += 500 * 3;

    // Contribution credit — for employees earning ≤$100K. Assume 70% of HC qualify
    // unless avg comp suggests otherwise.
    const compFactor = avgComp <= 100000 ? 0.7 : Math.max(0, 0.7 * (100000 / Math.max(avgComp, 100000)));
    const eligibleEmployees = Math.min(50, employees) * compFactor;
    // Phase: 100% Y1–Y2, 75% Y3, 50% Y4, 25% Y5 → 3.5 years effective.
    total += 1000 * eligibleEmployees * 3.5;

    return Math.round(total);
  }

  function render(inputs, outputs, opts = {}) {
    const big = $('[data-calc-output="annualSavings"]');
    const ten = $('[data-calc-output="tenYearSavings"]');
    const cred = $('[data-calc-output="secure2CreditEstimate"]');
    const share = $('[data-calc-output="currentFeeShare"]');
    const sub = $('[data-calc-edge]');

    if (opts.animate) {
      animateNumber(big, outputs.annualSavings, formatCurrency);
      animateNumber(ten, outputs.tenYearSavings, formatCurrency);
      animateNumber(cred, outputs.secure2CreditEstimate, formatCurrency);
    } else {
      big.textContent = formatCurrency(outputs.annualSavings);
      ten.textContent = formatCurrency(outputs.tenYearSavings);
      cred.textContent = formatCurrency(outputs.secure2CreditEstimate);
    }
    share.textContent = formatPercent2(inputs.currentFeePct);

    // Edge case: zero or negative implied savings.
    if (outputs.annualSavings <= 0 && inputs.planAssets > 0) {
      sub.textContent = "Your current plan fees appear competitive against industry benchmarks. A formal review can confirm — and we can still help with plan design, compliance, and tax credits.";
    } else if (inputs.planAssets === 0 && !inputs.hasPlan) {
      sub.textContent = "You don't have a plan yet, so there are no current fees to compare. The number to focus on is the SECURE 2.0 credits — the IRS may underwrite most of your plan's first three years.";
    } else {
      sub.textContent = "Based on industry-average benchmarks and the inputs above. A formal review will confirm actual numbers.";
    }
  }

  function animateNumber(el, target, fmt) {
    const start = parseInt(String(el.textContent || "0").replace(/[^0-9.-]/g, ""), 10) || 0;
    const duration = 600;
    const t0 = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(start + (target - start) * eased);
      el.textContent = fmt(v);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function persistInputs(inputs) {
    try { sessionStorage.setItem(CALC_INPUTS_KEY, JSON.stringify(inputs)); } catch {}
  }
  function restoreInputs() {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(CALC_INPUTS_KEY) || "null"); } catch {}
    if (!saved) return;
    if (saved.employees !== undefined) $('[data-calc-input="employees"]').value = saved.employees;
    if (saved.planAssets !== undefined) $('[data-calc-input="planAssets"]').value = saved.planAssets;
    if (saved.currentFeePct !== undefined) $('[data-calc-input="currentFeePct"]').value = (saved.currentFeePct * 100).toFixed(2);
    if (saved.hasPlan !== undefined) {
      const v = saved.hasPlan ? "yes" : "no";
      const radio = $(`[data-calc-input="hasPlan"][value="${v}"]`);
      if (radio) radio.checked = true;
    }
    if (saved.avgComp !== undefined) $('[data-calc-input="avgComp"]').value = saved.avgComp;
  }

  function checkEmployeeCap() {
    const employees = parseFloat($('[data-calc-input="employees"]').value) || 0;
    const inner = $("[data-calc-inner]");
    const cap = $("[data-calc-cap]");
    const tooBig = employees > 10000;
    if (tooBig) {
      if (inner) inner.style.display = "none";
      if (cap) cap.hidden = false;
    } else {
      if (inner) inner.style.removeProperty("display");
      if (cap) cap.hidden = true;
    }
    return tooBig;
  }

  function setupCalculator() {
    const calc = $("[data-calculator]");
    if (!calc) return;

    restoreInputs();

    const recalc = () => {
      if (checkEmployeeCap()) return;
      const inputs = readInputs();
      const outputs = compute(inputs);
      render(inputs, outputs, { animate: false });
      persistInputs(inputs);
    };

    const debounced = debounce(recalc, 300);
    $$("[data-calc-input]").forEach((el) => {
      el.addEventListener("input", debounced);
      el.addEventListener("change", debounced);
    });

    // Initial paint.
    recalc();

    // Explicit "See My Results" — fires email #2.
    const submit = $("[data-calc-submit]");
    submit.addEventListener("click", async () => {
      if (checkEmployeeCap()) return;
      const inputs = readInputs();
      const outputs = compute(inputs);

      // Animated render.
      const results = $("[data-calc-results]");
      results.classList.remove("is-fresh");
      void results.offsetWidth;
      results.classList.add("is-fresh");
      render(inputs, outputs, { animate: true });
      persistInputs(inputs);

      // Email #2.
      const lead = getLead();
      if (!lead) {
        // Shouldn't happen — calc is locked until gate cleared. Defensive.
        return;
      }
      submit.disabled = true;
      submit.textContent = "Saving";
      try {
        await fetch("/api/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: lead.name, email: lead.email, company: lead.company,
            intent: "calculator-completed",
            source: "calculator-submit",
            calculatorData: { inputs, outputs },
          }),
        });
      } catch (e) {
        console.warn("Calculator email failed (non-blocking):", e);
      } finally {
        submit.disabled = false;
        submit.textContent = "See my results";
      }
    });
  }

  // ---------- reveal on scroll ----------

  function setupReveal() {
    if (!("IntersectionObserver" in window)) {
      $$(".reveal").forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });
    $$(".reveal").forEach((el) => obs.observe(el));
  }

  // ---------- bindings ----------

  function bindAllCtas() {
    $$("[data-cta]").forEach(attachGateHandler);
  }

  function setCopyrightYear() {
    const el = document.getElementById("copyright-year");
    if (el) el.textContent = new Date().getFullYear();
  }

  // ---------- init ----------

  document.addEventListener("DOMContentLoaded", () => {
    setCopyrightYear();
    bindAllCtas();
    setupReveal();
    setupCalculator();
  });
})();
