"use client";

import { ARTBOARD_H, ARTBOARD_W, useEditor } from "./store";

// PPTX backgrounds can't render CSS gradients, so rasterize the slide gradient to
// a PNG (matching the editor's fixed diagonal) and send it as a background image.
function gradientDataUrl(from: string, to: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = ARTBOARD_W;
  canvas.height = ARTBOARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }
  const gradient = ctx.createLinearGradient(0, 0, ARTBOARD_W, ARTBOARD_H);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, ARTBOARD_W, ARTBOARD_H);
  return canvas.toDataURL("image/png");
}

function buildPayload() {
  const deck = useEditor.getState().deck;
  return {
    title: deck.title,
    slides: deck.slides.map((slide) => ({
      background:
        slide.background.type === "solid"
          ? { type: "solid" as const, color: slide.background.color }
          : {
              type: "image" as const,
              data: gradientDataUrl(slide.background.from, slide.background.to)
            },
      // Skip empty image boxes (no generated picture yet).
      elements: slide.elements.filter(
        (el) => el.type !== "image" || Boolean(el.src)
      )
    }))
  };
}

// Builds the deck payload (with real image data + rasterized gradients), asks the
// server to render a .pptx, and downloads it. Returns an error message or null.
export async function exportDeck(): Promise<string | null> {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload())
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    return payload.error ?? "Export failed.";
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "valon-slides.pptx";
  anchor.click();
  window.URL.revokeObjectURL(url);
  return null;
}
