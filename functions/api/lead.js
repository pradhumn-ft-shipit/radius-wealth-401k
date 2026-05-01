// POST /api/lead — captures a lead and emails the team via Resend.
//
// Request body:
//   { name, email, company,
//     intent: "schedule" | "calculate" | "calculator-completed",
//     source, honeypot, turnstileToken,
//     calculatorData?: { inputs, outputs } }
//
// Response: { ok: true } | { ok: false, error: string }

const DEFAULT_RECIPIENT = "pradhumn@fasttrackr.ai";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const {
    name,
    email,
    company,
    intent,
    source = "unknown",
    honeypot = "",
    turnstileToken = "",
    calculatorData = null,
  } = body || {};

  // Honeypot — silent success so bots don't probe.
  if (honeypot && honeypot.trim().length > 0) {
    return json({ ok: true });
  }

  const validationError = validate({ name, email, company, intent });
  if (validationError) {
    return json({ ok: false, error: validationError }, 400);
  }

  // Turnstile — verify only when a server secret is configured.
  if (env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET, request);
    if (!ok) return json({ ok: false, error: "turnstile_failed" }, 400);
  }

  const recipients = buildRecipients(env.LEAD_RECIPIENTS);
  const fromAddress = env.RESEND_FROM || "Radius 401k Site <onboarding@resend.dev>";
  const { subject, html, text } = composeEmail({ name, email, company, intent, source, calculatorData });

  // Dev mode: no API key → log and succeed.
  if (!env.RESEND_API_KEY) {
    console.log("=== /api/lead (dev mode — no RESEND_API_KEY) ===");
    console.log("To:", recipients.join(", "));
    console.log("From:", fromAddress);
    console.log("Subject:", subject);
    console.log("Text body:\n" + text);
    return json({ ok: true, dev: true });
  }

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipients,
        reply_to: email,
        subject,
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error("Resend error:", resendRes.status, detail);
      return json({ ok: false, error: "email_send_failed" }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("Resend exception:", err);
    return json({ ok: false, error: "email_send_failed" }, 502);
  }
}

// ---------- helpers ----------

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function validate({ name, email, company, intent }) {
  const allowedIntents = new Set(["schedule", "calculate", "calculator-completed"]);
  if (!allowedIntents.has(intent)) return "invalid_intent";
  if (!isNonEmptyString(name) || name.length > 120) return "invalid_name";
  if (!isNonEmptyString(company) || company.length > 200) return "invalid_company";
  if (!isNonEmptyString(email) || email.length > 200) return "invalid_email";
  // Lightweight email regex — boundary validation, real check happens at send time.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "invalid_email";
  return null;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function buildRecipients(envList) {
  const extras = (envList || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const all = [DEFAULT_RECIPIENT, ...extras];
  // De-dupe (case-insensitive).
  const seen = new Set();
  return all.filter((addr) => {
    const key = addr.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function verifyTurnstile(token, secret, request) {
  if (!token) return false;
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  if (ip) params.set("remoteip", ip);
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: params });
    const data = await res.json();
    return Boolean(data.success);
  } catch {
    return false;
  }
}

function composeEmail({ name, email, company, intent, source, calculatorData }) {
  const safeName = escapeHtml(name);
  const safeCompany = escapeHtml(company);
  const safeEmail = escapeHtml(email);
  const safeSource = escapeHtml(source);
  const submittedAt = new Date().toISOString();

  if (intent === "calculator-completed") {
    return composeCalculatorEmail({ safeName, safeCompany, safeEmail, safeSource, submittedAt, calculatorData });
  }
  return composeInitialEmail({ safeName, safeCompany, safeEmail, safeSource, submittedAt, intent });
}

function composeInitialEmail({ safeName, safeCompany, safeEmail, safeSource, submittedAt, intent }) {
  const isSchedule = intent === "schedule";
  const choseLabel = isSchedule
    ? "Schedule a Free Plan Review"
    : "Calculate cost (cost analyzer)";
  const subject = isSchedule
    ? "New lead — Radius 401k site (wants to book a call)"
    : "New lead — Radius 401k site (running calculator)";

  const guidanceText = isSchedule
    ? "They've been redirected to the Calendly booking flow. If you don't see a Calendly confirmation come through within an hour or two, consider reaching out directly — they raised their hand."
    : "They're working through the cost analyzer. You'll get a second email with their calculator inputs and estimated savings if they finish. If a second email doesn't arrive within ~30 minutes, they may have abandoned partway — still worth reaching out directly.";

  const text = [
    `A new lead just submitted the gate form on radiuswealth401k.com.`,
    ``,
    `Name:    ${safeName}`,
    `Company: ${safeCompany}`,
    `Email:   ${safeEmail}`,
    ``,
    `They chose: ${choseLabel}`,
    ``,
    guidanceText,
    ``,
    `Source:    ${safeSource}`,
    `Submitted: ${submittedAt}`,
  ].join("\n");

  const html = `
    <!doctype html>
    <html>
      <body style="font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; color: #1A1A1A; max-width: 560px; margin: 0 auto; padding: 24px;">
        <p style="margin: 0 0 16px;">A new lead just submitted the gate form on <strong>radiuswealth401k.com</strong>.</p>

        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 0 0 16px;">
          <tr><td style="padding: 4px 12px 4px 0; color: #555;">Name</td><td style="padding: 4px 0;"><strong>${safeName}</strong></td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #555;">Company</td><td style="padding: 4px 0;"><strong>${safeCompany}</strong></td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #555;">Email</td><td style="padding: 4px 0;"><a href="mailto:${safeEmail}" style="color: #0F5F2E;">${safeEmail}</a></td></tr>
        </table>

        <p style="margin: 0 0 8px;"><strong>They chose:</strong> ${choseLabel}</p>
        <p style="margin: 0 0 24px; color: #444;">${guidanceText}</p>

        <p style="font-size: 12px; color: #888; margin: 24px 0 0;">
          Source: ${safeSource}<br>
          Submitted: ${submittedAt}
        </p>
      </body>
    </html>
  `.trim();

  return { subject, html, text };
}

function composeCalculatorEmail({ safeName, safeCompany, safeEmail, safeSource, submittedAt, calculatorData }) {
  const subject = "Lead completed calculator — Radius 401k site";
  const inputs = calculatorData?.inputs || {};
  const outputs = calculatorData?.outputs || {};

  const inputLines = [
    ["Employees", inputs.employees],
    ["Plan assets", formatCurrency(inputs.planAssets)],
    ["Current all-in fee", formatPercent(inputs.currentFeePct)],
    ["Currently offers a plan", inputs.hasPlan === false ? "No" : "Yes"],
    ["Avg. employee comp", formatCurrency(inputs.avgComp)],
  ];
  const outputLines = [
    ["Current annual fee (est.)", formatCurrency(outputs.currentAnnualFee)],
    ["Radius annual fee (est.)", formatCurrency(outputs.radiusAnnualFee)],
    ["Estimated annual savings", formatCurrency(outputs.annualSavings)],
    ["10-yr cumulative (flat)", formatCurrency(outputs.tenYearSavings)],
    ["SECURE 2.0 credits (est.)", formatCurrency(outputs.secure2CreditEstimate)],
  ];

  const text = [
    `${safeName} from ${safeCompany} (${safeEmail}) just finished the cost analyzer on radiuswealth401k.com.`,
    `High-intent — recommend reaching out.`,
    ``,
    `INPUTS:`,
    ...inputLines.map(([k, v]) => `  ${k}: ${v}`),
    ``,
    `ESTIMATED OUTPUTS:`,
    ...outputLines.map(([k, v]) => `  ${k}: ${v}`),
    ``,
    `Estimates only — formal review required to confirm.`,
    ``,
    `Source:    ${safeSource}`,
    `Submitted: ${submittedAt}`,
  ].join("\n");

  const tableRows = (rows) => rows
    .map(([k, v]) => `<tr><td style="padding: 4px 16px 4px 0; color: #555;">${escapeHtml(k)}</td><td style="padding: 4px 0;"><strong>${escapeHtml(String(v))}</strong></td></tr>`)
    .join("");

  const html = `
    <!doctype html>
    <html>
      <body style="font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; color: #1A1A1A; max-width: 600px; margin: 0 auto; padding: 24px;">
        <p style="margin: 0 0 8px;"><strong>${safeName}</strong> from <strong>${safeCompany}</strong> (<a href="mailto:${safeEmail}" style="color: #0F5F2E;">${safeEmail}</a>) just finished the cost analyzer.</p>
        <p style="margin: 0 0 20px; color: #0F5F2E;"><strong>High intent — recommend reaching out.</strong></p>

        <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin: 24px 0 8px;">Inputs</h3>
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">${tableRows(inputLines)}</table>

        <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin: 24px 0 8px;">Estimated outputs</h3>
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">${tableRows(outputLines)}</table>

        <p style="font-size: 12px; color: #888; margin: 24px 0 0; font-style: italic;">Estimates only — formal review required to confirm. Industry-average benchmarks per Employee Fiduciary 2021 study; does not constitute investment, tax, or legal advice.</p>

        <p style="font-size: 12px; color: #888; margin: 12px 0 0;">
          Source: ${safeSource}<br>
          Submitted: ${submittedAt}
        </p>
      </body>
    </html>
  `.trim();

  return { subject, html, text };
}

function formatCurrency(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatPercent(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
