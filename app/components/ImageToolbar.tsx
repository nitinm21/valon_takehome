"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

import { generateImage } from "../lib/generateImage";
import { useEditor } from "../lib/store";
import type { ImageElement } from "../lib/types";

// Contextual toolbar for a selected, already-generated image: tweak the prompt
// and regenerate in place (keeps the box's position and size).
export function ImageToolbar({
  element,
  paneRef
}: {
  element: ImageElement;
  paneRef: RefObject<HTMLDivElement | null>;
}) {
  const updateImage = useEditor((state) => state.updateImage);
  const scale = useEditor((state) => state.scale);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane) {
      return;
    }
    const node = pane.querySelector<HTMLElement>(
      `[data-el-id="${CSS.escape(element.id)}"]`
    );
    if (!node) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    setPos({
      left: Math.max(8, rect.left - paneRect.left),
      top: Math.max(8, rect.top - paneRect.top - 48)
    });
  }, [element.id, element.x, element.y, element.w, element.h, scale, paneRef]);

  if (!pos) {
    return null;
  }

  const generating = element.status === "generating";

  async function regenerate() {
    setError(null);
    const message = await generateImage(element.id, element.prompt);
    if (message) {
      setError(message);
    }
  }

  return (
    <div className="image-toolbar" data-toolbar style={{ left: pos.left, top: pos.top }}>
      <input
        className="image-toolbar-input"
        onChange={(event) => updateImage(element.id, { prompt: event.target.value })}
        placeholder="Describe the image"
        value={element.prompt}
      />
      <button
        className="btn btn-primary image-toolbar-btn"
        disabled={generating || !element.prompt.trim()}
        onClick={regenerate}
        type="button"
      >
        {generating ? "…" : "Regenerate"}
      </button>
      {error && <span className="image-toolbar-error">{error}</span>}
    </div>
  );
}
