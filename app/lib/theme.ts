// Theme inference for AI slide generation.
//
// There is no deck-level theme object: background is per-slide and each text box
// carries its own color/size. So we DERIVE a compact summary from whatever the
// user has already built, and feed that to the slide builder (and, later, to the
// LLM as context) so a new slide matches the existing look. Pure and
// framework-free — no store/React imports — so it can run on the client today
// and on the server (the future /api/generate-slide route) unchanged.

import type {
  Background,
  Deck,
  SlideElement,
  TextElement,
  TextRun
} from "./types";

export type ThemeSummary = {
  background: Background; // most common background across slides
  surfaceColor: string; // subtle card/panel tint on the background (Boxes style)
  palette: string[]; // distinct colors seen (text/shape/background)
  titleColor: string;
  bodyColor: string;
  titleSize: number; // logical px
  bodySize: number; // logical px
  titleBold: boolean;
  align: "left" | "center" | "right";
};

const DEFAULT_BG: Background = { type: "solid", color: "#ffffff" };

function isText(el: SlideElement): el is TextElement {
  return el.type === "text";
}

// ---- color math (WCAG relative luminance) ---------------------------------

function expandHex(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return h.slice(0, 6).padEnd(6, "0");
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(expandHex(hex), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function blend(a: string, b: string): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return `#${toHexByte((r1 + r2) / 2)}${toHexByte((g1 + g2) / 2)}${toHexByte(
    (b1 + b2) / 2
  )}`;
}

/** A single representative color for a background (gradients are averaged). */
export function representativeColor(bg: Background): string {
  return bg.type === "solid" ? bg.color : blend(bg.from, bg.to);
}

// Linear interpolation between two hex colors (t in [0,1]).
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return `#${toHexByte(r1 + (r2 - r1) * t)}${toHexByte(g1 + (g2 - g1) * t)}${toHexByte(
    b1 + (b2 - b1) * t
  )}`;
}

// A subtle card/panel tint that sits on the background, for the Boxes style.
// Light decks get a slightly darker neutral; dark decks get a lighter panel, so
// cards read as raised surfaces either way.
function surfaceFor(bg: Background): string {
  const base = representativeColor(bg);
  return luminance(base) > 0.5
    ? mix(base, "#000000", 0.06)
    : mix(base, "#ffffff", 0.14);
}

// Returns `preferred` if it reads acceptably on the background, otherwise the
// black/white that contrasts best. 3:1 is the WCAG floor for large text, which
// is what slide copy effectively is. Stops the deck's color landing as dark text
// on a dark generated background.
export function pickReadableColor(bg: Background, preferred: string): string {
  const base = representativeColor(bg);
  if (contrastRatio(preferred, base) >= 3) {
    return preferred;
  }
  return contrastRatio("#ffffff", base) >= contrastRatio("#111111", base)
    ? "#ffffff"
    : "#111111";
}

// ---- theme derivation ------------------------------------------------------

function dominantBackground(deck: Deck): Background {
  const counts = new Map<string, { bg: Background; n: number }>();
  for (const slide of deck.slides) {
    const key = JSON.stringify(slide.background);
    const cur = counts.get(key);
    if (cur) {
      cur.n += 1;
    } else {
      counts.set(key, { bg: slide.background, n: 1 });
    }
  }
  let best: { bg: Background; n: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.n > best.n) {
      best = entry;
    }
  }
  return best?.bg ?? DEFAULT_BG;
}

function dominantAlign(texts: TextElement[]): "left" | "center" | "right" {
  const counts: Record<string, number> = {};
  for (const t of texts) {
    counts[t.align] = (counts[t.align] ?? 0) + 1;
  }
  let best: "left" | "center" | "right" = "left";
  let n = 0;
  for (const align of ["left", "center", "right"] as const) {
    if ((counts[align] ?? 0) > n) {
      n = counts[align];
      best = align;
    }
  }
  return best;
}

// Most-used run color (text styling now lives per-run, not per-element). Empty
// runs are skipped so placeholder spans don't skew the result.
function modeColor(runs: TextRun[]): string | null {
  const counts = new Map<string, number>();
  for (const run of runs) {
    if (!run.text.trim()) {
      continue;
    }
    counts.set(run.color, (counts.get(run.color) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [color, k] of counts) {
    if (k > n) {
      n = k;
      best = color;
    }
  }
  return best;
}

function distinctColors(deck: Deck): string[] {
  const set = new Set<string>();
  for (const slide of deck.slides) {
    if (slide.background.type === "solid") {
      set.add(slide.background.color);
    } else {
      set.add(slide.background.from);
      set.add(slide.background.to);
    }
    for (const el of slide.elements) {
      if (el.type === "text") {
        for (const run of el.runs) {
          set.add(run.color);
        }
      } else if (el.type === "shape") {
        set.add(el.fill);
      }
    }
  }
  return Array.from(set).slice(0, 6);
}

// Build a compact theme from the deck. Representative — not exhaustive — so it
// stays small (cheap LLM context later) and resists overfitting: title size is
// the largest text seen, body size the median of the smaller text, and an empty
// deck falls back to sensible defaults.
export function deriveTheme(deck: Deck): ThemeSummary {
  const texts = deck.slides.flatMap((slide) => slide.elements).filter(isText);
  const runs = texts.flatMap((t) => t.runs);
  const sizes = runs.map((r) => r.fontSize).sort((a, b) => a - b);

  const titleSize = sizes.length ? sizes[sizes.length - 1] : 48;
  const smaller = sizes.filter((s) => s < titleSize);
  const bodySize = smaller.length
    ? smaller[Math.floor((smaller.length - 1) / 2)]
    : Math.max(20, Math.round(titleSize * 0.45));

  // The largest run defines the "title" style (its color + weight).
  const titleRun = runs.reduce<TextRun | null>(
    (best, r) => (!best || r.fontSize > best.fontSize ? r : best),
    null
  );

  const background = dominantBackground(deck);

  return {
    background,
    surfaceColor: surfaceFor(background),
    palette: distinctColors(deck),
    titleColor: titleRun?.color ?? "#111111",
    bodyColor: modeColor(runs) ?? "#333333",
    titleSize,
    bodySize: Math.min(bodySize, titleSize),
    titleBold: titleRun?.bold ?? true,
    align: dominantAlign(texts)
  };
}
