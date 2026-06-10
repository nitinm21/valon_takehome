---
description: Build this week's client deployment-review deck for a customer, grounded in their artifact bundle, with citations. Then refine it conversationally.
argument-hint: "[customer-id]"
---

You are building a **weekly client deployment review deck** for a Valon
deployment strategist. The strategist presents this to the customer; your job is
the analytical digging they should not have to do — mine the customer's
deployment artifacts for the week's story and author a clear, data-driven deck
they only need to review.

## Step 1 — Preflight

1. Resolve the app:
   - Base URL: `$VALON_SLIDES_URL` if set, else `http://localhost:3000`.
   - App root: the current directory if it contains `samples/customers/`;
     otherwise ask the user for the path to the Valon Slides repo.
2. `curl -s <base>/api/decks` via Bash. If it fails or returns HTML, stop and
   tell the user to start the app first:

   ```
   The Valon Slides app isn't running. From the app repo:

       npm run dev

   Then re-run /weekly-deck.
   ```

## Step 2 — Resolve the customer

- If `$ARGUMENTS` names a directory under `samples/customers/`, use it.
- Otherwise list `samples/customers/` and use AskUserQuestion (header:
  "Customer") to pick one.

## Step 3 — Read the bundle (note line numbers — you will cite them)

Read, in this order:

1. `weekly_metrics.csv` — the spine of the deck. The LAST row is "this week";
   the row before is "last week". Compute week-over-week deltas yourself.
2. `milestones.md` — current milestone status + the "watch items" section.
3. `customer_brief.md` — stakeholders, success milestones from the SOW, the
   risk register (what this customer is sensitive to — let it shape tone).
4. `integration_log.txt` — scan for incidents/events relevant to the period.
5. `tenant_config.yaml`, `usage_telemetry.csv`, `runbook.md` — only as needed
   to back specific claims.

Record exact line numbers for every figure you plan to use.

## Step 4 — Find last week's deck (continuity)

`GET <base>/api/decks` → filter for `"customer": "<customer-id>"`, take the most
recent. If one exists, `GET <base>/api/decks/<id>` and read its slides'
`source.slots` and `notes`:

- What was promised as "next week" last time → report on it this week.
- What was flagged as a risk → say whether it materialized or closed.

No prior deck → this is the first weekly review; say so on the cover subtitle.

## Step 5 — Synthesize the week's narrative

Decide the story BEFORE picking slides. A good weekly review answers, in order:
**Are we on track? What moved? What worries us? What do we need from you?**

Hard rules:

- **Every number on a slide must come from a bundle file** and carry a citation
  (`artifact` + `lines`, ideally a short `quote`). A claim you cannot cite goes
  into the slide's `notes` as an open question — or nowhere. Never fabricate,
  extrapolate, or "round into" a number that isn't in the data.
- Numbers belong in KPI/chart/table elements, not prose.
- Missing data is missing: if a metric column is empty for this customer (e.g.
  no NPS yet), don't show that KPI.
- Match tone to the risk register (e.g. a rollback-scarred customer gets
  proactive over-communication of integrity metrics, not just wins).

## Step 6 — Author the deck

`POST <base>/api/decks` with semantic slides (full API reference: `AGENTS.md`
in the app repo). Recommended skeleton — adapt to what the data supports:

1. `cover` — "<Customer> — Weekly Deployment Review", subtitle with deployment
   week and week-ending date.
2. `kpis` — 3–4 headline metrics from the latest `weekly_metrics.csv` row, with
   WoW deltas (`delta`, `trend`, `good`) and a one-line `context` takeaway.
3. `chart` — the week's most meaningful trend (`bar` or `line`) with the
   takeaway in `body`. Use real series from the CSV; ≤12 labels.
4. `table` — milestone tracker: Milestone / Target / Status (≤10 rows; keep the
   status glyphs ✅ 🟢 🟡 🔴 ⏳ from `milestones.md`).
5. `bullets` or `boxes` — risks & watch items (sourced, not invented).
6. `bullets` — next week: what happens, plus asks of the customer.

Always include per-slide `citations` and presenter `notes` (the notes are where
nuance lives — the slide stays clean, the strategist stays informed).

Set `"themeId": "deployment-review"` and `"customer": "<customer-id>"`. Title:
`"<Customer> — Weekly Deployment Review (Week of <Mon DD>)"`.

If the API returns `400`, the `errors` array tells you exactly what to fix —
correct the payload and retry (at most twice; then show the user the errors).

## Step 7 — Report back

Print, concisely:

```
Deck ready: <base>/editor/<id>   (<n> slides)

The week in one breath: <2-3 sentences — the narrative you chose and why>

Review it in the editor (it live-updates), then:
  - "refine slide 3: lead with the escrow milestone"
  - "add a slide comparing ticket volume to last month"
  - "remove slide 5"
Present with ▶ in the editor; export .pptx from the topbar.
```

## Step 8 — The refine loop

When the user gives feedback ("refine slide N ...", "swap the chart for
tickets", "tone down slide 4"):

1. `GET <base>/api/decks/<id>` for current state.
2. Re-read whichever bundle files the change needs — refined content follows the
   same citation rules as authored content.
3. `PATCH <base>/api/decks/<id>` with the smallest op that does the job —
   usually one `replaceSlide` (it keeps the slide's identity; the open editor
   picks the change up within seconds). `slideNumber` is 1-based, exactly as the
   user counts slides in the rail.
4. Confirm in one line what changed and on which slide.

Stay in this loop until the user is done.
