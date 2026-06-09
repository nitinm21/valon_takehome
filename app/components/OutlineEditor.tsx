"use client";

import type { Outline, OutlineLayout } from "../lib/types";

// The editable deck outline. Users tweak titles + bullet points, add/remove/
// reorder slides, and (optionally) override the auto-assigned layout, then hit
// "Generate deck". Slide 1 is the fixed title slide.

const MIN_SLIDES = 1;
const MAX_SLIDES = 10;

const CONTENT_LAYOUTS: OutlineLayout[] = [
  "bullets",
  "paragraph",
  "boxes",
  "two-col-image"
];

const LAYOUT_LABELS: Record<OutlineLayout, string> = {
  cover: "Title slide",
  bullets: "Bullets",
  paragraph: "Paragraph",
  boxes: "Boxes",
  "two-col-image": "Image + text"
};

export function OutlineEditor({
  outline,
  onChange,
  onBack,
  onGenerate
}: {
  outline: Outline;
  onChange: (next: Outline) => void;
  onBack: () => void;
  onGenerate: () => void;
}) {
  const slides = outline.slides;

  function update(next: Partial<Outline>) {
    onChange({ ...outline, ...next });
  }

  function mapSlides(fn: (slides: Outline["slides"]) => Outline["slides"]) {
    update({ slides: fn(slides.map((slide) => ({ ...slide, bullets: [...slide.bullets] }))) });
  }

  function setDeckTitle(deckTitle: string) {
    update({ deckTitle });
  }

  function setSlideTitle(index: number, title: string) {
    mapSlides((s) => {
      s[index].title = title;
      return s;
    });
  }

  function setLayout(index: number, layout: OutlineLayout) {
    mapSlides((s) => {
      s[index].layout = layout;
      return s;
    });
  }

  function setBullet(index: number, bulletIndex: number, text: string) {
    mapSlides((s) => {
      s[index].bullets[bulletIndex] = text;
      return s;
    });
  }

  function addBullet(index: number) {
    mapSlides((s) => {
      s[index].bullets.push("");
      return s;
    });
  }

  function removeBullet(index: number, bulletIndex: number) {
    mapSlides((s) => {
      s[index].bullets.splice(bulletIndex, 1);
      return s;
    });
  }

  function addSlide() {
    if (slides.length >= MAX_SLIDES) {
      return;
    }
    mapSlides((s) => {
      s.push({ title: "New slide", bullets: ["New point"], layout: "bullets" });
      return s;
    });
  }

  function removeSlide(index: number) {
    if (slides.length <= MIN_SLIDES) {
      return;
    }
    mapSlides((s) => {
      s.splice(index, 1);
      return s;
    });
  }

  function moveSlide(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= slides.length) {
      return;
    }
    mapSlides((s) => {
      const [moved] = s.splice(index, 1);
      s.splice(target, 0, moved);
      return s;
    });
  }

  return (
    <div className="outline">
      <div className="outline-head">
        <button className="link-btn" onClick={onBack} type="button">
          ← Back
        </button>
        <input
          aria-label="Deck title"
          className="outline-deck-title"
          onChange={(event) => setDeckTitle(event.target.value)}
          value={outline.deckTitle}
        />
        <span className="outline-count">
          {slides.length} slide{slides.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="outline-list">
        {slides.map((slide, index) => {
          const isCover = index === 0 && slide.layout === "cover";
          return (
            <div className="outline-card" key={index}>
              <div className="outline-num">{index + 1}</div>

              <div className="outline-body">
                <div className="outline-card-top">
                  <input
                    aria-label={`Slide ${index + 1} title`}
                    className="outline-title-input"
                    onChange={(event) => setSlideTitle(index, event.target.value)}
                    placeholder="Slide title"
                    value={slide.title}
                  />
                  {isCover ? (
                    <span className="outline-layout-tag">Title slide</span>
                  ) : (
                    <select
                      aria-label={`Slide ${index + 1} layout`}
                      className="outline-layout-select"
                      onChange={(event) =>
                        setLayout(index, event.target.value as OutlineLayout)
                      }
                      value={slide.layout}
                    >
                      {CONTENT_LAYOUTS.map((layout) => (
                        <option key={layout} value={layout}>
                          {LAYOUT_LABELS[layout]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="outline-bullets">
                  {slide.bullets.map((bullet, bulletIndex) => (
                    <div className="outline-bullet-row" key={bulletIndex}>
                      <span className="outline-bullet-dot" aria-hidden />
                      <input
                        aria-label={`Slide ${index + 1} point ${bulletIndex + 1}`}
                        className="outline-bullet-input"
                        onChange={(event) =>
                          setBullet(index, bulletIndex, event.target.value)
                        }
                        placeholder={isCover ? "Subtitle (optional)" : "Point"}
                        value={bullet}
                      />
                      <button
                        aria-label="Remove point"
                        className="outline-bullet-remove"
                        onClick={() => removeBullet(index, bulletIndex)}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    className="outline-add-bullet"
                    onClick={() => addBullet(index)}
                    type="button"
                  >
                    + {isCover ? "Add subtitle" : "Add point"}
                  </button>
                </div>
              </div>

              <div className="outline-card-actions">
                <button
                  aria-label="Move up"
                  className="outline-icon-btn"
                  disabled={index === 0}
                  onClick={() => moveSlide(index, -1)}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label="Move down"
                  className="outline-icon-btn"
                  disabled={index === slides.length - 1}
                  onClick={() => moveSlide(index, 1)}
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label="Delete slide"
                  className="outline-icon-btn outline-icon-danger"
                  disabled={slides.length <= MIN_SLIDES}
                  onClick={() => removeSlide(index)}
                  type="button"
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}

        {slides.length < MAX_SLIDES && (
          <button className="outline-add-slide" onClick={addSlide} type="button">
            + Add slide
          </button>
        )}
      </div>

      <div className="outline-footer">
        <button className="btn btn-primary btn-lg" onClick={onGenerate} type="button">
          ✨ Generate deck
        </button>
      </div>
    </div>
  );
}
