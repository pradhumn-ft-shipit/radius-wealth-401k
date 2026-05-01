# Decisions

Append-only log of non-obvious choices.

---

## 2026-05-01 — Cloudflare Pages Functions, not standalone Worker

Chose Pages Functions (`functions/api/lead.js`) over a separate Worker. Single repo, single deploy, single local-dev command (`wrangler pages dev`). CLAUDE.md describes Workers generically; same runtime, simpler ergonomics for this project.

## 2026-05-01 — Email gate added to v1 (overrides spec)

`Content/calculator-logic-new.md` says "no email gate in v1." User explicitly overrode this — both CTAs are gated behind name/email/company. Rationale: client wants notified leads even for calculator users, not just bookings.

## 2026-05-01 — Two notification emails per lead

Email #1 on gate submit (always) — includes which CTA they chose so the team knows whether to wait for calculator data or reach out immediately. Email #2 only if calculator is completed — includes inputs + outputs.

## 2026-05-01 — Radius fee placeholder = 0.65%

Per `Content/calculator-logic-new.md` §3. Flagged in code as TODO. Christian to confirm before launch.

## 2026-05-01 — Logo shipped as PNG, not SVG

Auto-tracing wordmarks is risky. PNG is optimized + 2x for retina until a clean SVG is provided.

## 2026-05-01 — `ten_year_savings = annual × 10` (flat, NOT compounded)

Per spec §3, to avoid SEC Marketing Rule performance-projection scrutiny.

## 2026-05-01 — Email #2 fires on explicit "See My Results" click

Live recalc happens on every input change (debounced 300ms) for UX, but the email only fires on an explicit user action, so we don't spam recipients with every keystroke.
