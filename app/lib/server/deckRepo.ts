// File-backed deck storage (server-side source of truth).
//
// Decks live in data/decks/<id>.json so they are reachable by BOTH the browser
// (library/editor, via /api/decks) and external agents (Claude Code & co., via
// the same API). This is what makes the app agent-controllable at all — the
// previous localStorage-only persistence meant nothing outside the browser tab
// could create or modify a deck. Image data URLs are stored inline: deck files
// are self-contained, and the filesystem has no localStorage-style quota.

import { promises as fs } from "fs";
import path from "path";

import type { Deck } from "../types";

const DECKS_DIR = path.join(process.cwd(), "data", "decks");

// Deck ids become filenames — keep them strictly path-safe.
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;

export function isValidDeckId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

function deckPath(id: string): string {
  return path.join(DECKS_DIR, `${id}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DECKS_DIR, { recursive: true });
}

export async function readDeck(id: string): Promise<Deck | null> {
  if (!isValidDeckId(id)) {
    return null;
  }
  try {
    const raw = await fs.readFile(deckPath(id), "utf8");
    return JSON.parse(raw) as Deck;
  } catch {
    return null;
  }
}

/**
 * Persist a deck, stamping timestamps: createdAt survives from the existing
 * file (or is set now), updatedAt is always now. Atomic write (tmp + rename) so
 * a concurrent read never sees a torn file. Returns the stamped deck.
 */
export async function writeDeck(deck: Deck): Promise<Deck> {
  if (!isValidDeckId(deck.id)) {
    throw new Error(
      `Invalid deck id "${deck.id}" — use letters, digits, "-" or "_".`
    );
  }
  await ensureDir();
  const existing = await readDeck(deck.id);
  const now = Date.now();
  const stamped: Deck = {
    ...deck,
    createdAt: existing?.createdAt ?? deck.createdAt ?? now,
    updatedAt: now
  };
  const target = deckPath(deck.id);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(stamped, null, 2), "utf8");
  await fs.rename(tmp, target);
  return stamped;
}

export async function deleteDeck(id: string): Promise<boolean> {
  if (!isValidDeckId(id)) {
    return false;
  }
  try {
    await fs.unlink(deckPath(id));
    return true;
  } catch {
    return false;
  }
}

/** All decks, newest first. Unparseable files are skipped, not fatal. */
export async function listDecks(): Promise<Deck[]> {
  await ensureDir();
  const files = await fs.readdir(DECKS_DIR);
  const decks: Deck[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    try {
      const raw = await fs.readFile(path.join(DECKS_DIR, file), "utf8");
      const deck = JSON.parse(raw) as Deck;
      if (deck?.id && Array.isArray(deck.slides)) {
        decks.push(deck);
      }
    } catch {
      // Skip corrupt files; the library should still load.
    }
  }
  return decks.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}
