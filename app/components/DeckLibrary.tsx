"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { deleteDeck, listDecks, loadDeckRaw, type DeckMeta } from "../lib/deckStore";
import type { Slide } from "../lib/types";
import { DeckCard } from "./DeckCard";

type Entry = { meta: DeckMeta; firstSlide: Slide | null };

// Home screen: a gallery of previously generated decks + a "Create Slide Deck"
// entry point. localStorage reads happen on mount (client only), so the first
// paint shows nothing until `entries` is populated (avoids hydration mismatch).
export function DeckLibrary() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[] | null>(null);

  function refresh() {
    const metas = listDecks();
    setEntries(
      metas.map((meta) => ({
        meta,
        firstSlide: loadDeckRaw(meta.id)?.slides[0] ?? null
      }))
    );
  }

  useEffect(() => {
    refresh();
  }, []);

  const isEmpty = entries !== null && entries.length === 0;

  return (
    <main className="library-shell">
      <header className="library-header">
        <span className="brand-mark">Valon</span>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => router.push("/create")}
          type="button"
        >
          ✨ Create Slide Deck
        </button>
      </header>

      <div className="library-body">
        <h1 className="library-title">Your slide decks</h1>

        {isEmpty && (
          <div className="library-empty">
            <div className="library-empty-art" aria-hidden>
              ✨
            </div>
            <p className="library-empty-text">
              You don&rsquo;t have any decks yet. Start from a prompt or paste in your
              own text.
            </p>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => router.push("/create")}
              type="button"
            >
              ✨ Create Slide Deck
            </button>
          </div>
        )}

        {entries && entries.length > 0 && (
          <div className="library-grid">
            {entries.map((entry) => (
              <DeckCard
                firstSlide={entry.firstSlide}
                key={entry.meta.id}
                meta={entry.meta}
                onDelete={() => {
                  deleteDeck(entry.meta.id);
                  refresh();
                }}
                onOpen={() => router.push(`/editor/${entry.meta.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
