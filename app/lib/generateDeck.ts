"use client";

import { registerDeck } from "./deckStore";
import { generateImage } from "./generateImage";
import { buildSlide, type SlideContent } from "./layouts";
import { useEditor } from "./store";
import { defaultTheme, type ThemeSummary } from "./theme";
import type { Outline, OutlineSlide, Slide, SlideSource } from "./types";

// Orchestrates "generate a whole deck from an outline".
//
// Strategy (matches the approved plan):
//   1. Snapshot one theme up front (a clean light skeleton — no deck theming yet)
//      so every slide shares a consistent look.
//   2. Replace the deck with N PENDING slides (skeletons) and navigate the user
//      into the editor immediately.
//   3. Fill each slide independently, in parallel, streaming into the editor:
//        - cover / bullets  -> built directly from the outline (no network); the
//          outline IS the content, so these appear instantly.
//        - paragraph / boxes / two-col-image -> a per-slide /api/generate-slide
//          call grounded in the outline row, which expands the points into prose,
//          cards, or a body + image prompt.
//   4. Kick off image generation (fire-and-forget) for any image element.
//
// Each fill targets its slide BY ID via store.replaceSlideContents, because the
// user may be on a different slide while others are still streaming in.

function uid(): string {
  return crypto.randomUUID();
}

// Direct (no-LLM) content for the layouts whose content the outline already is.
function directContent(slide: OutlineSlide): { templateId: string; slots: SlideContent } | null {
  if (slide.layout === "cover") {
    const slots: SlideContent = { title: { text: slide.title } };
    if (slide.bullets[0]) {
      slots.subtitle = { text: slide.bullets[0] };
    }
    return { templateId: "cover", slots };
  }
  if (slide.layout === "bullets") {
    return {
      templateId: "bullets",
      slots: {
        title: { text: slide.title },
        body: { text: slide.bullets.join("\n") }
      }
    };
  }
  return null;
}

function fillSlide(
  slideId: string,
  templateId: string,
  slots: SlideContent,
  layout: string,
  theme: ThemeSummary
): void {
  const built = buildSlide(templateId, slots, theme);
  const source: SlideSource = { templateId, style: layout, slots };
  useEditor.getState().replaceSlideContents(slideId, {
    elements: built.elements,
    background: built.background,
    source
  });
  // Generate any image the slide needs (≤2 across the deck per the outline cap).
  for (const element of built.elements) {
    if (element.type === "image" && !element.src && element.prompt) {
      void generateImage(element.id, element.prompt);
    }
  }
}

async function generateSlideViaApi(
  slideId: string,
  outline: Outline,
  slide: OutlineSlide,
  theme: ThemeSummary
): Promise<void> {
  try {
    const response = await fetch("/api/generate-slide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: slide.title,
        style: slide.layout,
        theme,
        outline: {
          deckTitle: outline.deckTitle,
          title: slide.title,
          bullets: slide.bullets
        }
      })
    });
    const payload = (await response.json()) as {
      error?: string;
      templateId?: string;
      slots?: SlideContent;
    };
    if (!response.ok || !payload.templateId || !payload.slots) {
      throw new Error(payload.error ?? "Slide generation failed.");
    }
    fillSlide(slideId, payload.templateId, payload.slots, slide.layout, theme);
  } catch {
    // Never leave a slide stuck as a skeleton: fall back to a bullets slide built
    // straight from the outline row.
    fillSlide(
      slideId,
      "bullets",
      { title: { text: slide.title }, body: { text: slide.bullets.join("\n") } },
      "bullets",
      theme
    );
  }
}

// Build the pending deck, swap it in, and fire all the per-slide fills. Returns
// the new deck's id immediately (fills resolve in the background) so the caller
// can navigate to `/editor/<id>` and watch the slides stream in.
export function startDeckGeneration(
  outline: Outline,
  theme: ThemeSummary = defaultTheme(),
  themeId?: string
): string | null {
  const pending: Slide[] = outline.slides.map((slide) => ({
    id: uid(),
    background: theme.background,
    elements: [],
    pending: true,
    pendingTitle: slide.title
  }));

  if (pending.length === 0) {
    return null;
  }

  const deckId = uid();
  const deck = {
    id: deckId,
    title: outline.deckTitle,
    slides: pending,
    selectedSlideId: pending[0].id,
    // Record which theme styled the deck so the editor's theme selector reflects
    // it and a later re-theme knows the prior surface color (see applyTheme.ts).
    themeId
  };
  useEditor.getState().replaceDeck(deck);

  // Register the deck on the server right away (so it lists in the library even
  // if the user navigates home mid-generation); its full content is saved by the
  // persistence subscription once every slide has streamed in.
  registerDeck(deck);

  outline.slides.forEach((slide, index) => {
    const slideId = pending[index].id;
    const direct = directContent(slide);
    if (direct) {
      // Synchronous — appears instantly.
      fillSlide(slideId, direct.templateId, direct.slots, slide.layout, theme);
    } else {
      // Async — streams in when the model responds.
      void generateSlideViaApi(slideId, outline, slide, theme);
    }
  });

  return deckId;
}
