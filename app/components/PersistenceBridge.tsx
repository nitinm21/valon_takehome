"use client";

import { usePersistDecks } from "../lib/deckStore";

// Mounted once in the root layout so the deck-save subscription stays alive
// across `/` <-> `/create` <-> `/editor` navigation (slides that finish
// streaming after the user navigates away still get saved). Renders nothing.
export function PersistenceBridge() {
  usePersistDecks();
  return null;
}
