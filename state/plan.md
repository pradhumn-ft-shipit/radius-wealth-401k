# Plan

## Done
- Bootstrapped project skeleton (vanilla HTML/CSS/JS + Cloudflare Pages Functions).
- Set up `/api/lead` Pages Function with Resend integration and dev-mode fallback.
- Built single-page site with all 9 sections from `Content/401k-page-new.md`.
- Built 401(k) Cost Analyzer per `Content/calculator-logic-new.md` (5 inputs, hedged outputs).
- Inline-expand gate on both primary CTAs; sessionStorage persistence; calculator unlocked after gate.
- Two-email notification flow: email #1 on gate submit, email #2 on calculator completion.
- Visual layer: 4 Imagen-4-generated editorial photos (hero/boston/service/credits) + 12-symbol inline SVG icon sprite at `/assets/svg/icons.svg`. Hero split layout, problem/service/why-now icons, credits + about split-column visuals, Boston skyline final-CTA background.

## In progress
- Local verification + visual polish.

## Next
- Replace 0.65% Radius fee placeholder with confirmed number.
- Replace Calendly placeholder URL.
- Add Resend API key + verify sending domain.
- Add Cloudflare Turnstile keys.
- Push to git and deploy to Cloudflare Pages.
