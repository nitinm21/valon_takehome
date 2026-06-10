"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getAllImages } from "./imageStore";
import { DEFAULT_RUN_STYLE, runsText } from "./richText";
import { NEW_TEXT_DEFAULT, SEED_DECK_ID, useEditor } from "./store";
import type { Deck, Slide, SlideElement, TextElement, TextRun } from "./types";

// Client side of the deck persistence layer.
//
// Decks live SERVER-SIDE (data/decks/*.json, via /api/decks) so that external
// agents — Claude Code building a weekly deployment review, a refine command
// patching slide 3 — share one source of truth with the browser. This module is
// the thin API client: the library lists through it, the editor loads through
// it, a debounced subscription saves through it, and a small poll picks up
// agent-side changes while the editor is open.
//
// (Decks used to live in localStorage + IndexedDB; a one-time migration below
// pushes any legacy decks to the server so nothing is lost.)

export type DeckMeta = {
  id: string;
  title: string;
  slideCount: number;
  customer?: string;
  themeId?: string;
  createdAt: number;
  updatedAt: number;
};

export type DeckEntry = { meta: DeckMeta; firstSlide: Slide | null };

// ---- module sync state -------------------------------------------------------
// Shared between the save subscription and the agent-sync poll so they never
// fight: the poll only adopts server state when we have nothing waiting to save,
// and our own saves never re-trigger (content-compare, timestamps excluded).

let lastSavedJson = "";
let lastServerUpdatedAt = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Deck content identity, ignoring server-stamped timestamps.
function serializeDeck(deck: Deck): string {
  const { createdAt: _c, updatedAt: _u, ...content } = deck;
  return JSON.stringify(content);
}

function adoptServerDeck(deck: Deck): void {
  lastSavedJson = serializeDeck(deck);
  lastServerUpdatedAt = deck.updatedAt ?? 0;
}

// ---- deck (de)serialization (legacy normalization) ----------------------------

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

// ---- legacy migration (localStorage/IndexedDB -> server) ----------------------

const LEGACY_INDEX_KEY = "valon-deck-index-v1";
const LEGACY_DECK_PREFIX = "valon-deck-";
const MIGRATED_KEY = "valon-decks-migrated-v1";

async function migrateLegacyIfNeeded(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (window.localStorage.getItem(MIGRATED_KEY)) {
      return;
    }
    const raw = window.localStorage.getItem(LEGACY_INDEX_KEY);
    const metas = raw ? (JSON.parse(raw) as { id: string }[]) : [];
    if (Array.isArray(metas) && metas.length > 0) {
      const images = await getAllImages().catch(() => ({}) as Record<string, string>);
      for (const meta of metas) {
        const deckRaw = window.localStorage.getItem(LEGACY_DECK_PREFIX + meta.id);
        if (!deckRaw) {
          continue;
        }
        const deck = sanitizeDeck(JSON.parse(deckRaw) as Deck);
        // Re-attach image blobs (the legacy store stripped them to localStorage).
        deck.slides = deck.slides.map((slide) => ({
          ...slide,
          elements: slide.elements.map((el) =>
            el.type === "image" && images[el.id]
              ? { ...el, src: images[el.id], status: "done" as const }
              : el
          )
        }));
        await fetch("/api/decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deck })
        });
      }
    }
    window.localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // Best-effort: a failed migration must never block the library.
  }
}

// ---- public API ------------------------------------------------------------

/** Decks for the home library (with first slides for thumbnails), newest first. */
export async function listDecks(): Promise<DeckEntry[]> {
  await migrateLegacyIfNeeded();
  const response = await fetch("/api/decks?include=first", { cache: "no-store" });
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as {
    decks: (DeckMeta & { firstSlide: Slide | null })[];
  };
  return payload.decks.map(({ firstSlide, ...meta }) => ({
    meta,
    firstSlide: firstSlide ?? null
  }));
}

/** Load a deck for the editor. */
export async function loadDeck(id: string): Promise<Deck | null> {
  try {
    const response = await fetch(`/api/decks/${encodeURIComponent(id)}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { deck: Deck };
    return sanitizeDeck(payload.deck);
  } catch {
    return null;
  }
}

/** Write a deck to the server. Returns the stamped deck (or null on failure). */
export async function saveDeck(deck: Deck): Promise<Deck | null> {
  if (deck.id === SEED_DECK_ID) {
    return null;
  }
  try {
    const response = await fetch(`/api/decks/${encodeURIComponent(deck.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deck })
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { deck: Deck };
    return payload.deck;
  } catch {
    return null;
  }
}

/**
 * Register a deck on the server as soon as generation starts (pending skeletons
 * included), so it lists in the library immediately; the save subscription
 * uploads the finished content once every slide has streamed in.
 */
export function registerDeck(deck: Deck): void {
  void fetch("/api/decks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deck })
  });
}

export async function renameDeck(id: string, title: string): Promise<void> {
  const trimmed = title.trim() || "Untitled deck";
  await fetch(`/api/decks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops: [{ op: "setTitle", title: trimmed }] })
  }).catch(() => {});
}

export async function deleteDeck(id: string): Promise<void> {
  await fetch(`/api/decks/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
    () => {}
  );
}

// ---- hooks -----------------------------------------------------------------

const SAVE_DEBOUNCE_MS = 400;

/**
 * Global save subscription. Mount ONCE high in the tree (root layout) so it
 * survives `/` <-> `/editor` navigation — slides that finish streaming after the
 * user has navigated away still get saved. Debounced (writes go over HTTP now),
 * and content-compared so adopting server state never echoes a save back.
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
      if (serializeDeck(deck) === lastSavedJson) {
        return; // unchanged (or just adopted from the server)
      }
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
      saveTimer = setTimeout(async () => {
        saveTimer = null;
        const current = useEditor.getState().deck;
        const json = serializeDeck(current);
        if (json === lastSavedJson) {
          return;
        }
        const saved = await saveDeck(current);
        if (saved) {
          lastSavedJson = json;
          lastServerUpdatedAt = saved.updatedAt ?? 0;
        }
      }, SAVE_DEBOUNCE_MS);
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
      adoptServerDeck(deck);
      useEditor.getState().replaceDeck(deck);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, router]);

  return ready;
}

const SYNC_INTERVAL_MS = 3000;

/**
 * Live agent sync. While the editor is open, poll the server and adopt any deck
 * version written by someone else — i.e. an agent running a refine op in the
 * terminal shows up in the open editor within a few seconds. Never adopts while
 * the user has unsaved local changes (a save is pending), is mid-text-edit, or a
 * generation is streaming in.
 */
export function useDeckSync(deckId: string, ready: boolean): void {
  useEffect(() => {
    if (!ready) {
      return;
    }
    const interval = setInterval(async () => {
      if (document.hidden || saveTimer) {
        return;
      }
      const state = useEditor.getState();
      if (
        state.deck.id !== deckId ||
        state.editingId !== null ||
        state.deck.slides.some((slide) => slide.pending)
      ) {
        return;
      }
      try {
        const response = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, {
          cache: "no-store"
        });
        if (!response.ok) {
          return;
        }
        const { deck } = (await response.json()) as { deck: Deck };
        if ((deck.updatedAt ?? 0) <= lastServerUpdatedAt) {
          return;
        }
        const json = serializeDeck(deck);
        if (json === lastSavedJson) {
          lastServerUpdatedAt = deck.updatedAt ?? 0; // our own save echoed back
          return;
        }
        adoptServerDeck(deck);
        useEditor.getState().replaceDeck(sanitizeDeck(deck));
      } catch {
        // Transient network error — try again next tick.
      }
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [deckId, ready]);
}
