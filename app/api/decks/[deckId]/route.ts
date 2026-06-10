import { NextResponse } from "next/server";

import { authorSlide } from "../../../lib/server/authorDeck";
import {
  deleteDeck,
  listDecks,
  readDeck,
  writeDeck
} from "../../../lib/server/deckRepo";
import { applyThemeToDeck } from "../../../lib/applyTheme";
import { deriveTheme, type ThemeSummary } from "../../../lib/theme";
import { getTheme, THEMES } from "../../../lib/themes";
import type { Deck, Slide, SlideElement } from "../../../lib/types";

// Single-deck API.
//
// GET    -> the full deck JSON
// PUT    -> replace the whole deck (the browser editor's auto-save)
// PATCH  -> semantic operations (the agent refine loop):
//   { "ops": [
//     { "op": "setTitle", "title": "..." },
//     { "op": "replaceSlide", "slideNumber": 3, "slide": {template, slots, citations?, notes?} },
//     { "op": "insertSlide", "slide": {...}, "at": 4 },          // at: 1-based, default: end
//     { "op": "removeSlide", "slideNumber": 2 },
//     { "op": "moveSlide", "from": 5, "to": 2 },
//     { "op": "setNotes", "slideNumber": 3, "notes": "..." },
//     { "op": "setCitations", "slideNumber": 3, "citations": [...] },
//     { "op": "patchElement", "slideNumber": 3, "elementId": "...", "patch": {...} }  // raw escape hatch
//   ]}
// slideNumber is 1-BASED — the number shown in the editor's slide rail, matching
// how a strategist talks about the deck ("refine slide 3").
// Ops are transactional: every op is validated against the evolving deck first;
// if any fails, nothing is written and all problems are reported at once.

type Params = { params: Promise<{ deckId: string }> };

async function notFound(deckId: string) {
  const decks = await listDecks();
  const known = decks.slice(0, 10).map((deck) => `${deck.id} ("${deck.title}")`);
  return NextResponse.json(
    {
      error: `No deck with id "${deckId}".${known.length ? ` Known decks: ${known.join(", ")}.` : " There are no decks yet — POST /api/decks to create one."}`
    },
    { status: 404 }
  );
}

export async function GET(_request: Request, { params }: Params) {
  const { deckId } = await params;
  const deck = await readDeck(deckId);
  if (!deck) {
    return notFound(deckId);
  }
  return NextResponse.json({ deck });
}

export async function PUT(request: Request, { params }: Params) {
  const { deckId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const incoming = ((body as { deck?: unknown })?.deck ?? body) as Deck;
  if (!incoming || typeof incoming.title !== "string" || !Array.isArray(incoming.slides)) {
    return NextResponse.json(
      { error: "PUT expects a full deck object ({ deck } or the deck itself)." },
      { status: 400 }
    );
  }
  const saved = await writeDeck({ ...incoming, id: deckId });
  return NextResponse.json({ deck: saved });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { deckId } = await params;
  const removed = await deleteDeck(deckId);
  if (!removed) {
    return notFound(deckId);
  }
  return NextResponse.json({ ok: true });
}

// ---- PATCH (semantic ops) -----------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// The theme new/replacement slides are built with: the deck's curated theme if it
// has one, otherwise a theme derived from the deck itself so patches blend in.
function themeFor(deck: Deck): ThemeSummary {
  return deck.themeId ? getTheme(deck.themeId).summary : deriveTheme(deck);
}

function slideAt(
  deck: Deck,
  raw: unknown,
  path: string,
  errors: string[]
): number {
  const n = typeof raw === "number" ? raw : NaN;
  if (!Number.isInteger(n) || n < 1 || n > deck.slides.length) {
    errors.push(
      `${path} must be a 1-based slide number between 1 and ${deck.slides.length} (the deck currently has ${deck.slides.length} slides).`
    );
    return -1;
  }
  return n - 1;
}

export async function PATCH(request: Request, { params }: Params) {
  const { deckId } = await params;
  const deck = await readDeck(deckId);
  if (!deck) {
    return notFound(deckId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const ops = (body as { ops?: unknown })?.ops;
  if (!Array.isArray(ops) || ops.length === 0) {
    return NextResponse.json(
      {
        error:
          'PATCH expects { "ops": [...] }. Supported ops: setTitle, replaceSlide, insertSlide, removeSlide, moveSlide, setNotes, setCitations, patchElement. slideNumber is 1-based (as shown in the editor rail).'
      },
      { status: 400 }
    );
  }

  const errors: string[] = [];
  // Work on a copy; only persist if every op validates.
  const working: Deck = JSON.parse(JSON.stringify(deck)) as Deck;
  const theme = themeFor(working);

  ops.forEach((rawOp, index) => {
    const path = `ops[${index}]`;
    if (!isRecord(rawOp) || typeof rawOp.op !== "string") {
      errors.push(`${path} must be an object with an "op" field.`);
      return;
    }
    switch (rawOp.op) {
      case "setTitle": {
        if (typeof rawOp.title !== "string" || !rawOp.title.trim()) {
          errors.push(`${path}.title must be a non-empty string.`);
          return;
        }
        working.title = rawOp.title.trim();
        return;
      }
      case "setTheme": {
        // Restyle the whole deck to a curated theme — the agent-facing twin of
        // the editor's theme selector. Backgrounds, text colors/fonts, and
        // data-viz colors are rewritten in place; geometry and content are kept.
        const themeId = typeof rawOp.themeId === "string" ? rawOp.themeId.trim() : "";
        if (!THEMES.some((t) => t.id === themeId)) {
          errors.push(
            `${path}.themeId must be one of: ${THEMES.map((t) => t.id).join(", ")}.`
          );
          return;
        }
        const restyled = applyThemeToDeck(working, themeId);
        working.themeId = restyled.themeId;
        working.slides = restyled.slides;
        return;
      }
      case "replaceSlide": {
        const at = slideAt(working, rawOp.slideNumber, `${path}.slideNumber`, errors);
        if (at < 0) {
          return;
        }
        const result = authorSlide(rawOp.slide, theme, `${path}.slide`);
        if (!result.ok) {
          errors.push(...result.errors);
          return;
        }
        // Keep the slide's identity so the editor's selection/rail stay stable.
        const replaced: Slide = { ...result.slide, id: working.slides[at].id };
        working.slides[at] = replaced;
        return;
      }
      case "insertSlide": {
        const result = authorSlide(rawOp.slide, theme, `${path}.slide`);
        if (!result.ok) {
          errors.push(...result.errors);
          return;
        }
        let at = working.slides.length; // default: append
        if (rawOp.at !== undefined) {
          const n = typeof rawOp.at === "number" ? rawOp.at : NaN;
          if (!Number.isInteger(n) || n < 1 || n > working.slides.length + 1) {
            errors.push(
              `${path}.at must be a 1-based position between 1 and ${working.slides.length + 1}.`
            );
            return;
          }
          at = n - 1;
        }
        working.slides.splice(at, 0, result.slide);
        return;
      }
      case "removeSlide": {
        const at = slideAt(working, rawOp.slideNumber, `${path}.slideNumber`, errors);
        if (at < 0) {
          return;
        }
        if (working.slides.length === 1) {
          errors.push(`${path}: cannot remove the only slide in the deck.`);
          return;
        }
        working.slides.splice(at, 1);
        return;
      }
      case "moveSlide": {
        const from = slideAt(working, rawOp.from, `${path}.from`, errors);
        const to = slideAt(working, rawOp.to, `${path}.to`, errors);
        if (from < 0 || to < 0) {
          return;
        }
        const [moved] = working.slides.splice(from, 1);
        working.slides.splice(to, 0, moved);
        return;
      }
      case "setNotes": {
        const at = slideAt(working, rawOp.slideNumber, `${path}.slideNumber`, errors);
        if (at < 0) {
          return;
        }
        if (typeof rawOp.notes !== "string") {
          errors.push(`${path}.notes must be a string.`);
          return;
        }
        working.slides[at].notes = rawOp.notes.trim() || undefined;
        return;
      }
      case "setCitations": {
        const at = slideAt(working, rawOp.slideNumber, `${path}.slideNumber`, errors);
        if (at < 0) {
          return;
        }
        if (
          !Array.isArray(rawOp.citations) ||
          !rawOp.citations.every(
            (c) => isRecord(c) && typeof c.artifact === "string" && c.artifact.trim()
          )
        ) {
          errors.push(
            `${path}.citations must be an array of { artifact, lines?, quote?, note? } with a non-empty "artifact".`
          );
          return;
        }
        working.slides[at].citations = rawOp.citations as Slide["citations"];
        return;
      }
      case "patchElement": {
        // Raw escape hatch: shallow-merge a patch onto one element (move/resize/
        // recolor/text tweaks). Semantic replaceSlide is the preferred altitude.
        const at = slideAt(working, rawOp.slideNumber, `${path}.slideNumber`, errors);
        if (at < 0) {
          return;
        }
        const slide = working.slides[at];
        const elementId = rawOp.elementId;
        const target = slide.elements.find((el) => el.id === elementId);
        if (!target) {
          const ids = slide.elements.map((el) => `${el.id} (${el.type})`).join(", ");
          errors.push(
            `${path}.elementId "${String(elementId)}" not found on slide ${at + 1}. Elements there: ${ids || "none"}.`
          );
          return;
        }
        if (!isRecord(rawOp.patch)) {
          errors.push(
            `${path}.patch must be an object of element fields to merge (e.g. { "x": 100, "y": 200, "w": 400 }).`
          );
          return;
        }
        const { id: _id, type: _type, ...patch } = rawOp.patch as Record<string, unknown>;
        slide.elements = slide.elements.map((el) =>
          el.id === elementId ? ({ ...el, ...patch } as SlideElement) : el
        );
        return;
      }
      default:
        errors.push(
          `${path}.op "${rawOp.op}" is not supported. Supported: setTitle, replaceSlide, insertSlide, removeSlide, moveSlide, setNotes, setCitations, patchElement.`
        );
    }
  });

  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: `Patch rejected — ${errors.length} problem(s); nothing was changed.`,
        errors
      },
      { status: 400 }
    );
  }

  // Selection must always point at a real slide after structural ops.
  if (!working.slides.some((slide) => slide.id === working.selectedSlideId)) {
    working.selectedSlideId = working.slides[0].id;
  }

  const saved = await writeDeck(working);
  return NextResponse.json({ deck: saved });
}
