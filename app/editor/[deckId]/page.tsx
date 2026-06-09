"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Artboard } from "../../components/Artboard";
import { GeneratePopover } from "../../components/GeneratePopover";
import { SlidePanel } from "../../components/SlidePanel";
import { SlideRail } from "../../components/SlideRail";
import { useLoadDeck } from "../../lib/deckStore";
import { exportDeck } from "../../lib/exportDeck";
import { GRADIENT_ANGLE, useEditor, useEditorKeyboard } from "../../lib/store";
import type { Background } from "../../lib/types";

function backgroundCss(background: Background) {
  return background.type === "solid"
    ? background.color
    : `linear-gradient(${GRADIENT_ANGLE}deg, ${background.from}, ${background.to})`;
}

export default function Editor() {
  const router = useRouter();
  const params = useParams<{ deckId: string }>();
  const deckId = params.deckId;
  const ready = useLoadDeck(deckId);

  const title = useEditor((state) => state.deck.title);
  const setDeckTitle = useEditor((state) => state.setDeckTitle);
  const addText = useEditor((state) => state.addText);
  const addImage = useEditor((state) => state.addImage);
  const background = useEditor((state) => state.currentSlide().background);
  const scale = useEditor((state) => state.scale);
  const generating = useEditor((state) =>
    state.deck.slides.some((slide) => slide.pending)
  );

  const [panelOpen, setPanelOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEditorKeyboard();

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  function commitTitle() {
    setDeckTitle(titleDraft.trim() || "Untitled deck");
    setEditingTitle(false);
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    const message = await exportDeck();
    if (message) {
      setExportError(message);
    }
    setExporting(false);
  }

  if (!ready) {
    return (
      <main className="editor-loading">
        <span className="skeleton-spinner" aria-hidden />
        <span>Loading deck…</span>
      </main>
    );
  }

  return (
    <main className={`editor-shell ${panelOpen ? "panel-open" : ""}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="brand-mark brand-home"
            onClick={() => router.push("/")}
            title="Back to your decks"
            type="button"
          >
            Home
          </button>
          {editingTitle ? (
            <input
              className="deck-title-input"
              onBlur={commitTitle}
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitTitle();
                } else if (event.key === "Escape") {
                  setTitleDraft(title);
                  setEditingTitle(false);
                }
              }}
              ref={titleInputRef}
              value={titleDraft}
            />
          ) : (
            <button
              className="brand-title brand-title-btn"
              onClick={() => {
                setTitleDraft(title);
                setEditingTitle(true);
              }}
              title="Rename deck"
              type="button"
            >
              {title}
            </button>
          )}
          {generating && (
            <span className="deck-generating" role="status">
              <span className="deck-generating-dot" aria-hidden />
              Generating deck…
            </span>
          )}
        </div>

        <div className="insert-tools">
          <button className="insert-btn" onClick={addText} type="button">
            <span className="insert-icon">T</span>
            Text
          </button>
          <button className="insert-btn" onClick={addImage} type="button">
            <span className="insert-icon" aria-hidden>
              ▦
            </span>
            Image
          </button>
          <button
            className={`insert-btn ${panelOpen ? "active" : ""}`}
            onClick={() => setPanelOpen((open) => !open)}
            type="button"
          >
            <span
              className="bg-chip-swatch"
              style={{ background: backgroundCss(background) }}
            />
            Background
          </button>
        </div>

        <div className="topbar-right">
          {exportError && <span className="export-error">{exportError}</span>}
          <button
            className="btn btn-primary"
            disabled={exporting || generating}
            onClick={handleExport}
            type="button"
          >
            {exporting ? "Exporting…" : "Export .pptx"}
          </button>
        </div>
      </header>

      <section className="workspace">
        <SlideRail />
        <Artboard />
        {panelOpen && <SlidePanel onClose={() => setPanelOpen(false)} />}
      </section>

      <footer className="bottombar">
        <button
          className={`gen-trigger ${genOpen ? "active" : ""}`}
          onClick={() => setGenOpen((open) => !open)}
          type="button"
        >
          <span className="gen-trigger-icon" aria-hidden>
            ✨
          </span>
          Generate with AI
        </button>
        <span className="zoom-readout">{Math.round(scale * 100)}%</span>
        {genOpen && <GeneratePopover onClose={() => setGenOpen(false)} />}
      </footer>
    </main>
  );
}
