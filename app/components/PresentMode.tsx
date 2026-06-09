"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

import { ARTBOARD_H, ARTBOARD_W, GRADIENT_ANGLE } from "../lib/store";
import type { Background, Slide, SlideElement } from "../lib/types";

function backgroundCss(bg: Background) {
  return bg.type === "solid"
    ? bg.color
    : `linear-gradient(${GRADIENT_ANGLE}deg, ${bg.from}, ${bg.to})`;
}

function PresentElement({ element }: { element: SlideElement }) {
  const frame: CSSProperties = {
    position: "absolute",
    left: element.x,
    top: element.y,
    width: element.w,
    height: element.h,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    zIndex: element.z,
  };

  if (element.type === "text") {
    return (
      <div
        style={{
          ...frame,
          textAlign: element.align,
          lineHeight: 1.2,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflow: "hidden",
        }}
      >
        {element.runs.map((run, i) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            style={{
              color: run.color,
              fontSize: run.fontSize,
              fontWeight: run.bold ? 700 : 400,
              fontStyle: run.italic ? "italic" : "normal",
              fontFamily: run.fontFamily ?? undefined,
            }}
          >
            {run.text}
          </span>
        ))}
      </div>
    );
  }

  if (element.type === "image") {
    return (
      <div style={{ ...frame, overflow: "hidden", background: "#e9ecf1" }}>
        {element.src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            src={element.src}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        ...frame,
        background: element.fill,
        borderRadius: element.shape === "ellipse" ? "50%" : element.radius,
      }}
    />
  );
}

interface PresentModeProps {
  slides: Slide[];
  initialIndex: number;
  onExit: () => void;
}

export function PresentMode({ slides, initialIndex, onExit }: PresentModeProps) {
  const [current, setCurrent] = useState(initialIndex);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setScale(Math.min(width / ARTBOARD_W, height / ARTBOARD_H));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    overlayRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    function onChange() {
      if (!document.fullscreenElement) onExit();
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [onExit]);

  const prev = useCallback(() => setCurrent((c) => Math.max(0, c - 1)), []);
  const next = useCallback(
    () => setCurrent((c) => Math.min(slides.length - 1, c + 1)),
    [slides.length]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape" && !document.fullscreenElement) {
        onExit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onExit]);

  function handleExit() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => onExit());
    } else {
      onExit();
    }
  }

  const slide = slides[current];
  if (!slide) return null;

  const stageW = ARTBOARD_W * scale;
  const stageH = ARTBOARD_H * scale;

  return (
    <div className="present-overlay" ref={overlayRef}>
      <div className="present-stage" style={{ width: stageW, height: stageH }}>
        <div
          style={{
            width: ARTBOARD_W,
            height: ARTBOARD_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            background: backgroundCss(slide.background),
          }}
        >
          {slide.elements.map((el) => (
            <PresentElement element={el} key={el.id} />
          ))}
        </div>
      </div>

      <button
        aria-label="Previous slide"
        className="present-nav present-nav-prev"
        disabled={current === 0}
        onClick={prev}
        type="button"
      />
      <button
        aria-label="Next slide"
        className="present-nav present-nav-next"
        disabled={current === slides.length - 1}
        onClick={next}
        type="button"
      />

      <div className="present-hud">
        <span className="present-counter">
          {current + 1} / {slides.length}
        </span>
        <button
          aria-label="Exit presentation"
          className="present-exit-btn"
          onClick={handleExit}
          type="button"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
