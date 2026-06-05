"use client";

import { useEffect, useState } from "react";

import { deleteImage, getAllImages, putImage } from "./lib/imageStore";

type SlideStatus = "idle" | "working" | "done" | "error";

type Slide = {
  id: string;
  name: string;
  prompt: string;
  imageData?: string;
  status: SlideStatus;
  note: string;
  feedback?: string;
};

const STORAGE_KEY = "valon-presentation-takehome-v2";

function makeSlide(index: number): Slide {
  return {
    id: crypto.randomUUID(),
    name: `Page ${index + 1}`,
    prompt:
      index === 0
        ? "An opening slide for a mortgage startup presentation with a bold hero image, a giant title, and extremely eager sales vibes"
        : "",
    status: "idle",
    note: ""
  };
}

function starterSlides(): Slide[] {
  return [makeSlide(0), makeSlide(1)];
}

export default function Home() {
  const [slides, setSlides] = useState<Slide[]>(starterSlides);
  const [selectedId, setSelectedId] = useState<string>("");
  const [message, setMessage] = useState("Local only. This does not sync anywhere.");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      const fresh = starterSlides();
      setSlides(fresh);
      setSelectedId(fresh[0]?.id ?? "");
      return;
    }

    try {
      const parsed = JSON.parse(saved) as { slides: Slide[]; selectedId: string };

      if (parsed.slides?.length) {
        setSlides(parsed.slides);
        setSelectedId(parsed.selectedId || parsed.slides[0].id);
      }
    } catch {
      const fresh = starterSlides();
      setSlides(fresh);
      setSelectedId(fresh[0]?.id ?? "");
    }

    // Images live in IndexedDB (not localStorage). Load them asynchronously and
    // merge onto the slides we just hydrated from text/metadata.
    getAllImages()
      .then((images) => {
        if (!Object.keys(images).length) {
          return;
        }
        setSlides((current) =>
          current.map((slide) =>
            images[slide.id] ? { ...slide, imageData: images[slide.id] } : slide
          )
        );
      })
      .catch(() => {
        // Best-effort: if IndexedDB is unavailable the deck still works without
        // persisted images.
      });
  }, []);

  useEffect(() => {
    if (!slides.length) {
      return;
    }

    // Persist only text/metadata here. Image blobs are kept out of localStorage
    // (they go to IndexedDB) so this stays tiny and cheap to write on every edit
    // instead of re-serializing megabytes of base64 on each keystroke.
    const lightweightSlides = slides.map((slide) => ({
      id: slide.id,
      name: slide.name,
      prompt: slide.prompt,
      status: slide.status,
      note: slide.note,
      feedback: slide.feedback
    }));

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        slides: lightweightSlides,
        selectedId: selectedId || slides[0].id
      })
    );
  }, [slides, selectedId]);

  const selectedSlide = slides.find((slide) => slide.id === selectedId) ?? slides[0];

  useEffect(() => {
    if (!selectedSlide && slides[0]) {
      setSelectedId(slides[0].id);
    }
  }, [selectedSlide, slides]);

  function patchSlide(id: string, patch: Partial<Slide>) {
    setSlides((current) =>
      current.map((slide) => (slide.id === id ? { ...slide, ...patch } : slide))
    );
  }

  function addSlide() {
    const next = makeSlide(slides.length);
    setSlides((current) => [...current, next]);
    setSelectedId(next.id);
    setMessage("Added another page.");
  }

  function killSlide(id: string) {
    if (slides.length === 1) {
      setMessage("One page is the floor.");
      return;
    }

    const nextSlides = slides.filter((slide) => slide.id !== id);
    setSlides(nextSlides);
    void deleteImage(id);

    if (selectedId === id) {
      setSelectedId(nextSlides[0]?.id ?? "");
    }

    setMessage("A page vanished.");
  }

  async function generateSlide(mode: "fresh" | "again") {
    if (!selectedSlide) {
      return;
    }

    if (!selectedSlide.prompt.trim()) {
      setMessage("Needs a prompt first.");
      patchSlide(selectedSlide.id, { status: "error", feedback: "No prompt." });
      return;
    }

    patchSlide(selectedSlide.id, {
      status: "working",
      feedback: "Talking to Google..."
    });
    setMessage("Cooking an image.");

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt:
          mode === "again"
            ? `${selectedSlide.prompt}\n\nTry a noticeably different composition from the last version.`
            : selectedSlide.prompt
      })
    });

    const payload = (await response.json()) as {
      error?: string;
      imageData?: string;
      text?: string;
    };

    if (!response.ok || !payload.imageData) {
      patchSlide(selectedSlide.id, {
        status: "error",
        feedback: payload.error ?? "Image generation failed."
      });
      setMessage(payload.error ?? "Image generation failed.");
      return;
    }

    patchSlide(selectedSlide.id, {
      imageData: payload.imageData,
      status: "done",
      feedback: payload.text || "Done."
    });
    void putImage(selectedSlide.id, payload.imageData);
    setMessage("New image dropped into the slide.");
  }

  async function exportDeck() {
    if (!slides.length) {
      return;
    }

    setExporting(true);
    setMessage("Packing a .pptx.");

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: "Valon Presentation Takehome Export",
          slides
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Export failed.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "valon-presentation-takehome-export.pptx";
      anchor.click();
      window.URL.revokeObjectURL(url);
      setMessage("Download started.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <p className="eyebrow">Valon Presentation Takehome</p>
          <h1>Slides but worse</h1>
          <button className="loud-button" onClick={addSlide} type="button">
            Box +
          </button>
        </div>

        <div className="slide-list">
          {slides.map((slide, index) => (
            <button
              className={`thumb ${slide.id === selectedSlide?.id ? "active" : ""}`}
              key={slide.id}
              onClick={() => setSelectedId(slide.id)}
              type="button"
            >
              <div className="thumb-art">
                {slide.imageData ? (
                  <img alt={slide.name} src={slide.imageData} />
                ) : (
                  <span>empty-ish</span>
                )}
              </div>
              <div className="thumb-copy">
                <strong>
                  {index + 1}. {slide.name}
                </strong>
                <span>{slide.status}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="editor">
        <div className="top-strip">
          <div>
            <p className="eyebrow">Current page</p>
            <input
              className="name-input"
              onChange={(event) =>
                selectedSlide && patchSlide(selectedSlide.id, { name: event.target.value })
              }
              placeholder="Whatever this slide is called"
              value={selectedSlide?.name ?? ""}
            />
          </div>

          <div className="top-actions">
            <button className="ghost-button" onClick={() => selectedSlide && killSlide(selectedSlide.id)} type="button">
              toss
            </button>
            <button className="ghost-button weird-button" onClick={addSlide} type="button">
              another one
            </button>
            <button className="ghost-button" disabled={exporting} onClick={exportDeck} type="button">
              {exporting ? "packing..." : "PPT-ish"}
            </button>
          </div>
        </div>

        <div className="canvas-wrap">
          <div className="canvas-card">
            {selectedSlide?.imageData ? (
              <img alt={selectedSlide.name} className="slide-image" src={selectedSlide.imageData} />
            ) : (
              <div className="empty-state">
                <p>No image yet.</p>
                <span>Prompt it and something should show up here.</span>
              </div>
            )}
          </div>

          <div className="floating-chip">
            <span>{selectedSlide?.status ?? "idle"}</span>
            <span>{selectedSlide?.feedback ?? "Waiting around."}</span>
          </div>
        </div>

        <div className="bottom-mess">
          <div className="prompt-card">
            <label className="field-label" htmlFor="prompt-box">
              Scene request maybe
            </label>
            <textarea
              id="prompt-box"
              onChange={(event) =>
                selectedSlide && patchSlide(selectedSlide.id, { prompt: event.target.value })
              }
              placeholder="Describe the image you want on this slide."
              rows={7}
              value={selectedSlide?.prompt ?? ""}
            />
          </div>

          <div className="side-controls">
            <button
              className="loud-button"
              disabled={selectedSlide?.status === "working"}
              onClick={() => {
                void generateSlide("fresh");
              }}
              type="button"
            >
              {selectedSlide?.status === "working" ? "wait" : "Cook"}
            </button>
            <button
              className="ghost-button"
              disabled={selectedSlide?.status === "working"}
              onClick={() => {
                void generateSlide("again");
              }}
              type="button"
            >
              Again
            </button>
            <label className="field-label" htmlFor="note-box">
              Tiny note gutter
            </label>
            <textarea
              id="note-box"
              onChange={(event) =>
                selectedSlide && patchSlide(selectedSlide.id, { note: event.target.value })
              }
              placeholder="Notes, maybe."
              rows={5}
              value={selectedSlide?.note ?? ""}
            />
          </div>
        </div>

        <div className="status-bar">{message}</div>
      </section>
    </main>
  );
}
