# Valon Takehome 

A slide editor — built to be driven by both human users and AI agents.

- **Agent API & deck schema:** see [`AGENTS.md`](AGENTS.md)
- **Claude Code plugin** (`/weekly-deck`, `/deck-status`): see [`plugin/`](plugin/)
- **Sample customer bundles** (the grounding data): [`samples/customers/`](samples/customers/)

---

## Quick start

> **Prerequisites:** [Node.js 20+](https://nodejs.org)
> (LTS recommended). Check with `node -v`.

**1. Clone the repo**

```bash
git clone https://github.com/nitinm21/valon_takehome.git
cd valon_takehome
```

Run the remaining steps from inside this folder.

**2. Install dependencies**

```bash
npm install
```

**3. Create your local env file from the template**

```bash
cp .env.example .env.local
```

**4. Add your Google AI API key**

This app uses Google's Gemini models. Create a free key here:

**[Create a key at Google AI Studio → aistudio.google.com/apikey](https://aistudio.google.com/apikey)**

Open `.env.local` and paste it in:

```bash
GOOGLE_API_KEY=paste_your_key_here
```

**5. Start the app**

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. That's it. Ensure port 3000 is free.

---
### Install the Claude Code plugin

**1. Open a new terminal tab and launch Claude Code from the repo root** (`claude`), then install the plugin.

```
/plugin marketplace add nitinm21/valon_takehome
/plugin install valon-slides@valon-slides
```

**2. Build a deck**:

```
/weekly-deck cascade-fcu
```
> The slash command needs to be typed in, so it reads like "/valon-slides:weekly-deck" in your terminal. Do not copy.

The agent reads the customer bundle, finds last week's deck for continuity,
authors this week's review with per-slide citations, and replies with the editor
link. Then iterate conversationally. The commands talk to the app at
`http://localhost:3000` (override with `$VALON_SLIDES_URL`) and will tell you to
start the app first if it isn't running.

---

## Scripts

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Start the local dev server on port 3000.      |
| `npm run build`    | Production build.                             |
| `npm start`        | Serve the production build.                    |
| `npm run typecheck`| Type-check with `tsc` (no emit).              |

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




