# 401(k) Cost Analyzer — Logic & Spec (v2)

**Tool name (working):** Radius 401(k) Plan Cost Analyzer
**Embed:** Section 7 of the `radiuswealth401k.com` home page
**Standalone URL (optional):** `radiuswealth401k.com/calculator`
**Calendly placeholder URL throughout:** `https://calendly.com/radiuswealth401k/intro` *(replace before launch)*
**Purpose:** Convert business-owner traffic into qualified booked calls by quantifying (a) what their current plan likely costs them, (b) what a Radius-managed plan could cost, and (c) what tax credits they may qualify for.

---

## 1. Design Principles

1. **Simple inputs, precise outputs.** Five fields max. Owners abandon long forms.
2. **One CTA after the result.** Top-line savings shown free, immediately. Then a single, prominent "Schedule a call" button. No email gate, no PDF report, no nurture sequence in v1.
3. **No false precision.** All outputs are clearly labeled as estimates based on industry benchmarks. Every dollar figure carries a disclaimer.
4. **SEC-compliant.** No performance guarantees. No "will save" language — only "estimated" or "may save." Disclosures visible, not buried.
5. **Lead-quality > lead-quantity.** A booked call is worth more than an email address.

---

## 2. Inputs (5 fields)

| # | Field | Type | Required | Default | Validation |
|---|---|---|---|---|---|
| 1 | Number of employees | Integer | Yes | — | 1–10,000 |
| 2 | Estimated total plan assets | Currency (USD) | Yes | — | $0–$500,000,000 |
| 3 | Current all-in fee (% of assets) | Percent | No | **1.18%** (industry avg, see §6) | 0.10%–3.00% |
| 4 | Do you currently offer a plan? | Toggle | Yes | "Yes" | Yes / No |
| 5 | Average employee compensation | Currency (USD) | No (advanced) | $75,000 | $20,000–$500,000 |

**UX notes:**
- Field 3 should be pre-filled with the default and labeled: *"Industry average. Slide to adjust if you know your number."*
- Field 4 ("No") triggers the SECURE 2.0 startup credit eligibility logic in addition to the savings comparison.
- Field 5 is collapsed under an "Advanced" disclosure; only opens if the user wants more accuracy on the contribution-credit estimate.

---

## 3. Default Benchmarks (with sources)

These are the constants the calculator runs against. All must be reviewed annually and re-cited in the page footnotes.

### A. Industry-average all-in fee — **1.18%**
*Source: Employee Fiduciary, "401(k) Fee Study: 75% of Small Business Plans Pay Hidden Fees" — weighted average all-in fee across 104 small-business plans with under $5M in assets. Average plan in study: 22 participants, ~$1.2M in assets.*

This is defensible as the default for plans roughly $0–$5M in assets. For larger plans, consider tiering:

| Plan asset range | Default fee % | Source |
|---|---|---|
| Under $500K | 1.40% | Smaller plans skew higher (Employee Fiduciary 2018 study, 1.40% avg) |
| $500K – $5M | **1.18%** | EF 2021 study (primary benchmark) |
| $5M – $25M | 0.85% | Mid-market estimate; refine with 401(k) Averages Book data |
| Over $25M | 0.60% | Mid-to-large market; refine before launch |

**Recommendation:** For v1, use a single default of 1.18% with the slider. Tiered defaults can be a v1.1 enhancement once the calculator has live traffic.

### B. Estimated Radius all-in fee
**Placeholder: 0.65%** *(needs confirmation from Christian before launch)*

For mid-market plans ($1M–$5M), 2024 industry data shows average advisory-only fees around 0.47–0.64% (median ~0.50–0.60%). Combined with recordkeeping/admin costs, an all-in figure of ~0.65% is competitive and supportable for a fee-only RIA running an open-architecture lineup. **Christian to confirm the actual all-in number Radius can deliver before this goes live.**

### C. Industry % of plans with hidden fees — **75.96%**
*Source: same Employee Fiduciary 2021 study. Used in copy, not in math.*

### D. SECURE 2.0 Tax Credit Logic

The calculator estimates eligibility for three federal credits based on inputs.

#### Startup Credit
- **Eligible:** Employer with 1–100 employees, *and* "Currently offer a plan?" = No.
- **Amount estimate:**
  - 1–50 employees: 100% of qualified startup costs, capped at greater of $500 or ($250 × NHCEs), max $5,000/year × 3 years.
  - 51–100 employees: 50% of qualified startup costs, max $5,000/year × 3 years.
- **For estimate purposes:** assume qualified startup costs = $4,000/year (conservative midpoint). Display: "Up to $X,XXX over 3 years, depending on actual plan setup costs."

#### Auto-Enrollment Credit
- **Eligible:** Any employer adding a new plan (or adding eligible auto-enroll to an existing one).
- **Amount:** Flat $500/year × 3 years = $1,500 total.

#### Employer Contribution Credit
- **Eligible:** 1–100 employees. Amount applies to contributions made on behalf of employees earning ≤$100K/year.
- **Estimate logic:** For simplicity, assume:
  - Employees earning ≤$100K/year ≈ 70% of headcount (override with field 5 if user provides it).
  - Per-employee credit = $1,000/year, phasing: 100% Y1, 100% Y2, 75% Y3, 50% Y4, 25% Y5.
  - First 50 employees only.
- **For 1–50 employee businesses:** full credit applies. For 51–100: phase down by 2 percentage points per employee over 50 (per IRC §45E).
- **Display:** "Estimated $X over 5 years based on assumed employer contributions for employees earning under $100K. Actual amount depends on your contribution structure."

**Critical disclaimer on tax credit output:**
*Tax credit estimates are illustrative based on the inputs provided and current federal law. Actual eligibility, amounts, and phase-outs depend on your specific facts and circumstances. Radius does not provide tax advice; consult your CPA or tax counsel.*

---

## 4. Calculations

### Top-line output (shown immediately on submit, no gate):

```
current_annual_fee_dollars = plan_assets × current_fee_percent
radius_annual_fee_dollars  = plan_assets × radius_fee_percent
estimated_annual_savings   = current_annual_fee_dollars − radius_annual_fee_dollars
```

If `estimated_annual_savings <= 0`, suppress the "savings" headline and instead show: *"Your current fees appear competitive. We'd still welcome a free benchmark review to confirm."* (Avoid telling them they're getting a great deal when we don't know that.)

### Secondary stats (also shown immediately):

**1. 10-year projected savings (flat extrapolation):**
```
10yr_savings = annual_savings × 10
```

**Important compliance call:** v1 deliberately uses a **flat extrapolation, not compounded.** Compounding "fees not paid" into a future-value projection (e.g., assuming a 7% growth rate) crosses into performance-projection territory under the SEC Marketing Rule and triggers heightened scrutiny for RIAs. The flat extrapolation is conservative, defensible, and easy to explain.

Label this output: *"Estimated cumulative fee savings over 10 years, assuming plan assets remain at the level provided. Does not account for asset growth, contributions, or investment returns."*

**2. SECURE 2.0 tax credit eligibility summary** (logic in §3.D)

**3. Current fees as % of plan** (echo back their input for context)

---

## 5. Output Structure

### Top-line (shown immediately on submit)

**Headline:**
"Estimated annual savings: **$X,XXX**"

**Sub-line:**
"Based on industry-average benchmarks and the inputs you provided. A formal benchmark review will confirm your actual numbers."

**Three secondary stat cards:**
1. Estimated 10-year savings: $XX,XXX *(flat extrapolation, see disclaimer)*
2. SECURE 2.0 credits you may qualify for: $X,XXX – $XX,XXX
3. Estimated current fees as % of plan: X.XX%

### Single CTA below results (no email gate)

**Primary CTA:**
**Schedule a call to discuss your numbers →** `[Calendly link]`

**Sub-line under CTA:**
"20 minutes. No obligation. We'll review your current plan and tell you honestly whether we can do better for you."

### Edge case: zero or negative savings

If the calculator concludes the user's current fees are already competitive (estimated savings ≤ $0), suppress the "savings" headline and replace with:

**Headline:** "Your current plan fees appear competitive."

**Sub-line:** "Based on industry averages and your inputs, you may already be paying a reasonable rate. A formal benchmark review can confirm — and we can still help with plan design, compliance, and tax credit eligibility."

**CTA stays the same:** Schedule a call.

---

## 6. Lead Capture (Simplified)

There is no email gate in v1. The only conversion path is the Calendly booking link.

When a user clicks "Schedule a call," they're taken to Calendly, where they enter their information as part of booking. Calendly captures:
- Name
- Email
- Optional notes

Calendly should be configured to:
- Push every booking to the CRM (via Calendly's native integration or Zapier)
- Tag the lead with `lead-source: 401k-calculator`
- Notify the team immediately on booking

**Future enhancement (v1.1 or later):** If the team wants to capture leads who don't book, an optional "email me a copy of these results" field can be added below the CTA. This was deliberately left out of v1 to keep the flow simple and conversion-focused.

---

## 7. Edge Cases & Validation

| Scenario | Behavior |
|---|---|
| User enters $0 plan assets but "currently offer a plan" = Yes | Surface friendly inline error: "Plan assets must be greater than $0 if you currently offer a plan." |
| Current fee % left blank | Use default 1.18% with visible "Industry average" tag |
| 10,000+ employees | Hard cap; show: "For plans this size, please contact us directly for a custom benchmark." Hide the calculator output and show the CTA only. |
| Negative or unrealistic savings (current fee < Radius fee) | Suppress the savings headline. Show neutral message (see §5). CTA stays. |
| User refreshes mid-form | Persist values in `sessionStorage` so they don't lose progress. |
| Mobile screen | Inputs stack vertically. Output cards stack vertically. CTA remains prominent. |

---

## 8. Required Disclaimers (must appear with the calculator)

**Inline disclaimer (visible directly under the calculator results, not in a tooltip):**

*This calculator provides illustrative estimates based on industry-average benchmarks and the information you provide. Actual fees, savings, and tax credit eligibility depend on your plan's specific facts and a formal review. Output figures are not a guarantee, projection, or recommendation. The calculator does not constitute investment, tax, or legal advice. Industry-average all-in fee benchmark of 1.18% is sourced from the Employee Fiduciary 2021 small-business 401(k) fee study and is used here for general comparison only; it may not reflect the fees of any specific plan. SECURE 2.0 tax credit estimates reflect current federal law and are subject to IRS rules and your eligibility. Radius Wealth Management is a Registered Investment Advisor in the Commonwealth of Massachusetts. Past performance is not indicative of future results.*

---

## 9. Build Notes

**Frontend:**
- Embed inline on the home page in Section 7
- Live recalculation on input change (debounced 300ms)
- All output values formatted with thousands separators and currency symbols
- Keyboard accessible; full screen-reader labels on all inputs

**Backend:**
- Minimal — no PDF generation, no transactional email send, no email capture in v1
- Calendly handles lead capture and CRM push at the booking step
- Rate limit on calculator submissions: 10 per IP per hour (anti-abuse)

**Analytics events to fire:**
- `calculator_started` — first input change
- `calculator_completed` — top-line shown
- `cta_calendly_clicked` — user clicks "Schedule a call"
- `cta_call_booked` — Calendly webhook confirms a booking

**Annual maintenance checklist:**
- Update industry-average fee benchmark with latest available study
- Update SECURE 2.0 figures if amended by Congress
- Update IRS contribution and compensation thresholds
- Re-verify Radius fee assumption is still accurate
- Re-cite all source URLs in this doc

---

## 10. Open Items

1. **Confirm Radius all-in fee assumption** (placeholder: 0.65%) before any launch.
2. **Confirm Calendly URL** for the CTA throughout the page.
3. **Confirm CRM** that Calendly should push bookings to (so analytics tagging is set up correctly).
4. **Compliance review** — recommend running the live calculator past Radius's compliance attorney before launch, given Marketing Rule sensitivity around quantitative output.
