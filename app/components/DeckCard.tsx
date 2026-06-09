"use client";

import { useState } from "react";

import type { DeckMeta } from "../lib/deckStore";
import type { Slide } from "../lib/types";
import { SlideThumb } from "./SlideThumb";

// One deck in the library grid: a slide-1 preview, the title, and a slide count.
// Click opens the deck; the trash button deletes it (with a confirm step).
export function DeckCard({
  meta,
  firstSlide,
  onOpen,
  onDelete
}: {
  meta: DeckMeta;
  firstSlide: Slide | null;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="deck-card">
      <button className="deck-card-open" onClick={onOpen} type="button">
        <div className="deck-card-thumb">
          {firstSlide ? (
            <SlideThumb slide={firstSlide} />
          ) : (
            <div className="deck-card-thumb-empty">No preview</div>
          )}
        </div>
        <div className="deck-card-meta">
          <span className="deck-card-title">{meta.title}</span>
          <span className="deck-card-sub">
            {meta.slideCount} slide{meta.slideCount === 1 ? "" : "s"}
          </span>
        </div>
      </button>

      {confirming ? (
        <div className="deck-card-confirm" data-toolbar>
          <button
            className="deck-card-confirm-yes"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            type="button"
          >
            Delete
          </button>
          <button
            className="deck-card-confirm-no"
            onClick={(event) => {
              event.stopPropagation();
              setConfirming(false);
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          aria-label={`Delete ${meta.title}`}
          className="deck-card-delete"
          onClick={(event) => {
            event.stopPropagation();
            setConfirming(true);
          }}
          type="button"
        >
          🗑
        </button>
      )}
    </div>
  );
}
