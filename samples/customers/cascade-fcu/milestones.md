# Cascade FCU — deployment milestone tracker

Status as of **2026-06-08** (deployment week 9 of 12). Cutover target: **2026-07-08 06:00 PT**.

| # | Milestone | Owner | Target | Status |
|---|---|---|---|---|
| 1 | Loan tape ingest validation — 5 runs, final run clean | Sam Reeves / Alex Tran | 2026-05-30 | ✅ Complete — run 5 (May 29): 0 rejects |
| 2 | MERS reconciliation streak — 30 consecutive nightly syncs, 0 mismatches | Jordan Liu (Valon MERS liaison) | 2026-06-15 | 🟢 On track — 28 consecutive clean syncs as of Jun 7 |
| 3 | Escrow analysis cadence set to monthly (member expectation) | Alex Tran | 2026-05-28 | ✅ Complete — staging flipped May 27; prod applies at cutover |
| 4 | ACH failover hardening after INC-2026-0517-001 | payments-eng | 2026-05-24 | ✅ Complete — provider timeout 600s → 180s, automatic failover to backup connection |
| 5 | Ops team training (4 sessions, Derek's team) | Sam Reeves | 2026-06-19 | 🟡 3 of 4 done — final session scheduled 2026-06-16 |
| 6 | Cutover rehearsal 1 (full dress run on staging) | All hands | 2026-06-04 | ✅ Passed — 4h12m end-to-end, inside the 6h window |
| 7 | Cutover rehearsal 2 (with Cascade ops shadowing) | All hands | 2026-06-17 | ⏳ Scheduled |
| 8 | `text_to_pay` enablement — NACHA WEB authorization language | Cascade legal (Jordan Park) | Q3 2026 | 🔴 Blocked on customer — 2019 language doesn't cover SMS-initiated debits; flag stays off |
| 9 | Weekly written board update, Fridays 4pm PT | Sam Reeves | Ongoing | 🟢 14 of 14 sent on time |

## Watch items for week 10

- First post-cutover Friday (2026-07-10) is the high-risk ACH concentration day (~2.4x daily volume) — hyper-care staffing plan due to Maya by 2026-06-20.
- Milestone 2 completes mid-week; include the 30-day MERS streak in the next board update (Maya's board is sensitive to migration integrity after the 2024 Sagent rollback).
- Training session 4 (Jun 16) lands the day before rehearsal 2 (Jun 17) — confirm Derek's team availability for both.
