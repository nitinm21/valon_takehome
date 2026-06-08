"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { generateImage } from "../lib/generateImage";
import { buildSlide } from "../lib/layouts";
import { useEditor } from "../lib/store";
import { deriveTheme } from "../lib/theme";
import { STYLES, StyleCard, type StyleId } from "./StyleCard";

// The AI composer, anchored above the bottom "Generate with AI" trigger.
//   prompt + chosen style -> /api/generate-slide (style is forced unless "magic")
//   -> buildSlide(theme) -> addGeneratedSlide -> async image fill -> close.
// Theme is derived client-side from the current deck so the new slide matches.
export function GeneratePopover({ onClose }: { onClose: () => void }) {
  const addGeneratedSlide = useEditor((state) => state.addGeneratedSlide);
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<StyleId>("magic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autofocus the prompt on open.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Escape closes (click-away is the overlay below).
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleGenerate() {
    const trimmed = topic.trim();
    if (!trimmed || loading) {
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Read the deck lazily (not subscribed) so the theme reflects the latest edits.
      const theme = deriveTheme(useEditor.getState().deck);
      const response = await fetch("/api/generate-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: trimmed, style, theme })
      });
      const payload = (await response.json()) as {
        error?: string;
        templateId?: string;
        slots?: Record<string, { text?: string; prompt?: string; heading?: string }>;
      };

      if (!response.ok || !payload.templateId || !payload.slots) {
        setError(payload.error ?? "Generation failed.");
        return;
      }

      const slide = buildSlide(payload.templateId, payload.slots, theme);
      addGeneratedSlide(slide);

      // Fire-and-forget the image pass; each image box shows its own spinner.
      for (const element of slide.elements) {
        if (element.type === "image" && element.prompt) {
          void generateImage(element.id, element.prompt);
        }
      }

      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter submits; Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleGenerate();
    }
  }

  return (
    <>
      <div className="gen-overlay" onClick={onClose} />
      <div className="gen-popover" data-toolbar role="dialog" aria-label="Generate slide">
        <div className="gen-popover-head">Generate slide</div>

        <div className="gen-input-wrap">
          <textarea
            className="gen-textarea"
            disabled={loading}
            onChange={(event) => setTopic(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the slide you want…"
            ref={textareaRef}
            value={topic}
          />
          <button
            aria-label="Generate"
            className="gen-send"
            disabled={loading || !topic.trim()}
            onClick={handleGenerate}
            type="button"
          >
            {loading ? "…" : "➤"}
          </button>
        </div>

        <div className="style-picker-section">
          <div className="style-picker-label">Choose a style</div>
          <div className="style-picker">
            {STYLES.map((option) => (
              <StyleCard
                id={option.id}
                key={option.id}
                label={option.label}
                onSelect={() => setStyle(option.id)}
                selected={style === option.id}
              />
            ))}
          </div>
        </div>

        {error && <div className="gen-error">{error}</div>}
      </div>
    </>
  );
}
