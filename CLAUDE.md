# Radius Wealth — Agent Instructions

Pair programmer building a fast, visual marketing site for Radius Wealth Management. Cloudflare-hosted, lead capture, embedded 401k calculator.

**Every session:** Read `state/plan.md` first. Update it when done. Append non-obvious decisions to `state/decisions.md`.

**Source of truth:** `Content/401k-page-new.md` (page copy) and `Content/calculator-logic-new.md` (calculator math) are canonical. If anything in this file conflicts with those specs, the spec wins — and update this file.

---

## Brand Identity

White-themed site. Black text. Dark green for action only.

| Token | Value | Use |
|---|---|---|
| Background | `#FFFFFF` | Default. Generous whitespace. |
| Text | `#1A1A1A` | All body, headings, nav. |
| Brand green | `~#0F5F2E` | Buttons, CTAs, hover, accents, logo. Pull exact hex from logo. |
| Green hover | `~#0A4A22` | Button hover, active states. |
| Subtle gray | `#F5F5F5` | Section background separation. |

**Rules:**
- Headings and body text are always black. Never green.
- Green is reserved for buttons, CTAs, hover states, and small accent moments (icon strokes, nav underline, focus rings).
- If green is everywhere, the eye stops noticing it.

Tone: trust, calm, premium. Lean into restraint. Never tech-startup-y.

---

## Stack

- **Cloudflare Pages** — hosting + CDN, Git deploy. Static site lives in `public/`.
- **Cloudflare Pages Functions** — `functions/api/lead.js` handles lead submission. Same runtime as Workers, colocated with the static site so one repo and one deploy ship everything.
- **Resend** — transactional email to the team.
- **Cloudflare Turnstile** — invisible spam protection (skipped in dev when secret is empty).
- **Cloudflare KV** — optional, for lead logging.

**Vanilla HTML, CSS, JS.** No React, no build step. Vanilla JS *is* expected — for the calculator, form fetch, and animations. The rule is no heavy frameworks, not no JavaScript.

---

## Architecture

Static page → on CTA click, inline-expand gate (name / company / email) → POST `/api/lead` → validate + honeypot + Turnstile → Resend email to the team → on success either redirect to Calendly (with name/email prefill) or unlock the calculator. Lead persisted in `sessionStorage` so subsequent CTAs in the session bypass the gate.

**Two notification emails per lead** (this overrides the spec's "no gate in v1"):
- **Email #1** fires the moment the gate is submitted. Subject indicates whether the lead chose *Schedule a call* or *Calculate cost*, so the team knows whether to wait for calculator data or reach out immediately.
- **Email #2** fires only when the user clicks "See my results" in the calculator. Includes the inputs and computed estimates.

Recipients: `pradhumn@fasttrackr.ai` is hardcoded as a default. Additional recipients come from the `LEAD_RECIPIENTS` env var (comma-separated).

---

## 401k Calculator

**Inputs (5)** — per `Content/calculator-logic-new.md`:
1. Number of employees (1–10,000)
2. Estimated total plan assets (USD)
3. Current all-in fee % (default 1.18%)
4. Currently offer a plan? (Yes / No toggle)
5. Average employee compensation (advanced, default $75K)

**Outputs:** current annual fees, Radius annual fees (assumed 0.65% — placeholder, confirm with Christian), estimated annual savings, 10-year cumulative (flat — NOT compounded, per SEC Marketing Rule), SECURE 2.0 credit estimate.

**CTA below result:** *"Schedule a call to discuss your numbers →"* → Calendly with prefill (gate already cleared).

The calculator is locked behind the gate — `data-calc-lock` shows the unlock prompt; once gated, `html.gate-cleared` reveals `[data-calc-inner]`. Live recalc is debounced 300ms but **email #2 fires only on explicit "See My Results" click**.

---

## Compliance constraints

- SEC Marketing Rule (2022) compliant — no unsubstantiated performance claims.
- Outcome language hedged: "may," "estimated," "depends on," never "will."
- Calculator outputs carry inline disclaimers (not collapsed).
- 1.18% benchmark cites Employee Fiduciary 2021 study at point of use.
- Tax credit figures cite IRS rules and recommend CPA consultation.

---

## Lead capture

The gate is an inline-expand form (not a modal): three fields (name, company, email) + honeypot (`name="website"`) + Turnstile token (when configured). On submit, button replaces with the form in place; on cancel, button restores. After successful submit, the form is removed and the intent action fires.

---

## `/api/lead` (Pages Function)

`POST` only. Body:
```
{ name, email, company,
  intent: "schedule" | "calculate" | "calculator-completed",
  source, honeypot, turnstileToken,
  calculatorData?: { inputs, outputs } }
```
Returns `{ ok: true }` or `{ ok: false, error }`. In dev (no `RESEND_API_KEY`), the function logs the email body to stdout and returns `{ ok: true, dev: true }` so the page works offline.

---

## Design

**Mobile-first methodology, not mobile-priority.** Base styles for 375px, layer up via `@media (min-width: 768px)` etc. Desktop is fully designed, just built on top of a mobile foundation.

**Visual character:**
- **Typography** — editorial serif for display (Fraunces, Playfair, or similar), clean sans for body. No Inter/Roboto/Arial.
- **SVG over raster** — every illustration, icon, decorative element. Convert logo to SVG. No stock photos.
- **Animations** — meaningful, not gratuitous:
  - Staggered hero fade-in on load
  - Scroll-triggered fade-up per section
  - Number counter on calculator results
  - SVG path animations on key illustrations
  - Smooth scroll, premium hover states (shadow lift, color shift)
- **Spacing** — generous. Wealth buyers respond to breathing room.

Load `skills/frontend-design.md` before building any UI.

---

## Performance

| Metric | Target |
|---|---|
| LCP | < 2.5s on mobile |
| CLS | < 0.1 |
| TTI | < 3.5s |
| Page weight | < 500kb |

Lighthouse (mobile + desktop) before marking any page task done.

---

## Commands

```bash
npm install                        # one-time
npm run dev                        # wrangler pages dev → http://localhost:8788 (static + functions)
npm run deploy                     # wrangler pages deploy public --project-name=radius401k
npm run optimize-images            # macOS-only (sips). Re-run if Content/ headshots change.
```

Local API smoke test:
```bash
curl -s -X POST http://127.0.0.1:8788/api/lead \
  -H 'content-type: application/json' \
  -d '{"name":"X","email":"x@y.com","company":"Z","intent":"schedule","source":"smoke"}'
```

Lighthouse mobile + desktop in Chrome DevTools before marking any page task done.

---

## Guardrails

- Build Worker endpoints first; test with curl before wiring the frontend.
- Secrets in `.dev.vars` locally (gitignored) or Pages env vars in production. Never in code.
- More than 4 files touched → pause and break into steps.
- Destructive actions → confirm first.
- New dependency → justify why native won't do.

---

## State

```
state/
├── plan.md       # Done, in progress, next. Read first, update always.
├── decisions.md  # Append-only.
```

---

White and black. Green for action. SVG everything. Vanilla stack. Read the plan, build in layers, update the plan.
