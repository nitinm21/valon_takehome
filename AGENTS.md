# Agent guide — Valon Slides

This app is designed to be driven by AI agents, not just clicked. Everything a
human can build in the editor, an agent can build through the HTTP API — and the
result shows up live in the human's library/editor (the editor polls for outside
changes every few seconds).

- Base URL: `http://localhost:3000` (override with `VALON_SLIDES_URL` if the dev
  server runs elsewhere). Start it with `npm run dev`.
- Decks persist server-side in `data/decks/*.json`.
- A deck opens at `/editor/<id>`, presents fullscreen via the ▶ button, and
  exports to `.pptx`.

The packaged workflow for Valon deployment strategists is the `/weekly-deck`
Claude Code command (see `plugin/`), but the API below is agent-agnostic.

## The one rule: author semantically

You provide **content**; the server owns **layout**. Pick a template, fill its
slots, and `buildSlide()` deterministically positions everything inside the
1280×720 artboard with theme-correct colors/fonts and WCAG-checked contrast.
Never compute coordinates yourself (a raw escape hatch exists, but semantic
authoring is the intended altitude).

## Create a deck

`POST /api/decks`

```json
{
  "title": "Cascade FCU — Weekly Deployment Review (Week of Jun 7)",
  "themeId": "deployment-review",
  "customer": "cascade-fcu",
  "slides": [
    {
      "template": "cover",
      "slots": {
        "title": { "text": "Cascade FCU — Weekly Deployment Review" },
        "subtitle": { "text": "Week 9 of 12 · Week ending June 7, 2026" }
      },
      "notes": "Open with the rehearsal win; Maya's board is rollback-scarred.",
      "citations": [
        { "artifact": "customer_brief.md", "lines": "14", "note": "deployment phase" }
      ]
    },
    {
      "template": "kpis",
      "slots": {
        "title": { "text": "The week in numbers" },
        "kpi1": { "kpi": { "label": "ACH success rate", "value": "99.97%", "delta": "+0.01pt WoW", "trend": "up", "good": true } },
        "kpi2": { "kpi": { "label": "Boarding rejects", "value": "0", "delta": "5 runs to clean", "trend": "down", "good": true } },
        "kpi3": { "kpi": { "label": "Support tickets", "value": "13", "delta": "-3 WoW", "trend": "down", "good": true } },
        "context": { "text": "Ingest validation closed out with a clean run 5; ticket volume is back to baseline." }
      },
      "citations": [
        { "artifact": "weekly_metrics.csv", "lines": "7", "quote": "2026-06-07,9,1193,13,14,288,99.97,0,3,68" }
      ]
    },
    {
      "template": "chart",
      "slots": {
        "title": { "text": "Boarding rejects: five runs to zero" },
        "chart": { "chart": {
          "chartType": "bar",
          "labels": ["Run 2", "Run 3", "Run 4", "Run 5"],
          "series": [{ "name": "Rejects", "values": [35, 12, 3, 0] }],
          "yLabel": "rejected records"
        } },
        "body": { "text": "The escrow date parser fix landed after run 3 and removed the largest reject class. Run 5 was clean — ingest validation is complete." }
      }
    },
    {
      "template": "table",
      "slots": {
        "title": { "text": "Milestones" },
        "table": { "table": {
          "columns": ["Milestone", "Target", "Status"],
          "rows": [
            ["Ingest validation", "May 30", "✅ Complete"],
            ["Cutover rehearsal 2", "Jun 17", "⏳ Scheduled"]
          ]
        } }
      }
    }
  ]
}
```

Response: `201` with `{ id, url, slideCount, deck }` → tell the user to open
`http://localhost:3000/editor/<id>`.

On validation failure you get `400` with `errors: string[]` — every problem at
once, with paths and allowed values. Fix and retry once.

### Templates and their slots

| template | slots |
|---|---|
| `cover` | `title` {text}, `subtitle` {text} — slide 1 only |
| `bullets` | `title` {text}, `body` {text — points separated by `\n`, no bullet chars} |
| `paragraph` | `title` {text}, `body` {text — 1–2 short paragraphs} |
| `boxes` | `title` {text}, `box1..box3` {heading, text} |
| `two-col-image` | `title` {text}, `body` {text}, `image` {prompt — picture description, no words/UI} |
| `kpis` | `title` {text}, `kpi1..kpi4` {kpi: {label, value, delta?, trend?: up\|down\|flat, good?: bool}}, `context` {text} — 1–4 KPIs auto-fill the row |
| `chart` | `title` {text}, `chart` {chart: {chartType: bar\|line, labels[], series[{name?, values[]}], yLabel?}}, `body` {text — the takeaway} |
| `table` | `title` {text}, `table` {table: {columns[] ≤6, rows[][] ≤10}}, `note` {text} |

Data-viz rules: `values` must be numbers matching `labels` one-to-one, ≤4
series, ≤12 labels. `good` on a KPI means "this trend is favorable" (green);
`false` renders red. Numbers belong in `kpis`/`chart`/`table` — only put a
number in prose when it has a citation.

### Themes

`deployment-review` (default for client reviews), `executive-update`,
`all-hands`, `kickoff`, `product-demo`, `data-report`, `team-spotlight`,
`announcement`.

### Citations & notes (provenance)

Each slide accepts `citations: [{ artifact, lines?, quote?, note? }]` and
`notes` (speaker notes). The editor surfaces them in a "Sources" panel — this is
how a strategist trusts the numbers without re-deriving them. **Cite every
quantitative claim** to a real file/lines in the customer bundle. A claim you
cannot cite goes into `notes` as an open question, or gets dropped — never on
the slide as fact.

## Read / list

- `GET /api/decks` → metas `{ id, title, slideCount, customer, themeId, createdAt, updatedAt }`
- `GET /api/decks?include=first` → metas + first slide each
- `GET /api/decks/{id}` → the full deck

To find "last week's deck" for a customer: list, filter by `customer`, take the
newest `createdAt` before today.

## Edit (the refine loop)

`PATCH /api/decks/{id}` with `{ "ops": [...] }`. `slideNumber` is **1-based**,
matching the editor's slide rail (how the strategist talks: "refine slide 3").
Ops are transactional — any error rejects the whole batch with nothing changed.

```json
{ "ops": [
  { "op": "setTitle", "title": "..." },
  { "op": "replaceSlide", "slideNumber": 3, "slide": { "template": "...", "slots": {}, "citations": [], "notes": "" } },
  { "op": "insertSlide", "at": 4, "slide": { } },
  { "op": "removeSlide", "slideNumber": 2 },
  { "op": "moveSlide", "from": 5, "to": 2 },
  { "op": "setNotes", "slideNumber": 3, "notes": "..." },
  { "op": "setCitations", "slideNumber": 3, "citations": [] },
  { "op": "patchElement", "slideNumber": 3, "elementId": "...", "patch": { "x": 100 } }
]}
```

`replaceSlide` keeps the slide's identity (selection/rail stay stable) and
rebuilds content with the deck's theme. `patchElement` is the raw escape hatch
for geometry nudges; prefer `replaceSlide`.

Also: `PUT /api/decks/{id}` replaces a whole deck (raw), `DELETE /api/decks/{id}`
deletes, `POST /api/decks` with `{ "deck": {...} }` creates from a raw deck
object.

## Customer bundles (grounding data)

`samples/customers/<customer-id>/` holds the deployment artifacts a weekly
review is grounded in:

| file | what it gives you |
|---|---|
| `customer_brief.md` | stakeholders, contract, success milestones, risk register |
| `weekly_metrics.csv` | week-over-week KPIs (the spine of a weekly deck) |
| `milestones.md` | milestone tracker with status + watch items |
| `integration_log.txt` | timestamped production/staging events, incidents |
| `tenant_config.yaml` | runtime configuration |
| `usage_telemetry.csv` | daily member-facing usage |
| `runbook.md` | internal ops procedures |

Cite by file + line numbers (e.g. `weekly_metrics.csv:7`).
