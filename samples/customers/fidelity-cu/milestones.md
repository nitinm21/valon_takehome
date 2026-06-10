# Fidelity CU — deployment milestone tracker

Status as of **2026-06-08** (deployment week 6 of 8). Go/no-go review: **2026-06-15**. Cutover target: **2026-06-22 06:00 ET**.

| # | Milestone | Owner | Target | Status |
|---|---|---|---|---|
| 1 | Loan tape ingest validation — final run clean | Jamie Cole | 2026-06-05 | ✅ Complete — run 4 (Jun 4): 0 rejects |
| 2 | Parallel run — payment variance ≤ 0.25% vs LoanServ for 2 consecutive weeks | Jamie Cole / payments-eng | 2026-06-14 | 🟢 On track — week 1 closed at 0.1%; week 2 in flight |
| 3 | Trailing document indexing backlog cleared | Fidelity ops + Valon docs team | 2026-06-12 | 🟡 At risk — 600 of ~2400 docs remaining; throughput must hold at ~120/day |
| 4 | Staff training (3 sessions) | Jamie Cole | 2026-06-13 | 🟡 2 of 3 done — final session 2026-06-11 |
| 5 | Member communications — cutover mailer + portal banner | Diane Whitaker (Fidelity) | 2026-06-10 | ⏳ Mailer approved, sends 2026-06-10 |
| 6 | Go/no-go review with Diane + Fidelity board delegate | Jamie Cole | 2026-06-15 | ⏳ Scheduled |

## Watch items for week 7

- Milestone 3 is the only at-risk item: if doc indexing throughput drops below ~120/day the backlog misses the Jun 12 target and becomes a go/no-go discussion point.
- Parallel-run variance must stay ≤ 0.25% through 2026-06-14 to satisfy milestone 2's two-week requirement — any single-day excursion resets the conversation, not the clock.
- Cutover lands a Monday; final weekend freeze on LoanServ side starts 2026-06-20 18:00 ET (confirm with Fiserv contact by Jun 16).
