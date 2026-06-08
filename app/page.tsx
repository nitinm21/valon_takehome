"use client";

import { useState } from "react";

import { Artboard } from "./components/Artboard";
import { GeneratePopover } from "./components/GeneratePopover";
import { SlidePanel } from "./components/SlidePanel";
import { SlideRail } from "./components/SlideRail";
import { exportDeck } from "./lib/exportDeck";
import {
  GRADIENT_ANGLE,
  useEditor,
  useEditorKeyboard,
  usePersistDeck
} from "./lib/store";
import type { Background } from "./lib/types";

function backgroundCss(background: Background) {
  return background.type === "solid"
    ? background.color
    : `linear-gradient(${GRADIENT_ANGLE}deg, ${background.from}, ${background.to})`;
}

// Phase 4 shell: insert tools top-center, a right-side Slide panel for
// customizations, and a slim bottom bar (background quick-access + zoom).
export default function Home() {
  const title = useEditor((state) => state.deck.title);
  const addText = useEditor((state) => state.addText);
  const addImage = useEditor((state) => state.addImage);
  const background = useEditor((state) => state.currentSlide().background);
  const scale = useEditor((state) => state.scale);

  const [panelOpen, setPanelOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  usePersistDeck();
  useEditorKeyboard();

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    const message = await exportDeck();
    if (message) {
      setExportError(message);
    }
    setExporting(false);
  }

  return (
    <main className={`editor-shell ${panelOpen ? "panel-open" : ""}`}>
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand-mark">Valon</span>
          <span className="brand-title">{title}</span>
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
            disabled={exporting}
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
