"use client";

import { useState } from "react";

import { ColorPicker } from "./ColorPicker";
import { DEFAULT_GRADIENT, GRADIENT_ANGLE, useEditor } from "../lib/store";
import type { Background } from "../lib/types";

const SOLID_PRESETS = [
  // Grayscale ramp
  "#000000", "#4d4d4d", "#666666", "#959595", "#b7b7b7", "#dcdcdc", "#ffffff",
  // Reds → pinks → purples
  "#e8423a", "#e35d54", "#ee5fa6", "#d6abe3", "#b45fd4", "#6d52ee", "#5722e0",
  // Teals → blues
  "#3c89a3", "#54b3d3", "#8ce3e0", "#5aa7ee", "#4d6cee", "#1f4a9e", "#0e10b4",
  // Greens → yellows → oranges
  "#4caf70", "#80c95c", "#c8ee88", "#f4d25c", "#eeb85c", "#df9058", "#e67e38"
];

const GRADIENT_PRESETS: Array<{ from: string; to: string }> = [
  // Row 1 — neutrals & deep tones
  { from: "#3a3a3a", to: "#000000" },
  { from: "#1f1f1f", to: "#9a9a9a" },
  { from: "#f0f0f0", to: "#cfcfcf" },
  { from: "#a6e072", to: "#7cc456" },
  { from: "#8a6d18", to: "#2e2407" },
  { from: "#7a4a9a", to: "#e0b85a" },
  { from: "#2a2a5e", to: "#0a0a24" },
  // Row 2 — cools
  { from: "#dff0f5", to: "#bcdfe8" },
  { from: "#f0623a", to: "#e23a2a" },
  { from: "#e8588a", to: "#8a4ad0" },
  { from: "#7a6ae0", to: "#5546c8" },
  { from: "#3a4ad0", to: "#2330a8" },
  { from: "#6a5ae0", to: "#4a8ad0" },
  { from: "#4a8ad0", to: "#5ab8d4" },
  // Row 3 — greens, warms & pinks
  { from: "#4ac88a", to: "#2f7fc8" },
  { from: "#34c0a0", to: "#5ac86e" },
  { from: "#5ac0b0", to: "#e8aa5a" },
  { from: "#f2aa5c", to: "#e8c06a" },
  { from: "#e87aa8", to: "#cf5896" },
  { from: "#f3d2da", to: "#f8e4ec" },
  { from: "#9a6ad0", to: "#e07ab0" }
];

function gradientCss(from: string, to: string) {
  return `linear-gradient(${GRADIENT_ANGLE}deg, ${from}, ${to})`;
}

// Right-side panel for per-slide customization. Phase 4 holds the Background
// section (solid color or a two-color gradient with a fixed angle).
export function SlidePanel({ onClose }: { onClose: () => void }) {
  const background = useEditor((state) => state.currentSlide().background);
  const setBackground = useEditor((state) => state.setBackground);

  // Which gradient stop the picker edits while in gradient mode.
  const [activeStop, setActiveStop] = useState<"from" | "to">("from");

  const isGradient = background.type === "gradient";

  function chooseType(type: Background["type"]) {
    if (type === background.type) {
      return;
    }
    if (type === "solid") {
      setBackground({
        type: "solid",
        color: background.type === "gradient" ? background.from : "#ffffff"
      });
    } else {
      setBackground({
        type: "gradient",
        from: background.type === "solid" ? background.color : DEFAULT_GRADIENT.from,
        to: DEFAULT_GRADIENT.to,
        angle: GRADIENT_ANGLE
      });
    }
  }

  return (
    <aside className="slide-panel" data-toolbar>
      <header className="panel-head">
        <h2>Slide</h2>
        <button aria-label="Close panel" className="panel-close" onClick={onClose} type="button">
          ×
        </button>
      </header>

      <section className="panel-section">
        <h3>Background</h3>

        <div className="seg">
          <button
            className={`seg-btn ${!isGradient ? "active" : ""}`}
            onClick={() => chooseType("solid")}
            type="button"
          >
            Solid
          </button>
          <button
            className={`seg-btn ${isGradient ? "active" : ""}`}
            onClick={() => chooseType("gradient")}
            type="button"
          >
            Gradient
          </button>
        </div>

        {background.type === "solid" ? (
          <ColorPicker
            onChange={(color) => setBackground({ type: "solid", color })}
            value={background.color}
          />
        ) : (
          <>
            <div className="cp-stops">
              <button
                aria-label="Edit gradient start color"
                className={`cp-stop ${activeStop === "from" ? "active" : ""}`}
                onClick={() => setActiveStop("from")}
                style={{ background: background.from }}
                type="button"
              />
              <button
                aria-label="Edit gradient end color"
                className={`cp-stop ${activeStop === "to" ? "active" : ""}`}
                onClick={() => setActiveStop("to")}
                style={{ background: background.to }}
                type="button"
              />
            </div>
            <ColorPicker
              onChange={(color) =>
                setBackground(
                  activeStop === "from"
                    ? { ...background, from: color }
                    : { ...background, to: color }
                )
              }
              value={activeStop === "from" ? background.from : background.to}
            />
          </>
        )}

        <p className="panel-hint">Presets</p>
        <div className="swatches">
          {background.type === "solid"
            ? SOLID_PRESETS.map((color) => (
                <button
                  aria-label={`Solid ${color}`}
                  className="swatch"
                  key={color}
                  onClick={() => setBackground({ type: "solid", color })}
                  style={{ background: color }}
                  type="button"
                />
              ))
            : GRADIENT_PRESETS.map((preset) => (
                <button
                  aria-label="Gradient preset"
                  className="swatch"
                  key={`${preset.from}-${preset.to}`}
                  onClick={() =>
                    setBackground({
                      type: "gradient",
                      from: preset.from,
                      to: preset.to,
                      angle: GRADIENT_ANGLE
                    })
                  }
                  style={{ background: gradientCss(preset.from, preset.to) }}
                  type="button"
                />
              ))}
        </div>
      </section>
    </aside>
  );
}
