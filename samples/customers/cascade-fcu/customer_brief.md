
## At a glance

| | |
|---|---|
| Customer | Cascade Federal Credit Union (CFCU) |
| Charter | Federally chartered credit union (NCUA-regulated) |
| HQ | Seattle, WA |
| Footprint | 18 branches across WA, OR, ID |
| Assets | $4.2B |
| Members | ~95,000 |
| Mortgages serviced in-house | 31,247 (per loan tape v3, ingested 2026-05-15) |
| Source servicer | Black Knight LoanSphere MSP |
| Deployment phase | Week 6 of 12 — ingest validation |
| Cutover target | 2026-07-08 06:00 PT |
| Exec sponsor | Maya Chen, VP Mortgage Operations |
| Valon deployment lead | Sam Reeves |

---

## Contract

- **Signed**: 2026-02-14
- **Term**: 5 years, auto-renewing 1-year
- **TCV**: $2.4M
- **Go-live target**: 2026-07-08
- **Success milestones** (per the signed SOW):
  1. Clean cutover with <1% post-cutover delinquency variance vs. baseline
  2. Member portal traffic at or above prior-MSP baseline within 30 days of cutover
  3. First annual escrow analysis cycle completed without RESPA-disclosure exceptions
  4. Two consecutive monthly NPS surveys at or above 65 for CFCU members on Valon

---

## Stakeholder map (Cascade side)

| Name | Role | Comms preference | Notes |
|---|---|---|---|
| Maya Chen | VP Mortgage Operations | Email summaries; very protective of her calendar | Exec sponsor. Weekly board update is her ask — see Risk 4 below. |
| Derek Olusola | Director of Servicing | Weekly sync + ad-hoc Slack | Day-to-day operational lead. Wears Priya's hat when she's out. |
| Priya Subramanian | IT Integration Lead | Tickets + technical calls | **OOO 2026-05-11 → 2026-05-22.** MERS handoffs delegated to Derek during this window. |
| Jordan Park | Risk & Compliance | Email; CC Maya | Quiet stakeholder; only surfaces on regulatory questions. |

## Stakeholder map (Valon side)

| Name | Role |
|---|---|
| Sam Reeves | Deployment Strategist (primary) |
| Alex Tran | Solutions Architect |
| Jordan Liu (Valon) | MERS liaison (no relation to Cascade's Jordan) |

---

## Risk register

1. **Prior failed migration to Sagent (2024)** — Cascade attempted to migrate off Black Knight 18 months ago. Sagent's "go-live" turned out to be a paper cutover that fell apart in week 2. Cascade rolled back, took the loss, and the experience left Maya and her board allergic to surprises. Every milestone we hit needs proactive over-communication. *Most-cited risk in every internal Cascade call.*

2. **Priya OOO 2026-05-11 → 2026-05-22** — Priya owns the MERS integration handoff. Her absence overlaps with our boarding test runs 3 and 4. Derek has agreed to be the backup, but any MERS-side question more technical than "did the sync run" needs to wait for her return.

3. **NACHA WEB authorization gap** — Cascade's member-facing WEB authorization language is from 2019 and doesn't cover SMS-initiated debits. The `text_to_pay` feature flag stays off until Cascade legal updates the language. Expected timeline: Q3 2026. Member experience gap in the meantime.

4. **Weekly board status email** — Maya wants a written status update sent every Friday at 4pm PT for the duration of the deployment. Single owner: Sam. Missing one will be highly visible. Template at `templates/cfcu-board-update.md` in the deployment workspace.

5. **Friday-evening payment concentration** — Cascade members are concentrated in industries that pay biweekly on Fridays. ACH volume on Friday evenings is ~2.4x the daily average. The Wednesday 2026-07-08 cutover date avoids the worst of this, but the first post-cutover Friday (2026-07-10) is high-risk; plan extra hyper-care staffing.

---

## Recent meeting log

| Date | Type | Notes |
|---|---|---|
| 2026-05-12 (Mon) | Kickoff for week 6 | Reviewed boarding test plan; locked May 15 as ingest run 3. |
| 2026-05-14 (Wed) | Ad-hoc with Priya | MERS integration test results review before her PTO. No blockers surfaced. |
| 2026-05-16 (Fri) | Async update | Shared the May 15 ingest summary; flagged 12 rejects. |
| **2026-05-19 (Tue)** | **Weekly sync — TODAY** | Standing weekly with Derek + Maya. |

---

## Open items going into 2026-05-19 sync

- Reject classification for the 12 May 15 records (4 missing investor_loan_id; 8 escrow date format)
- Escrow analysis cadence — Cascade members expect monthly statements; staging tenant currently set to annual
- Maya wanted a written response on the May 17 ACH provider timeout before the next board update
- Training schedule for Derek's ops team (4 sessions in the next 3 weeks)
