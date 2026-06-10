import { NextResponse } from "next/server";

import { authorDeck } from "../../lib/server/authorDeck";
import { isValidDeckId, listDecks, writeDeck } from "../../lib/server/deckRepo";
import type { Deck } from "../../lib/types";

// Deck collection API — the boundary agents and the browser share.
//
// GET  /api/decks                 -> deck metas (newest first)
// GET  /api/decks?include=first   -> metas + each deck's first slide (thumbnails)
// POST /api/decks                 -> create a deck, two altitudes:
//   semantic (agents): { title, themeId?, customer?, slides: [{template, slots,
//     citations?, notes?}] } — content only; layout/colors are applied by the
//     server's deterministic slide builder.
//   raw (browser/escape hatch): { deck: Deck } — a full prebuilt deck object.
// Errors come back as { error, errors: string[] } with messages written for an
// LLM reader (path + expectation + allowed values), so an agent can self-correct
// in one retry.

export async function GET(request: Request) {
  const includeFirst = new URL(request.url).searchParams.get("include") === "first";
  const decks = await listDecks();
  return NextResponse.json({
    decks: decks.map((deck) => ({
      id: deck.id,
      title: deck.title,
      slideCount: deck.slides.length,
      customer: deck.customer,
      themeId: deck.themeId,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      ...(includeFirst ? { firstSlide: deck.slides[0] ?? null } : {})
    }))
  });
}

function isRawDeck(value: unknown): value is Deck {
  if (!value || typeof value !== "object") {
    return false;
  }
  const deck = value as Deck;
  return (
    typeof deck.title === "string" &&
    Array.isArray(deck.slides) &&
    deck.slides.every((slide) => slide && Array.isArray(slide.elements))
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON." },
      { status: 400 }
    );
  }

  // Raw mode: the browser persistence layer (and power users) send full decks.
  const rawDeck = (body as { deck?: unknown })?.deck;
  if (rawDeck !== undefined) {
    if (!isRawDeck(rawDeck)) {
      return NextResponse.json(
        {
          error:
            '"deck" must be a full deck object: { id?, title, slides: [{ id, background, elements: [...] }], selectedSlideId? }. For semantic authoring, omit "deck" and send { title, themeId?, slides: [{ template, slots }] } instead.'
        },
        { status: 400 }
      );
    }
    const deck: Deck = {
      ...rawDeck,
      id: isValidDeckId(rawDeck.id) ? rawDeck.id : crypto.randomUUID(),
      selectedSlideId: rawDeck.selectedSlideId ?? rawDeck.slides[0]?.id ?? ""
    };
    const saved = await writeDeck(deck);
    return NextResponse.json(
      { id: saved.id, url: `/editor/${saved.id}`, deck: saved },
      { status: 201 }
    );
  }

  // Semantic mode: validate + build (geometry, theme colors) server-side.
  const result = authorDeck(body);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: `Deck not created — ${result.errors.length} problem(s) to fix.`,
        errors: result.errors
      },
      { status: 400 }
    );
  }
  const saved = await writeDeck(result.deck);
  return NextResponse.json(
    {
      id: saved.id,
      url: `/editor/${saved.id}`,
      slideCount: saved.slides.length,
      deck: saved
    },
    { status: 201 }
  );
}
