// Apply a curated deck theme to an EXISTING deck, in place.
//
// Theming normally flows one way — a ThemeSummary is baked into elements by
// buildSlide at generation time — so a deck holds no live theme to swap. This
// module does the reverse pass: it walks every slide and rewrites the *styling*
// (backgrounds, text colors/fonts, surface cards, data-viz colors) to match a
// new theme while preserving all geometry, text, and structure. It is the
// deliberate in-place restyle behind the editor's theme selector.
//
// Tradeoffs (chosen behaviour): colors are overwritten wholesale (one-off
// emphasis colors are not preserved), and title-vs-body is inferred from run
// size since the original slot role isn't stored on the element. Pure and
// framework-free (no store/React imports).

import { getTheme } from "./themes";
import {
  defaultTheme,
  pickReadableColor,
  surfaceColorFor,
  type ThemeSummary
} from "./theme";
import type { Background, Deck, Slide, SlideElement, TextElement } from "./types";

// Mirrors layouts.ts: the accent used by data-viz when a theme omits one.
const DEFAULT_ACCENT = "#2F6DF0";

function normalizeHex(hex: string): string {
  return hex.trim().toLowerCase();
}

// Largest run size in a text element — used to classify the element as a title.
function maxRunSize(el: TextElement): number {
  return el.runs.reduce((max, run) => Math.max(max, run.fontSize), 0);
}

// Restyle one text element. Title elements (the largest text on the slide) take
// the theme's title color/font; everything else takes body styling. Run sizes,
// bold/italic, and text are left untouched — only color and font change.
function restyleText(
  el: TextElement,
  isTitle: boolean,
  theme: ThemeSummary,
  background: Background
): TextElement {
  const color = pickReadableColor(
    background,
    isTitle ? theme.titleColor : theme.bodyColor
  );
  const font = isTitle ? theme.titleFont : theme.bodyFont;
  return {
    ...el,
    runs: el.runs.map((run) => ({ ...run, color, fontFamily: font }))
  };
}

// Restyle one slide's elements against the new theme. `oldSurface` is the prior
// theme's surface color so box cards (shapes filled with it) can be remapped
// without touching user-drawn shapes of other colors.
function restyleSlide(
  slide: Slide,
  theme: ThemeSummary,
  oldSurface: string
): Slide {
  const cardBg: Background = { type: "solid", color: theme.surfaceColor };
  const accent = theme.accent ?? DEFAULT_ACCENT;

  // A slide's title is its largest text; classify against that size.
  const slideMax = slide.elements.reduce(
    (max, el) => (el.type === "text" ? Math.max(max, maxRunSize(el)) : max),
    0
  );

  const elements = slide.elements.map((el): SlideElement => {
    switch (el.type) {
      case "text":
        return restyleText(el, maxRunSize(el) >= slideMax, theme, theme.background);
      case "shape":
        // Only remap box-card surfaces; leave user shapes of other colors alone.
        return normalizeHex(el.fill) === normalizeHex(oldSurface)
          ? { ...el, fill: theme.surfaceColor }
          : el;
      case "kpi":
        return {
          ...el,
          color: pickReadableColor(cardBg, theme.titleColor),
          surface: theme.surfaceColor,
          accent
        };
      case "chart":
        return {
          ...el,
          color: pickReadableColor(cardBg, theme.bodyColor),
          surface: theme.surfaceColor,
          accent
        };
      case "table":
        return {
          ...el,
          color: pickReadableColor(cardBg, theme.bodyColor),
          headerColor: pickReadableColor(cardBg, theme.titleColor),
          surface: theme.surfaceColor,
          accent
        };
      default:
        return el; // images carry no theme styling
    }
  });

  return { ...slide, background: theme.background, elements };
}

// Apply the theme identified by `themeId` to every slide of `deck`, returning a
// new deck (stamped with the new themeId). The deck's prior themeId — or the
// default-light theme generated decks start from — tells us which surface color
// the existing box cards used, so they remap cleanly.
export function applyThemeToDeck(deck: Deck, themeId: string): Deck {
  const theme = getTheme(themeId).summary;
  const oldSurface = deck.themeId
    ? getTheme(deck.themeId).summary.surfaceColor
    : surfaceColorFor(defaultTheme().background);

  return {
    ...deck,
    themeId,
    slides: deck.slides.map((slide) => restyleSlide(slide, theme, oldSurface))
  };
}
