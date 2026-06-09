# Valon Takehome 

An AI-native slide editor. 

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
- **Decks disappeared:** Deck state is stored in your browser's local storage,
  so it's per-browser and cleared when you clear site data. There is no database.

---

## How it works

- **Deck library** (`/`) — browse, open, or create decks.
- **Create flow** (`/create`) — describe or paste content → review an editable
  outline → stream a full deck into the editor.
- **Editor** (`/editor/[deckId]`) — a slide canvas with text, shapes, images,
  themes, AI image generation, AI whole-slide generation, and per-slide AI edits.
- **Export** — download the current deck as a `.pptx` file.


