"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { generateImage } from "../lib/generateImage";
import { buildSlide } from "../lib/layouts";
import { useEditor } from "../lib/store";
import { deriveTheme, surfaceColorFor } from "../lib/theme";
import { STYLES, StyleCard, type StyleId } from "./StyleCard";

// The AI composer, anchored above the bottom "Generate with AI" trigger.
//
// Two modes, auto-selected from the slide you're on:
//   GENERATE — current slide has no `source` (blank/hand-made): prompt appends a
//     brand-new slide.
//   EDIT — current slide has `source` (it was AI-generated): the prompt iterates
//     on THAT slide IN PLACE, keeping its layout; no new slide is created.
// After generating, the new slide becomes current and carries `source`, so the
// popover flips to edit mode automatically. It stays open until the user
// dismisses it (× button or Escape).
export function GeneratePopover({ onClose }: { onClose: () => void }) {
  const addGeneratedSlide = useEditor((state) => state.addGeneratedSlide);
  const editCurrentSlide = useEditor((state) => state.editCurrentSlide);
  // Mode is derived purely from the current slide's provenance.
  const source = useEditor((state) => state.currentSlide().source);
  const isEdit = Boolean(source);

  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<StyleId>("magic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autofocus the prompt on open.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Escape closes the popover (it's otherwise persistent — no click-away).
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
      // Read state lazily so we act on the latest deck/slide.
      const state = useEditor.getState();
      const slide = state.currentSlide();
      const src = slide.source; // present => edit mode (iterate on this slide)
      const baseTheme = deriveTheme(state.deck);
      // For an edit, compute colors against THIS slide's background (which may
      // differ from the deck's dominant background).
      const theme = src
        ? {
            ...baseTheme,
            background: slide.background,
            surfaceColor: surfaceColorFor(slide.background)
          }
        : baseTheme;

      const response = await fetch("/api/generate-slide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          src
            ? {
                topic: trimmed,
                theme,
                current: { templateId: src.templateId, slots: src.slots }
              }
            : { topic: trimmed, style, theme }
        )
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

      const built = buildSlide(payload.templateId, payload.slots, theme);
      const newSource = {
        templateId: payload.templateId,
        style: src ? src.style : style,
        slots: payload.slots
      };

      if (src) {
        // Preserve the existing picture across a content edit (don't re-generate).
        const oldImage = slide.elements.find((el) => el.type === "image");
        if (oldImage && oldImage.type === "image" && oldImage.src) {
          for (const el of built.elements) {
            if (el.type === "image") {
              el.src = oldImage.src;
              el.prompt = oldImage.prompt;
              el.status = "done";
              break;
            }
          }
        }
        editCurrentSlide({ elements: built.elements, source: newSource });
      } else {
        addGeneratedSlide({
          background: built.background,
          elements: built.elements,
          source: newSource
        });
      }

      setTopic("");

      // Generate any image still missing a picture (fresh generate, or an edit
      // whose image wasn't generated yet). Preserved pictures already have a src.
      for (const el of built.elements) {
        if (el.type === "image" && !el.src && el.prompt) {
          void generateImage(el.id, el.prompt);
        }
      }
      // Stay open: the user can keep iterating; dismiss via × or Escape.
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
    <div className="gen-popover" data-toolbar role="dialog" aria-label="Generate slide">
      <div className="gen-popover-head">
        <span>{isEdit ? "Edit this slide" : "Generate slide"}</span>
        <button
          aria-label="Close"
          className="gen-popover-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>

      <div className="gen-input-wrap">
        <textarea
          className="gen-textarea"
          disabled={loading}
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isEdit ? "Describe a change to this slide…" : "Describe the slide you want…"
          }
          ref={textareaRef}
          value={topic}
        />
        <button
          aria-label={isEdit ? "Apply edit" : "Generate"}
          className="gen-send"
          disabled={loading || !topic.trim()}
          onClick={handleGenerate}
          type="button"
        >
          {loading ? "…" : "➤"}
        </button>
      </div>

      {!isEdit && (
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
      )}

      {error && <div className="gen-error">{error}</div>}
    </div>
  );
}
