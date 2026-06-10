"use client";

import type { CSSProperties } from "react";

import { ARTBOARD_H, ARTBOARD_W, GRADIENT_ANGLE } from "../lib/store";
import type { Background, Slide, SlideElement } from "../lib/types";
import { DataVizView } from "./DataVizViews";

export const THUMB_W = 160;
export const THUMB_H = (THUMB_W * ARTBOARD_H) / ARTBOARD_W; // 90 at 16:9

function backgroundCss(background: Background) {
  return background.type === "solid"
    ? background.color
    : `linear-gradient(${GRADIENT_ANGLE}deg, ${background.from}, ${background.to})`;
}

// A non-interactive copy of an element for the thumbnail (no handlers, no edit
// UI, no prompt box) — just enough to read the slide at a glance.
function ThumbElement({ element }: { element: SlideElement }) {
  const frame: CSSProperties = {
    position: "absolute",
    left: element.x,
    top: element.y,
    width: element.w,
    height: element.h,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    zIndex: element.z
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
          overflow: "hidden"
        }}
      >
        {element.runs.map((run, index) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            style={{
              color: run.color,
              fontSize: run.fontSize,
              fontWeight: run.bold ? 700 : 400,
              fontStyle: run.italic ? "italic" : "normal"
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

  if (element.type === "kpi" || element.type === "chart" || element.type === "table") {
    return (
      <div style={frame}>
        <DataVizView element={element} />
      </div>
    );
  }

  return (
    <div
      style={{
        ...frame,
        background: element.fill,
        borderRadius: element.shape === "ellipse" ? "50%" : element.radius
      }}
    />
  );
}

// Renders a slide scaled down into a fixed THUMB_W×THUMB_H box, reusing the same
// 1280×720 logical coordinates as the editor so it's pixel-faithful.
export function SlideThumb({ slide }: { slide: Slide }) {
  const scale = THUMB_W / ARTBOARD_W;

  // While a generated slide is still streaming in, show a tiny shimmer instead of
  // the (empty) elements.
  if (slide.pending) {
    return (
      <div className="thumb thumb-pending" style={{ width: THUMB_W, height: THUMB_H }}>
        <span className="thumb-pending-spinner" aria-hidden />
      </div>
    );
  }

  return (
    <div className="thumb" style={{ width: THUMB_W, height: THUMB_H }}>
      <div
        className="thumb-scale"
        style={{
          width: ARTBOARD_W,
          height: ARTBOARD_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          background: backgroundCss(slide.background)
        }}
      >
        {slide.elements.map((element) => (
          <ThumbElement element={element} key={element.id} />
        ))}
      </div>
    </div>
  );
}
