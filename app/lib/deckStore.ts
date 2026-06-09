"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getAllImages, pruneImages } from "./imageStore";
import { DEFAULT_RUN_STYLE, runsText } from "./richText";
import { NEW_TEXT_DEFAULT, SEED_DECK_ID, useEditor } from "./store";
import type { Deck, SlideElement, TextElement, TextRun } from "./types";

// Multi-deck persistence layer ("deck library").
//
// Each deck is stored under its own localStorage key (`valon-deck-<id>`, text +
// geometry only — image blobs stay in IndexedDB, keyed by element id and shared
// across decks). A lightweight index (`valon-deck-index-v1`) lists the decks for
// the home screen without parsing every deck. The editor loads ONE deck by id
// (from the URL) and a global subscription saves whichever deck is open.

const INDEX_KEY = "valon-deck-index-v1";
const DECK_PREFIX = "valon-deck-";
const LEGACY_KEY = "valon-slides-deck-v1"; // single-deck storage (pre-library)
const MIGRATED_LEGACY_TITLE = "Violin Slide Deck 1";

export type DeckMeta = {
  id: string;
  title: string;
  slideCount: number;
  createdAt: number;
  updatedAt: number;
};

// ---- deck (de)serialization (moved from store.ts) -------------------------

// Legacy text boxes (pre-rich-text decks) stored a single `text` string plus
// element-level fontSize/color/bold. Convert any of those to a single run.
type LegacyText = {
  id: string;
  type: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  z?: number;
  align?: TextElement["align"];
  runs?: TextRun[];
  text?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
};

function normalizeTextElement(element: SlideElement): SlideElement {
  if (element.type !== "text") {
    return element;
  }
  const legacy = element as unknown as LegacyText;
  if (Array.isArray(legacy.runs)) {
    return element;
  }
  return {
    id: legacy.id,
    type: "text",
    x: legacy.x,
    y: legacy.y,
    w: legacy.w,
    h: legacy.h,
    rotation: legacy.rotation ?? 0,
    z: legacy.z ?? 1,
    align: legacy.align ?? "left",
    runs: [
      {
        text: typeof legacy.text === "string" ? legacy.text : "",
        fontSize:
          typeof legacy.fontSize === "number"
            ? legacy.fontSize
            : DEFAULT_RUN_STYLE.fontSize,
        color:
          typeof legacy.color === "string" ? legacy.color : DEFAULT_RUN_STYLE.color,
        bold: Boolean(legacy.bold),
        italic: Boolean(legacy.italic),
        fontFamily: DEFAULT_RUN_STYLE.fontFamily
      }
    ]
  };
}

// Migrate legacy text boxes to runs, then drop placeholder/empty text boxes.
export function sanitizeDeck(deck: Deck): Deck {
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map(normalizeTextElement).filter((element) => {
        if (element.type !== "text") {
          return true;
        }
        const text = runsText(element.runs).trim();
        return text !== "" && text !== NEW_TEXT_DEFAULT;
      })
    }))
  };
}

function eachElement(deck: Deck, fn: (el: SlideElement) => SlideElement): Deck {
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map(fn)
    }))
  };
}

// Image blobs live in IndexedDB, not localStorage — strip before saving.
function stripImageData(deck: Deck): Deck {
  return eachElement(deck, (el) =>
    el.type === "image" ? { ...el, src: undefined } : el
  );
}

// Re-attach image blobs (from IndexedDB) on load; normalize status so nothing is
// stuck "generating" and missing blobs fall back to empty.
function mergeImageData(deck: Deck, images: Record<string, string>): Deck {
  return eachElement(deck, (el) =>
    el.type === "image"
      ? images[el.id]
        ? { ...el, src: images[el.id], status: "done" }
        : { ...el, src: undefined, status: "idle" }
      : el
  );
}

function elementIds(deck: Deck): string[] {
  return deck.slides.flatMap((slide) => slide.elements.map((el) => el.id));
}

// ---- index ----------------------------------------------------------------

function readIndex(): DeckMeta[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as DeckMeta[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(metas: DeckMeta[]): void {
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(metas));
  } catch {
    // Best-effort; ignore quota/availability errors.
  }
}

function writeDeckContent(deck: Deck): void {
  try {
    window.localStorage.setItem(
      DECK_PREFIX + deck.id,
      JSON.stringify(stripImageData(deck))
    );
  } catch {
    // Best-effort.
  }
}

// ---- legacy migration ------------------------------------------------------

// On first run of the library, fold the old single saved deck into the library
// as "Violin Slide Deck 1". Writing the index (even empty) marks migration done.
function migrateLegacyIfNeeded(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (window.localStorage.getItem(INDEX_KEY) !== null) {
    return; // already migrated
  }
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const deck = sanitizeDeck(JSON.parse(raw) as Deck);
      if (deck?.slides?.length) {
        const id = crypto.randomUUID();
        const migrated: Deck = {
          ...deck,
          id,
          title: MIGRATED_LEGACY_TITLE,
          selectedSlideId: deck.slides[0].id
        };
        writeDeckContent(migrated);
        const now = Date.now();
        writeIndex([
          {
            id,
            title: MIGRATED_LEGACY_TITLE,
            slideCount: migrated.slides.length,
            createdAt: now,
            updatedAt: now
          }
        ]);
        return;
      }
    }
  } catch {
    // fall through to empty index
  }
  writeIndex([]);
}

// ---- public API ------------------------------------------------------------

/** Decks for the home library, newest first. */
export function listDecks(): DeckMeta[] {
  migrateLegacyIfNeeded();
  return readIndex().slice().sort((a, b) => b.createdAt - a.createdAt);
}

/** Load a deck's content WITHOUT image blobs (synchronous — for thumbnails). */
export function loadDeckRaw(id: string): Deck | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(DECK_PREFIX + id);
    return raw ? sanitizeDeck(JSON.parse(raw) as Deck) : null;
  } catch {
    return null;
  }
}

/** Load a deck with its images re-attached (for the editor). */
export async function loadDeck(id: string): Promise<Deck | null> {
  const deck = loadDeckRaw(id);
  if (!deck) {
    return null;
  }
  try {
    const images = await getAllImages();
    return mergeImageData(deck, images);
  } catch {
    return deck;
  }
}

/** Write a deck's content + upsert its index entry. */
export function saveDeck(deck: Deck): void {
  if (typeof window === "undefined" || deck.id === SEED_DECK_ID) {
    return;
  }
  writeDeckContent(deck);
  const index = readIndex();
  const now = Date.now();
  const existing = index.find((meta) => meta.id === deck.id);
  if (existing) {
    existing.title = deck.title;
    existing.slideCount = deck.slides.length;
    existing.updatedAt = now;
  } else {
    index.push({
      id: deck.id,
      title: deck.title,
      slideCount: deck.slides.length,
      createdAt: now,
      updatedAt: now
    });
  }
  writeIndex(index);
}

/**
 * Register a deck in the index WITHOUT writing (skeleton) content — used when a
 * generated deck starts streaming so it lists immediately; the full content is
 * saved by the persistence subscription once every slide has filled in.
 */
export function registerDeck(id: string, title: string, slideCount: number): void {
  if (typeof window === "undefined") {
    return;
  }
  const index = readIndex();
  if (index.some((meta) => meta.id === id)) {
    return;
  }
  const now = Date.now();
  index.push({ id, title, slideCount, createdAt: now, updatedAt: now });
  writeIndex(index);
}

export function renameDeck(id: string, title: string): void {
  const trimmed = title.trim() || "Untitled deck";
  const deck = loadDeckRaw(id);
  if (deck) {
    writeDeckContent({ ...deck, title: trimmed });
  }
  const index = readIndex();
  const meta = index.find((m) => m.id === id);
  if (meta) {
    meta.title = trimmed;
    writeIndex(index);
  }
}

export function deleteDeck(id: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(DECK_PREFIX + id);
  } catch {
    // ignore
  }
  const index = readIndex().filter((meta) => meta.id !== id);
  writeIndex(index);
  // Drop images that no longer belong to any remaining deck.
  const keep = new Set<string>();
  for (const meta of index) {
    const deck = loadDeckRaw(meta.id);
    if (deck) {
      for (const elementId of elementIds(deck)) {
        keep.add(elementId);
      }
    }
  }
  void pruneImages(Array.from(keep));
}

// ---- hooks -----------------------------------------------------------------

/**
 * Global save subscription. Mount ONCE high in the tree (root layout) so it
 * survives `/` <-> `/editor` navigation — slides that finish streaming after the
 * user has navigated away still get saved. Saves whichever deck the store holds.
 */
export function usePersistDecks(): void {
  useEffect(() => {
    return useEditor.subscribe((state, prev) => {
      if (state.deck === prev.deck) {
        return;
      }
      const deck = state.deck;
      if (deck.id === SEED_DECK_ID) {
        return; // placeholder deck — never a library entry
      }
      // Don't persist a half-built deck mid-generation; wait until it's complete.
      if (deck.slides.some((slide) => slide.pending)) {
        return;
      }
      saveDeck(deck);
    });
  }, []);
}

/**
 * Load a specific deck (by id, from the route) into the store. Idempotent and
 * Strict-Mode-safe: if the store already holds that deck (e.g. just generated),
 * it is used as-is — no reload that could clobber a fresh deck. Returns whether
 * the requested deck is ready in the store.
 */
export function useLoadDeck(deckId: string): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(
    () => useEditor.getState().deck.id === deckId
  );

  useEffect(() => {
    let cancelled = false;
    if (useEditor.getState().deck.id === deckId) {
      setReady(true);
      return;
    }
    setReady(false);
    (async () => {
      const deck = await loadDeck(deckId);
      if (cancelled) {
        return;
      }
      if (!deck) {
        router.replace("/"); // unknown deck — back to the library
        return;
      }
      useEditor.getState().replaceDeck(deck);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, router]);

  return ready;
}
