"use client";

import { fontStack } from "../lib/fonts";
import { THEMES } from "../lib/themes";
import type { Background } from "../lib/types";

const ANGLE = 135;

function bgCss(background: Background) {
  return background.type === "solid"
    ? background.color
    : `linear-gradient(${ANGLE}deg, ${background.from}, ${background.to})`;
}

// The deck theme gallery shown in the create flow. Each tile IS the theme's
// background with sample Title/Body in the theme's own fonts/colors — so the
// choice reads at a glance. Picking one styles the generated deck.
export function ThemePicker({
  selectedId,
  onSelect
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="theme-picker">
      {THEMES.map((theme) => {
        const s = theme.summary;
        const selected = theme.id === selectedId;
        return (
          <button
            aria-pressed={selected}
            className={`theme-card ${selected ? "selected" : ""}`}
            key={theme.id}
            onClick={() => onSelect(theme.id)}
            title={theme.useCase}
            type="button"
          >
            <span className="theme-tile" style={{ background: bgCss(s.background) }}>
              <span
                className="theme-tile-title"
                style={{
                  fontFamily: fontStack(s.titleFont),
                  color: s.titleColor,
                  fontWeight: s.titleBold ? 700 : 400
                }}
              >
                Title
              </span>
              <span
                className="theme-tile-body"
                style={{ fontFamily: fontStack(s.bodyFont), color: s.bodyColor }}
              >
                Body
              </span>
            </span>
            <span className="theme-name">
              {selected && (
                <span className="theme-check" aria-hidden>
                  ✓
                </span>
              )}
              {theme.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
