"use client";

import { putImage } from "./imageStore";
import { useEditor } from "./store";

// Generates an image for an image element via /api/generate, updates the element's
// status/src in the store, and persists the blob to IndexedDB. Returns an error
// message string on failure, or null on success. The generated image only ever
// fills this one element — never the whole slide.
export async function generateImage(
  id: string,
  prompt: string
): Promise<string | null> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "Enter a prompt first.";
  }

  const { updateImage } = useEditor.getState();
  updateImage(id, { status: "generating", prompt: trimmed });

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: trimmed })
    });
    const payload = (await response.json()) as {
      error?: string;
      imageData?: string;
    };

    if (!response.ok || !payload.imageData) {
      updateImage(id, { status: "error" });
      return payload.error ?? "Image generation failed.";
    }

    updateImage(id, { src: payload.imageData, status: "done" });
    // Large base64 blobs live in IndexedDB, keyed by element id — never in
    // localStorage (see usePersistDeck).
    await putImage(id, payload.imageData);
    return null;
  } catch (error) {
    updateImage(id, { status: "error" });
    return error instanceof Error ? error.message : "Something went wrong.";
  }
}
