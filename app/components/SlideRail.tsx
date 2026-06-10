"use client";

import { useState, type DragEvent } from "react";

import { useEditor } from "../lib/store";
import { SlideThumb } from "./SlideThumb";

// Left-hand slide rail: add, select, delete, and drag-to-reorder slides.
export function SlideRail() {
  const slides = useEditor((state) => state.deck.slides);
  const selectedSlideId = useEditor((state) => state.deck.selectedSlideId);
  const addSlide = useEditor((state) => state.addSlide);
  const selectSlide = useEditor((state) => state.selectSlide);
  const deleteSlide = useEditor((state) => state.deleteSlide);
  const reorderSlides = useEditor((state) => state.reorderSlides);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const canDelete = slides.length > 1;

  function handleDrop(index: number) {
    if (dragIndex !== null) {
      reorderSlides(dragIndex, index);
    }
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <aside className="slide-rail">
      <button className="add-slide" onClick={addSlide} type="button">
        + Add slide
      </button>

      <div className="rail-list">
        {slides.map((slide, index) => (
          <div
            className={`rail-item ${slide.id === selectedSlideId ? "active" : ""} ${
              overIndex === index && dragIndex !== index ? "drag-over" : ""
            }`}
            draggable
            key={slide.id}
            onClick={() => selectSlide(slide.id)}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragOver={(event: DragEvent) => {
              event.preventDefault();
              setOverIndex(index);
            }}
            onDragStart={(event: DragEvent) => {
              setDragIndex(index);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDrop={() => handleDrop(index)}
          >
            <span className="rail-num">{index + 1}</span>
            <div className="rail-thumb-wrap">
              <SlideThumb slide={slide} />
              {canDelete && (
                <button
                  aria-label={`Delete slide ${index + 1}`}
                  className="rail-delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteSlide(slide.id);
                  }}
                  type="button"
                >
                  <svg viewBox="0 0 12 12" aria-hidden focusable="false">
                    <path
                      d="M3 3 L9 9 M9 3 L3 9"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
