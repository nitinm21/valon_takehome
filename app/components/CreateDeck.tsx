"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { startDeckGeneration } from "../lib/generateDeck";
import { DEFAULT_THEME_ID, getTheme } from "../lib/themes";
import type { Outline } from "../lib/types";
import { OutlineEditor } from "./OutlineEditor";

const MIN_SLIDES = 1;
const MAX_SLIDES = 10;
const DEFAULT_SLIDES = 6;

// The deck-creation flow: a prompt/paste box -> an editable outline -> the full
// deck (which streams into the editor under its own id).
export function CreateDeck() {
  const router = useRouter();

  const [phase, setPhase] = useState<"input" | "outline">("input");
  const [input, setInput] = useState("");
  const [slideCount, setSlideCount] = useState(DEFAULT_SLIDES);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateOutline() {
    const trimmed = input.trim();
    if (!trimmed || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/generate-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: trimmed, slideCount })
      });
      const payload = (await response.json()) as Outline & { error?: string };
      if (!response.ok || !payload.slides?.length) {
        setError(payload.error ?? "Couldn't generate an outline. Try again.");
        return;
      }
      setOutline({ deckTitle: payload.deckTitle, slides: payload.slides });
      setPhase("outline");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleGenerateDeck() {
    if (!outline) {
      return;
    }
    const id = startDeckGeneration(outline, getTheme(themeId).summary, themeId);
    if (id) {
      router.push(`/editor/${id}`);
    }
  }

  if (phase === "outline" && outline) {
    return (
      <main className="create-shell">
        <div className="create-panel create-panel--wide">
          <OutlineEditor
            onBack={() => setPhase("input")}
            onChange={setOutline}
            onGenerate={handleGenerateDeck}
            onThemeSelect={setThemeId}
            outline={outline}
            themeId={themeId}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="create-shell">
      <div className="create-panel">
        <div className="create-brand">
          <button className="link-btn" onClick={() => router.push("/")} type="button">
            ← Back
          </button>
        </div>
        <h1 className="create-title">Create a deck</h1>
        <p className="create-subtitle">
          Describe what you want, or paste in text to turn into slides.
        </p>

        <textarea
          autoFocus
          className="create-textarea"
          disabled={loading}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void handleGenerateOutline();
            }
          }}
          placeholder={
            "e.g. “A 6-slide intro to the TV show Survivor” — or paste an article, your notes, or a transcript…"
          }
          value={input}
        />

        <div className="create-controls">
          <div className="count-stepper">
            <span className="count-label">Slides</span>
            <button
              aria-label="Fewer slides"
              className="count-btn"
              disabled={slideCount <= MIN_SLIDES || loading}
              onClick={() => setSlideCount((n) => Math.max(MIN_SLIDES, n - 1))}
              type="button"
            >
              −
            </button>
            <span className="count-value">{slideCount}</span>
            <button
              aria-label="More slides"
              className="count-btn"
              disabled={slideCount >= MAX_SLIDES || loading}
              onClick={() => setSlideCount((n) => Math.min(MAX_SLIDES, n + 1))}
              type="button"
            >
              +
            </button>
          </div>

          <button
            className="btn btn-primary btn-lg"
            disabled={loading || !input.trim()}
            onClick={handleGenerateOutline}
            type="button"
          >
            {loading ? (
              <>
                <span className="btn-spinner" aria-hidden /> Drafting outline…
              </>
            ) : (
              "Generate outline"
            )}
          </button>
        </div>

        {error && <div className="create-error">{error}</div>}
      </div>
    </main>
  );
}
