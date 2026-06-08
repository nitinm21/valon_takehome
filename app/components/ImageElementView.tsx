"use client";

import { useState, type CSSProperties } from "react";

import { generateImage } from "../lib/generateImage";
import { useEditor } from "../lib/store";
import type { ImageElement } from "../lib/types";

// Renders an image element. Empty boxes show an inline prompt; generated boxes
// show the picture (cover fit). Generation only ever fills THIS box.
export function ImageElementView({ element }: { element: ImageElement }) {
  const select = useEditor((state) => state.select);
  const updateImage = useEditor((state) => state.updateImage);
  const [error, setError] = useState<string | null>(null);

  const frame: CSSProperties = {
    position: "absolute",
    left: element.x,
    top: element.y,
    width: element.w,
    height: element.h,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    zIndex: element.z
  };

  const isGenerating = element.status === "generating";

  async function runGenerate() {
    setError(null);
    const message = await generateImage(element.id, element.prompt);
    if (message) {
      setError(message);
    }
  }

  return (
    <div
      className="image-el"
      data-el-id={element.id}
      onMouseDown={() => select(element.id)}
      style={frame}
    >
      {element.src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={element.prompt || "Generated image"}
          className="image-el-img"
          src={element.src}
        />
      )}

      {!element.src && !isGenerating && (
        <div className="image-prompt">
          <span className="image-prompt-label">🖼 Describe an image</span>
          <textarea
            className="image-prompt-input"
            onChange={(event) =>
              updateImage(element.id, { prompt: event.target.value })
            }
            placeholder="e.g. a golden retriever in a sunny field"
            rows={2}
            value={element.prompt}
          />
          <button
            className="btn btn-primary image-prompt-btn"
            disabled={!element.prompt.trim()}
            onClick={runGenerate}
            type="button"
          >
            Generate
          </button>
          {error && <p className="image-error">{error}</p>}
        </div>
      )}

      {isGenerating && (
        <div className="image-spinner">
          <span className="spinner" />
          <span>Generating…</span>
        </div>
      )}
    </div>
  );
}
