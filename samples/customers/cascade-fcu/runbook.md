# Cascade FCU — Deployment Runbook

**Owner**: Sam Reeves (Deployment Strategist)
**Last updated**: 2026-05-17
**Cutover target**: 2026-07-08 06:00 PT

---

## Pre-cutover checklist

This is the walking-into-cutover list. Tick items as you confirm them in both Cascade's environment and our staging tenant. Item owners in parens.

- [x] Signed servicing transfer agreement on file (Sam, complete 2026-02-14)
- [x] MERS membership transfer initiated (Priya / Alex, complete 2026-03-04)
- [x] Loan tape v1 received from Black Knight (Sam, 2026-04-02)
- [x] Loan tape v1 ingested in staging — 31,124 records, 47 rejects (Alex, 2026-04-09)
- [x] Reject root cause analysis & schema fixes for v1 (Alex, 2026-04-16)
- [x] Loan tape v2 ingested — 31,201 records, 23 rejects (Alex, 2026-05-01)
- [x] Loan tape v3 ingested — 31,247 records, 12 rejects (Alex, 2026-05-15)
- [ ] Reject classification for v3 — IN PROGRESS, see 2026-05-15 WARN block in integration_log
- [ ] Parallel-run trial: 5 business days of mirrored payments (Alex / Derek, scheduled 2026-06-10)
- [ ] Borrower 15-day transfer notice mailed by Cascade (Derek, scheduled 2026-06-20)
- [ ] MERS final beneficiary update file generated (Priya, scheduled 2026-07-01)
- [ ] Day-of contact tree confirmed and posted (Sam, scheduled 2026-07-03)
- [ ] War room staffing & shift schedule signed off (Sam + Maya, scheduled 2026-07-05)
- [ ] Final go / no-go meeting (all hands, scheduled 2026-07-07)
- [ ] Post-cutover hyper-care begins (Sam, scheduled 2026-07-09)

---

## Day-of cutover sequence (2026-07-08)

| Time PT | Step | Owner | Notes |
|---|---|---|---|
| 00:00 | Cascade closes Black Knight MSP for write ops | Derek | Read-only kept until 06:00 |
| 00:30 | Final delta loan tape pulled and shipped | Priya | SFTP drop to `cascade-prod-cutover` |
| 01:00 | Delta loan tape ingested in production | Alex | Expect <50 deltas vs. v3 |
| 02:00 | MERS final beneficiary file submitted | Priya | Confirmation typically within 4h |
| 03:00 | Payment systems pointed at Valon endpoints | Alex | DNS swap; see `integrations.ach` config |
| 04:00 | First live API call from Cascade member portal | Joint | Sam pages if no traffic by 04:30 |
| 05:00 | Spot-checks: 100 random loans validated end-to-end | Alex | Use the `cutover-validator` script |
| 06:00 | Cutover window closes — all systems live on Valon | Sam | Maya notified |
| 06:00–12:00 | Hyper-care: war room staffed for member inquiries | Sam + Derek | Hourly check-ins |

---

## Common Cascade questions

Questions Derek and Maya have asked more than once. Answer consistently or flag a real change.

1. **"Will member statements look the same?"** — Yes for statement content and structure; the template set `cfcu-cobrand-v1` preserves Cascade's logo, color, and layout. Footer adds a tiny "Serviced by Valon" line required by RESPA disclosure.

2. **"What happens if a member is mid-loss-mitigation at cutover?"** — Active workouts transfer with their status; queued documents do not. We pull a workouts-in-flight report 5 days before cutover and triage with Derek's team.

3. **"How quickly do escrow analyses post after a tax bill changes?"** — Within 5 business days of the disbursement (see `sla` block in tenant_config). The member portal exposes the preview PDF behind the `escrow_analysis_preview_pdf` flag.

4. **"What's the escalation path for a member who can't log in on day 1?"** — Cascade member services handles tier 1; if it's a Valon-side issue (authn, account linking) they escalate to our hyper-care line. Don't route through normal support — that's only post-hyper-care.

5. **"Can our compliance team see audit logs for every action a Valon agent takes on a Cascade loan?"** — Yes, exposed via the `cfcu-audit-mirror` daily export. Sample shared 2026-05-08.

6. **"What's different from the Sagent migration?"** — Tracked in the risk register (`customer_brief.md`). Short answer: our parallel-run trial is real payment processing on real loans for 5 business days, not a paper exercise — which is what Sagent's "go-live" actually was.

---

## Escalation paths

| Issue type | First responder | Escalate to (Valon) | Escalate to (Cascade) |
|---|---|---|---|
| Boarding ingest failure | Alex Tran | Eng on-call | Priya (if up); else Derek |
| MERS sync mismatch | Priya / Alex | Jordan Liu (MERS liaison) | Priya |
| Payment processing | ACH ops desk | Payments eng manager | Derek |
| Member portal downtime | Platform on-call | VP Engineering | Maya (P1 only) |
| Regulatory inquiry | Sam | Valon legal | Jordan Park (Cascade) + Maya |

---

## Known quirks

Cascade-specific oddities that bite if you forget them.

1. **Escrow analysis date format.** Cascade's prior MSP exports dates as `MM/YY`. Our boarding script normalizes to `YYYY-MM-DD`. The May 15 ingest had records where the year inference failed when the day-of-month was in the future — see the WARN block in `integration_log.txt`. Fix is to trust the prior analysis month and use the current calendar year unless the day-of-month is in the future, in which case use the prior year.

2. **Member ID vs. loan ID.** Cascade members can have multiple loans; their MSP keyed off member ID by default. We key off `loan_id` for all servicing operations. Be explicit when talking to Derek — he'll sometimes give a member ID and expect us to know which of their loans he means.

3. **Friday-skip rule for tax escrow disbursement.** Cascade prefers tax disbursements not be cut on Fridays because their branch reconciliation runs Monday morning. Our default is "next business day"; for CFCU we honor a Friday-skip rule via `sla.escrow_disbursement_skip_fridays: true`.

4. **NACHA WEB authorization.** Cascade has NOT yet enabled the `text_to_pay` feature flag because their WEB authorization language from 2019 doesn't cover SMS-initiated debits. Legal review pending; do NOT enable the flag until that's resolved.
