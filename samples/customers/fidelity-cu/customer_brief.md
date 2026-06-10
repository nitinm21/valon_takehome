
## At a glance

| | |
|---|---|
| Customer | Fidelity Credit Union (Fidelity) |
| Charter | State-chartered credit union (NCUA-insured) |
| HQ | Charlotte, NC |
| Footprint | 12 branches across NC, SC, GA |
| Assets | $1.1B |
| Members | ~38,000 |
| Mortgages serviced in-house | 14,512 (per loan tape v2, ingested 2026-05-19) |
| Source servicer | Fiserv LoanServ |
| Deployment phase | Week 4 of 8 — ingest validation |
| Cutover target | 2026-06-22 06:00 ET |
| Exec sponsor | Diane Whitaker, VP Mortgage Lending |
| Valon deployment lead | Jamie Cole |

---

## Contract

- **Signed**: 2026-03-18
- **Term**: 3 years, auto-renewing 1-year
- **TCV**: $920K
- **Go-live target**: 2026-06-22
- **Success milestones** (per the signed SOW):
  1. Clean cutover with zero member-visible service interruption beyond the scheduled window
  2. Member portal sign-in rates within 5% of prior baseline within 14 days of cutover
  3. First monthly escrow analysis cycle completed without disclosure exceptions
  4. Monthly statement CSAT at or above 4.5/5 for first 60 days on Valon

---

## Stakeholder map (Fidelity side)

| Name | Role | Comms preference | Notes |
|---|---|---|---|
| Diane Whitaker | VP Mortgage Lending | Email + weekly sync | Exec sponsor. Warm, low-drama. Cares most about borrower-facing comms. |
| Marcus Rivera | Servicing Manager | Weekly sync + Slack | Day-to-day operational lead. Knows the servicing flows cold. Fast turnaround on sign-offs. |
| Lin Park | IT Integration Lead | Email + tickets | Owns the Fiserv LoanServ extract and the MERS handoff. At a broker conference 2026-05-18 → 2026-05-22. |

## Stakeholder map (Valon side)

| Name | Role |
|---|---|
| Jamie Cole | Deployment Strategist (primary) |
| Riley Chen | Solutions Architect |

---

## Risk register

1. **Manufactured-home property type code mismatch** — Fidelity's internal extract uses `MFR` for manufactured homes; the standard servicing schema expects `MAN`. Caused 3 rejects in test ingest 2. One-line mapping fix queued for staging 2026-05-27. Low risk once patched.

2. **Borrower transfer notice — member services phone number** — Fidelity wants their own member services number (not Valon's) listed on the 15-day borrower transfer notice for the first 90 days post-cutover. Continuity ask — members have known Fidelity's number for 32 years. Pending RESPA confirmation from Valon legal.

3. **Lin OOO 2026-05-18 → 2026-05-22** — Lin owns the MERS handoff. Her absence overlaps with sync 2026-05-21. Marcus is covering operational questions; MERS-specific items wait for her return.

---

## Recent meeting log

| Date | Type | Notes |
|---|---|---|
| 2026-05-05 (Tue) | Kickoff for week 3 | Reviewed boarding plan; locked May 19 for ingest run 2. |
| 2026-05-12 (Tue) | Ad-hoc with Lin | Walked MERS sync setup before her PTO. No blockers. |
| 2026-05-19 (Tue) | Ingest summary share-out | Async — emailed run 2 summary; flagged 3 rejects. |
| **2026-05-21 (Thu)** | **Weekly sync — TODAY** | Standing weekly with Marcus + Diane. |

---

## Open items going into 2026-05-21 sync

- Reject classification for the 3 May 19 records (all property_type = MFR)
- Statement PDF design proof — needs Fidelity sign-off on logo, color, footer
- Borrower transfer notice email — phone number question + final wording
- Lin's return 2026-05-26 — schedule MERS final-cut rehearsal
