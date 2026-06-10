# Valon Takehome 

An AI-native slide editor — built to be driven by **AI agents**, not just clicks.

The headline workflow: a Valon deployment strategist runs `/weekly-deck cascade-fcu`
in Claude Code, and the agent mines that customer's deployment artifacts
(`samples/customers/`), authors a citation-grounded weekly client review —
KPI cards, real charts, milestone tables — and the deck appears in the library
ready to present. Feedback like *"refine slide 3: lead with the escrow milestone"*
patches the deck through the API and shows up live in the open editor.

- **Agent API & deck schema:** see [`AGENTS.md`](AGENTS.md)
- **Claude Code plugin** (`/weekly-deck`, `/deck-status`): see [`plugin/`](plugin/)
- **Sample customer bundles** (the grounding data): [`samples/customers/`](samples/customers/)

---

## Quick start

> **Prerequisites:** [Node.js 20+](https://nodejs.org) (LTS recommended) and npm.
> Check with `node -v`.

**1. Install dependencies**

```bash
npm install
```

**2. Create your local env file from the template**

```bash
cp .env.example .env.local
```

**3. Add your Google AI API key**

This app uses Google's Gemini models. Create a free key here:

**[Create a key at Google AI Studio → aistudio.google.com/apikey](https://aistudio.google.com/apikey)**

Open `.env.local` and paste it in:

```bash
GOOGLE_API_KEY=paste_your_key_here
```

**4. Start the app**

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. That's it.

---

## Environment variables

`.env.local` is git-ignored, so your key stays out of version control.

| Variable             | Required | Default                         | Purpose                                              |
| -------------------- | -------- | ------------------------------- | ---------------------------------------------------- |
| `GOOGLE_API_KEY`     | **Yes**  | —                               | Authenticates all Gemini requests.                   |
| `GOOGLE_IMAGE_MODEL` | No       | `gemini-3-pro-image-preview`    | Model used for slide image generation.               |
| `GOOGLE_SLIDE_MODEL` | No       | `gemini-2.5-flash`              | Model used for outline / slide text generation.      |

The API key is read only in server-side API routes (`app/api/*`) and is never
exposed to the browser.

---

## Scripts

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Start the local dev server on port 3000.      |
| `npm run build`    | Production build.                             |
| `npm start`        | Serve the production build.                    |
| `npm run typecheck`| Type-check with `tsc` (no emit).              |

---

## Troubleshooting

- **Generation fails / 401 / "missing API key":** Make sure `GOOGLE_API_KEY` is
  set in `.env.local` and that you restarted `npm run dev` after editing it.
- **Port 3000 is in use:** Run on another port with `npm run dev -- -p 3001`.
- **Stale build errors:** Delete the `.next` folder and run `npm run dev` again.
- **Where are decks stored?** Server-side, as JSON files in `data/decks/`
  (git-ignored). That's what lets agents and the browser share one source of
  truth. Decks from older versions of the app (browser localStorage) migrate to
  the server automatically the first time the library loads.

---

## How it works

- **Deck library** (`/`) — browse, open, or create decks (agent-created decks
  appear here too).
- **Create flow** (`/create`) — describe or paste content → review an editable
  outline → pick a theme → stream a full deck into the editor.
- **Editor** (`/editor/[deckId]`) — a slide canvas with text, shapes, images,
  data-viz (KPI cards, charts, tables), themes, AI image generation, AI
  whole-slide generation, and per-slide AI edits. The editor live-syncs deck
  changes made through the API, and a **Sources** panel shows which customer
  artifacts back each agent-authored slide.
- **Deck API** (`/api/decks`) — agents create decks semantically (template +
  content slots; the server owns layout) and refine them with transactional
  patch ops. Full reference in [`AGENTS.md`](AGENTS.md).
- **Export** — download the current deck as a `.pptx` file.

### Using it from Claude Code

From this repo (with `npm run dev` running), install the plugin and run:

```
/weekly-deck cascade-fcu
```

The agent reads the customer bundle, finds last week's deck for continuity,
authors this week's review with per-slide citations, and replies with the
editor link. Then iterate conversationally: `refine slide 3: ...`.


