# Fidelity CU — Deployment Runbook

**Owner**: Jamie Cole (Deployment Strategist)
**Last updated**: 2026-05-20
**Cutover target**: 2026-06-22 06:00 ET

---

## Pre-cutover checklist

Walking-into-cutover list. Tick items as you confirm them in Fidelity's environment and our staging tenant. Owners in parens.

- [x] Signed servicing transfer agreement on file (Jamie, complete 2026-03-18)
- [x] MERS membership transfer initiated (Lin / Riley, complete 2026-04-02)
- [x] Loan tape v1 received from Fiserv (Jamie, 2026-05-01)
- [x] Loan tape v1 ingested in staging — 14,472 records, 19 rejects (Riley, 2026-05-05)
- [x] Reject root cause analysis & schema fixes for v1 (Riley, 2026-05-12)
- [x] Loan tape v2 ingested — 14,512 records, 3 rejects (Riley, 2026-05-19)
- [ ] Property-type mapping patch v2.1.4 deployed to staging (Riley, scheduled 2026-05-27)
- [ ] Reingest v2 with patch — expect 0 rejects (Riley, scheduled 2026-05-27)
- [ ] Statement PDF design proof signed off (Marcus, scheduled 2026-05-25)
- [ ] Borrower 15-day transfer notice mailed by Fidelity (Diane, scheduled 2026-05-30)
- [ ] Parallel-run trial: 3 business days of mirrored payments (Riley / Marcus, scheduled 2026-06-10)
- [ ] MERS final beneficiary update file generated (Lin, scheduled 2026-06-15)
- [ ] Day-of contact tree confirmed and posted (Jamie, scheduled 2026-06-18)
- [ ] War room staffing & shift schedule signed off (Jamie + Diane, scheduled 2026-06-19)
- [ ] Final go / no-go meeting (all hands, scheduled 2026-06-21)
- [ ] Post-cutover hyper-care begins (Jamie, scheduled 2026-06-23)

---

## Day-of cutover sequence (2026-06-22)

| Time ET | Step | Owner | Notes |
|---|---|---|---|
| 00:00 | Fidelity closes Fiserv LoanServ for write ops | Marcus | Read-only kept until 06:00 |
| 00:30 | Final delta loan tape pulled and shipped | Lin | SFTP drop to `fidelity-prod-cutover` |
| 01:00 | Delta loan tape ingested in production | Riley | Expect <30 deltas vs. v2 |
| 02:00 | MERS final beneficiary file submitted | Lin | Confirmation typically within 4h |
| 03:00 | Payment systems pointed at Valon endpoints | Riley | DNS swap; see `integrations.ach` config |
| 04:00 | First live API call from Fidelity member portal | Joint | Jamie pages if no traffic by 04:30 |
| 05:00 | Spot-checks: 50 random loans validated end-to-end | Riley | Use the `cutover-validator` script |
| 06:00 | Cutover window closes — all systems live on Valon | Jamie | Diane notified |
| 06:00–12:00 | Hyper-care: war room staffed for member inquiries | Jamie + Marcus | Hourly check-ins |

---

## Common Fidelity questions

Questions Marcus and Diane have asked more than once. Answer consistently or flag a real change.

1. **"Will the monthly statement look the same?"** — Yes. The `fidelity-cobrand-v1` template set preserves Fidelity's bear-paw logo (refreshed September 2025), navy + gold color palette, and the standard footer block. Required RESPA "Serviced by Valon" line sits below the existing footer in 7pt type.

2. **"Can we keep our member services phone number on borrower-facing documents?"** — Confirmed for monthly statements (`notifications.borrower_statements.contact_phone` = Fidelity number). Open for the 15-day transfer notice — pending Valon legal RESPA review.

3. **"What property types does the boarding script accept?"** — Standard codes: SFR (single-family), MAN (manufactured), CON (condo), PUD (planned-unit development). Fidelity's internal `MFR` code maps to MAN; mapping fix queued for v2.1.4 (2026-05-27).

4. **"What's the escalation path for a member who can't log in on day 1?"** — Fidelity member services handles tier 1; Valon hyper-care line for authn / account-linking issues. Don't route through normal support during hyper-care.

5. **"Can our compliance team see the audit trail for our loans?"** — Yes, exposed via the `fidelity-audit-mirror` daily export. Sample shared 2026-05-08.

---

## Escalation paths

| Issue type | First responder | Escalate to (Valon) | Escalate to (Fidelity) |
|---|---|---|---|
| Boarding ingest failure | Riley Chen | Eng on-call | Lin (if up); else Marcus |
| MERS sync mismatch | Lin / Riley | Jordan Liu (MERS liaison) | Lin |
| Payment processing | ACH ops desk | Payments eng manager | Marcus |
| Member portal downtime | Platform on-call | VP Engineering | Diane (P1 only) |
| Regulatory inquiry | Jamie | Valon legal | Diane |

---

## Known quirks

Fidelity-specific oddities worth remembering.

1. **Property type code `MFR`.** Fidelity's internal extract uses `MFR` for manufactured homes; the standard schema uses `MAN`. Patch v2.1.4 adds `MFR → MAN` to the property_type mapping table. See WARN block 2026-05-19 in `integration_log.txt`.

2. **Friday-light ACH volume.** Fidelity members pay mostly via auto-debit on the 1st and 15th; Friday ACH batches are roughly half the size of Monday batches. Don't be surprised by the dip — it's the membership pattern, not a system issue.

3. **September 2025 brand refresh.** Fidelity rebranded September 2025 — the bear-paw logo and navy + gold palette are the current standard. The asset pack in the shared folder is the source of truth; do NOT pull from the pre-September archive.

4. **Member services phone number continuity.** Diane has been clear that members associate Fidelity's member services number with all loan inquiries, including transfers. Default to leaving the Fidelity number on customer-facing comms unless RESPA forces otherwise.
