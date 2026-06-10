# Valon Takehome 

A slide editor — built to be driven by both human users and AI agents.

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

Open **[http://localhost:3000](http://localhost:3000)**. That's it. Ensure port 3000 is free.

---

### Using it from Claude Code

The repo doubles as a Claude Code plugin (`valon-slides`), which adds
the `/weekly-deck` and `/deck-status` slash commands. The plugin is a separate
install from the app — it lives in your Claude Code, not in this repo, so `npm
run dev` alone does **not** add the commands. You need both: the app running and
the plugin installed.

**Install the plugin** — inside Claude Code CLI, run:

```
/plugin marketplace add nitinm21/valon_takehome
/plugin install valon-slides@valon-slides
```

(Already cloned the repo? You can point the marketplace at the local path instead:
`/plugin marketplace add /absolute/path/to/valon_takehome`. Or just run `/plugin`
for the interactive menu.)

**Use it** — with `npm run dev` running, run:

```
/weekly-deck cascade-fcu
```

The agent reads the customer bundle, finds last week's deck for continuity,
authors this week's review with per-slide citations, and replies with the
editor link. Then iterate conversationally. The commands
talk to the app at `http://localhost:3000` (override with `$VALON_SLIDES_URL`),
and will tell you to start the app first if it isn't running.

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
- **Port 3000 is in use:** The app will run on another port, but try to ensure port 3000 is free. It's 
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




