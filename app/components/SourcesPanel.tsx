"use client";

import { useEffect, useState } from "react";

import { useEditor } from "../lib/store";

// Provenance for the current slide: which customer artifacts (file + lines) back
// the numbers on it, plus the agent's speaker notes. This is the trust surface
// for agent-authored decks — a strategist spot-checks the citation instead of
// re-deriving the analysis. Hidden entirely for slides with no citations/notes
// (hand-made decks look unchanged).
export function SourcesPanel() {
  const slide = useEditor((state) => state.currentSlide());
  const [open, setOpen] = useState(false);

  const citations = slide.citations ?? [];
  const notes = slide.notes;

  // Close when switching to a slide without sources (and reset per slide).
  useEffect(() => {
    setOpen(false);
  }, [slide.id]);

  if (citations.length === 0 && !notes) {
    return null;
  }

  return (
    <>
      <button
        className={`sources-trigger ${open ? "active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        title="Where this slide's numbers come from"
        type="button"
      >
        <span aria-hidden>⌕</span>
        {citations.length > 0
          ? `Sources · ${citations.length}`
          : "Presenter notes"}
      </button>

      {open && (
        <div aria-label="Slide sources" className="sources-popover" role="dialog">
          <div className="sources-head">
            <span className="sources-title">This slide is grounded in</span>
            <button
              aria-label="Close sources"
              className="sources-close"
              onClick={() => setOpen(false)}
              type="button"
            >
              ✕
            </button>
          </div>

          {citations.length > 0 && (
            <ul className="sources-list">
              {citations.map((citation, index) => (
                <li className="sources-item" key={index}>
                  <code className="sources-artifact">
                    {citation.artifact}
                    {citation.lines ? `:${citation.lines}` : ""}
                  </code>
                  {citation.quote && (
                    <blockquote className="sources-quote">
                      “{citation.quote}”
                    </blockquote>
                  )}
                  {citation.note && <p className="sources-note">{citation.note}</p>}
                </li>
              ))}
            </ul>
          )}

          {notes && (
            <div className="sources-notes">
              <div className="sources-notes-label">Presenter notes</div>
              <p className="sources-notes-text">{notes}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
