"use client";

import { DEFAULT_GRADIENT, GRADIENT_ANGLE, useEditor } from "../lib/store";
import type { Background } from "../lib/types";

const SOLID_PRESETS = ["#ffffff", "#f4f5f7", "#111827", "#0f2740", "#fdeccb", "#e8f0e6"];

const GRADIENT_PRESETS: Array<{ from: string; to: string }> = [
  { from: "#6a8dff", to: "#c081ff" },
  { from: "#ff9a8b", to: "#ff6a88" },
  { from: "#43e97b", to: "#38f9d7" },
  { from: "#0f2027", to: "#2c5364" }
];

function gradientCss(from: string, to: string) {
  return `linear-gradient(${GRADIENT_ANGLE}deg, ${from}, ${to})`;
}

// Right-side panel for per-slide customization. Phase 4 holds the Background
// section (solid color or a two-color gradient with a fixed angle).
export function SlidePanel({ onClose }: { onClose: () => void }) {
  const background = useEditor((state) => state.currentSlide().background);
  const setBackground = useEditor((state) => state.setBackground);

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
          <label className="color-row">
            <span>Color</span>
            <input
              onChange={(event) =>
                setBackground({ type: "solid", color: event.target.value })
              }
              type="color"
              value={background.color}
            />
          </label>
        ) : (
          <>
            <label className="color-row">
              <span>From</span>
              <input
                onChange={(event) =>
                  setBackground({ ...background, from: event.target.value })
                }
                type="color"
                value={background.from}
              />
            </label>
            <label className="color-row">
              <span>To</span>
              <input
                onChange={(event) =>
                  setBackground({ ...background, to: event.target.value })
                }
                type="color"
                value={background.to}
              />
            </label>
          </>
        )}

        <p className="panel-hint">Presets</p>
        <div className="swatches">
          {SOLID_PRESETS.map((color) => (
            <button
              aria-label={`Solid ${color}`}
              className="swatch"
              key={color}
              onClick={() => setBackground({ type: "solid", color })}
              style={{ background: color }}
              type="button"
            />
          ))}
          {GRADIENT_PRESETS.map((preset) => (
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
