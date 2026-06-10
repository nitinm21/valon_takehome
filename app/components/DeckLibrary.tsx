"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { deleteDeck, listDecks, type DeckEntry } from "../lib/deckStore";
import { DeckCard } from "./DeckCard";

// Home screen: a gallery of previously generated decks + a "Create Slide Deck"
// entry point. Decks come from the server (/api/decks) — which is also where
// agents create them — so the list refreshes on focus: switch back from the
// terminal after a /weekly-deck run and the new deck is here.
export function DeckLibrary() {
  const router = useRouter();
  const [entries, setEntries] = useState<DeckEntry[] | null>(null);

  async function refresh() {
    setEntries(await listDecks());
  }

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const isEmpty = entries !== null && entries.length === 0;

  return (
    <main className="library-shell">
      <header className="library-header">
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
                  void deleteDeck(entry.meta.id).then(refresh);
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
