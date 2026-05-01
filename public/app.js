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
  const INDUSTRY_FEE_PCT = 0.0118;        // industry-average benchmark for $0-assets case
  const ASSETS_PER_EMPLOYEE_BENCHMARK = 50000; // rough industry estimate for hypothetical plan size
  const TURNSTILE_SITEKEY = (document.querySelector('meta[name="turnstile-sitekey"]')?.content || "").trim();
  const CALENDLY_URL = (document.querySelector('meta[name="calendly-url"]')?.content || "").trim();

  // Free / personal email providers — rejected to ensure work-email-only B2B leads.
  const FREE_EMAIL_DOMAINS = new Set([
    "gmail.com", "googlemail.com",
    "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "ymail.com",
    "hotmail.com", "hotmail.co.uk", "live.com", "msn.com", "outlook.com",
    "aol.com", "icloud.com", "me.com", "mac.com",
    "protonmail.com", "proton.me", "pm.me",
    "mail.com", "gmx.com", "gmx.us", "yandex.com", "yandex.ru",
    "zoho.com", "fastmail.com", "tutanota.com", "tuta.io",
    "qq.com", "163.com", "126.com", "sina.com",
  ]);

  function isFreeEmail(email) {
    const at = String(email || "").lastIndexOf("@");
    if (at < 0) return false;
    return FREE_EMAIL_DOMAINS.has(email.slice(at + 1).toLowerCase());
  }

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
      if (isFreeEmail(email)) {
        showError(errEl, "Please use your work email — gmail, yahoo, outlook etc. aren't accepted here.");
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
        const msg = err && err.message === "free_email_not_allowed"
          ? "Please use your work email — gmail, yahoo, outlook etc. aren't accepted here."
          : "Something went wrong. Please try again, or call us directly at 617-765-2200.";
        showError(errEl, msg);
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

  function parseNumeric(s) {
    return parseFloat(String(s || "").replace(/[^0-9.\-]/g, "")) || 0;
  }

  function readInputs() {
    const employees = clamp(parseNumeric($('[data-calc-input="employees"]').value), 0, 999999);
    const planAssets = clamp(parseNumeric($('[data-calc-input="planAssets"]').value), 0, 1e10);
    const currentFeeRaw = parseFloat($('[data-calc-input="currentFeePct"]').value) || 0;
    const currentFeePct = clamp(currentFeeRaw / 100, 0, 0.05);
    const hasPlan = $('[data-calc-input="hasPlan"]:checked')?.value === "yes";
    const avgComp = clamp(parseNumeric($('[data-calc-input="avgComp"]').value), 0, 1e7);
    return { employees, planAssets, currentFeePct, hasPlan, avgComp };
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function compute(inputs) {
    const { employees, planAssets, currentFeePct, hasPlan, avgComp } = inputs;

    // If the user has $0 plan assets, fall back to a hypothetical-plan-size
    // estimate based on headcount. That way the result panel says something
    // useful instead of "$0 savings."
    const isHypothetical = planAssets <= 0 && employees > 0;
    const effectiveAssets = isHypothetical
      ? employees * ASSETS_PER_EMPLOYEE_BENCHMARK
      : planAssets;
    const effectiveFeePct = isHypothetical ? INDUSTRY_FEE_PCT : currentFeePct;

    const currentAnnualFee = effectiveAssets * effectiveFeePct;
    const radiusAnnualFee = effectiveAssets * RADIUS_FEE_PCT;
    const annualSavings = Math.max(0, currentAnnualFee - radiusAnnualFee);
    const tenYearSavings = annualSavings * 10;
    const secure2CreditEstimate = secure2Credits({ employees, hasPlan, avgComp });
    return {
      currentAnnualFee, radiusAnnualFee,
      annualSavings, tenYearSavings,
      secure2CreditEstimate,
      hypotheticalAssets: isHypothetical ? effectiveAssets : null,
    };
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
    const results = $("[data-calc-results]");
    const eyebrow = $("[data-calc-eyebrow]");
    const big = $('[data-calc-output="annualSavings"]');
    const ten = $('[data-calc-output="tenYearSavings"]');
    const cred = $('[data-calc-output="secure2CreditEstimate"]');
    const share = $('[data-calc-output="currentFeeShare"]');
    const sub = $('[data-calc-edge]');
    const convenience = $("[data-calc-convenience]");

    results.setAttribute("data-state", "filled");
    eyebrow.textContent = outputs.hypotheticalAssets
      ? "Estimated annual savings (typical plan your size)"
      : "Estimated annual savings";

    if (opts.animate) {
      animateNumber(big, outputs.annualSavings, formatCurrency);
      animateNumber(ten, outputs.tenYearSavings, formatCurrency);
      animateNumber(cred, outputs.secure2CreditEstimate, formatCurrency);
    } else {
      big.textContent = formatCurrency(outputs.annualSavings);
      ten.textContent = formatCurrency(outputs.tenYearSavings);
      cred.textContent = formatCurrency(outputs.secure2CreditEstimate);
    }
    // Show the actual fee % when known; show industry benchmark for hypothetical case.
    share.textContent = outputs.hypotheticalAssets
      ? `${formatPercent2(INDUSTRY_FEE_PCT)} (industry avg)`
      : formatPercent2(inputs.currentFeePct);

    // Sub-line copy varies by case.
    if (outputs.hypotheticalAssets) {
      sub.innerHTML = `For ${formatInt(inputs.employees)} employees, a typical small-business plan holds around <strong>${formatCurrency(outputs.hypotheticalAssets)}</strong> in assets at the industry-average fee. That's the baseline used here. The bigger number for you may be the SECURE 2.0 credits — see below.`;
    } else if (outputs.annualSavings <= 0 && inputs.planAssets > 0) {
      sub.textContent = "Your current plan fees appear competitive against industry benchmarks. A formal review can confirm — and we can still help with plan design, compliance, and tax credits.";
    } else {
      sub.textContent = "Based on industry-average benchmarks and the inputs above. A formal review will confirm actual numbers.";
    }

    // Convenience message — "savings + we run it for you."
    if (convenience) convenience.hidden = false;
  }

  function formatInt(n) {
    const v = Math.round(Number(n) || 0);
    return v.toLocaleString("en-US");
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
    if (saved.planAssets !== undefined) $('[data-calc-input="planAssets"]').value = Number(saved.planAssets || 0).toLocaleString("en-US");
    if (saved.currentFeePct !== undefined) $('[data-calc-input="currentFeePct"]').value = (saved.currentFeePct * 100).toFixed(2);
    if (saved.hasPlan !== undefined) {
      const v = saved.hasPlan ? "yes" : "no";
      const radio = $(`[data-calc-input="hasPlan"][value="${v}"]`);
      if (radio) radio.checked = true;
    }
    if (saved.avgComp !== undefined) $('[data-calc-input="avgComp"]').value = Number(saved.avgComp || 0).toLocaleString("en-US");
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
    setupCurrencyFormatters();

    // Whenever inputs change we just check the cap and persist for sessionStorage —
    // results are NOT rendered until the user explicitly clicks "See my results".
    // This keeps the email #2 capture tied to an explicit action.
    const onInputChange = debounce(() => {
      checkEmployeeCap();
      persistInputs(readInputs());
    }, 300);
    $$("[data-calc-input]").forEach((el) => {
      el.addEventListener("input", onInputChange);
      el.addEventListener("change", onInputChange);
    });
    checkEmployeeCap();

    // Explicit "See my results" — computes, renders, fires email #2.
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

      // Scroll the results into view on small screens.
      if (window.matchMedia("(max-width: 1023px)").matches) {
        results.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      // Email #2.
      const lead = getLead();
      if (!lead) return; // defensive; gate is required before unlocking calculator
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

  // Currency input live-formatter: strips non-digits, inserts thousand-separators.
  function setupCurrencyFormatters() {
    $$('[data-format="currency"]').forEach((input) => {
      input.addEventListener("input", () => {
        const raw = input.value.replace(/[^0-9]/g, "");
        if (!raw) { input.value = ""; return; }
        // Preserve caret position approximately by tracking digit-only offset.
        const caretBefore = input.selectionStart || 0;
        const digitsBefore = countDigits(input.value.slice(0, caretBefore));
        const formatted = Number(raw).toLocaleString("en-US");
        input.value = formatted;
        const newCaret = caretFromDigits(formatted, digitsBefore);
        try { input.setSelectionRange(newCaret, newCaret); } catch (_) {}
      });
      input.addEventListener("blur", () => {
        const raw = input.value.replace(/[^0-9]/g, "");
        input.value = raw ? Number(raw).toLocaleString("en-US") : "";
      });
    });
  }
  function countDigits(s) { return (s.match(/\d/g) || []).length; }
  function caretFromDigits(s, n) {
    let count = 0;
    for (let i = 0; i < s.length; i++) {
      if (/\d/.test(s[i])) count++;
      if (count >= n) return i + 1;
    }
    return s.length;
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
