// Rich-text engine for text boxes.
//
// A text box is an ordered list of styled `TextRun`s (see types.ts). While a box
// is being edited it lives as native contentEditable DOM (spans with inline
// styles); this module is the bridge:
//   - runsToFragment / serializeDomToRuns convert between runs and that DOM,
//   - applyInlineStyleToSelection / selection readers drive the toolbar.
// Bold/italic/color are applied with document.execCommand (styleWithCSS); only
// font size needs a custom span-wrap since execCommand has no px size.

import {
  DEFAULT_FONT_ID,
  fontIdFromCss,
  fontVarToken
} from "./fonts";
import type { TextRun } from "./types";

export type RunStyle = Omit<TextRun, "text">;

// Style applied to a brand-new box's first run (mirrors the editor's old
// element-level defaults).
export const DEFAULT_RUN_STYLE: RunStyle = {
  fontSize: 48,
  color: "#111111",
  bold: false,
  italic: false,
  fontFamily: DEFAULT_FONT_ID
};

// The font-size quick-pick list (matches the size dropdown). Custom values are
// still allowed via the input, clamped to [MIN_FONT, MAX_FONT].
export const FONT_SIZES = [18, 20, 24, 28, 32, 36, 48, 64, 80, 120, 180];
export const MIN_FONT = 8;
export const MAX_FONT = 400;

export type TextStyleId =
  | "title"
  | "headline"
  | "subheadline"
  | "normal"
  | "small";

// Quick-apply presets. Picking one sets size + weight on the selection (or the
// whole box). There is no stored "style" field — the toolbar label is derived
// by reverse-lookup (deriveStyleLabel), so it never disagrees with the text.
export const TEXT_STYLES: {
  id: TextStyleId;
  label: string;
  fontSize: number;
  bold: boolean;
}[] = [
  { id: "title", label: "Title", fontSize: 120, bold: true },
  { id: "headline", label: "Headline", fontSize: 80, bold: true },
  { id: "subheadline", label: "Subheadline", fontSize: 48, bold: true },
  { id: "normal", label: "Normal text", fontSize: 24, bold: false },
  { id: "small", label: "Small text", fontSize: 18, bold: false }
];

// Reverse-lookup for the "Text styles" trigger. Returns the matching preset name
// when the selection is uniform and matches one, else "Normal text" as the
// neutral default (incl. mixed selections, where fontSize/bold come in as null).
export function deriveStyleLabel(
  fontSize: number | null,
  bold: boolean | null
): string {
  if (fontSize === null || bold === null) {
    return "Normal text";
  }
  const match = TEXT_STYLES.find(
    (style) => style.fontSize === fontSize && style.bold === bold
  );
  return match ? match.label : "Normal text";
}

export function clampFont(value: number): number {
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(value)));
}

// Step to the next/previous size in FONT_SIZES (the stepper arrows). Snaps to the
// list rather than ±1 — e.g. 18 → 20 → 24 up, 24 → 20 down. A custom value jumps
// to the nearest list size in that direction; at the ends it holds.
export function stepFontSize(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return FONT_SIZES.find((size) => size > current) ?? current;
  }
  return [...FONT_SIZES].reverse().find((size) => size < current) ?? current;
}

export function runsText(runs: TextRun[]): string {
  return runs.map((run) => run.text).join("");
}

// rgb(...)/rgba(...) -> #rrggbb. Pass-through for values already hex.
export function toHex(input: string): string {
  if (!input) {
    return "#000000";
  }
  if (input.startsWith("#")) {
    return input.length === 4
      ? `#${input[1]}${input[1]}${input[2]}${input[2]}${input[3]}${input[3]}`
      : input.toLowerCase();
  }
  const parts = input.match(/\d+/g);
  if (!parts || parts.length < 3) {
    return "#000000";
  }
  return (
    "#" +
    parts
      .slice(0, 3)
      .map((n) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function isBoldWeight(weight: string): boolean {
  if (weight === "bold" || weight === "bolder") {
    return true;
  }
  const numeric = parseInt(weight, 10);
  return !Number.isNaN(numeric) && numeric >= 600;
}

// ---- runs <-> DOM --------------------------------------------------------

// Build the contentEditable's initial DOM: one styled <span> per run. New lines
// live as "\n" inside run text and render via `white-space: pre-wrap`.
export function runsToFragment(runs: TextRun[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const list = runs.length ? runs : [{ text: "", ...DEFAULT_RUN_STYLE }];
  for (const run of list) {
    const span = document.createElement("span");
    span.style.fontSize = `${run.fontSize}px`;
    span.style.color = run.color;
    span.style.fontWeight = run.bold ? "700" : "400";
    span.style.fontStyle = run.italic ? "italic" : "normal";
    span.style.fontFamily = fontVarToken(run.fontFamily);
    span.textContent = run.text;
    fragment.appendChild(span);
  }
  return fragment;
}

// The effective style of a text node: climb ancestors up to (and including)
// `root`, taking the nearest (innermost) set value for each property so a
// sub-range override wins over an outer one. Tag fallbacks (<b>/<strong>,
// <i>/<em>) cover pasted markup; styleWithCSS keeps our own edits inline.
function computeStyle(
  textNode: Node,
  root: HTMLElement,
  fallback: RunStyle
): RunStyle {
  let fontSize: number | undefined;
  let color: string | undefined;
  let bold: boolean | undefined;
  let italic: boolean | undefined;
  let fontFamily: string | undefined;

  let node: HTMLElement | null = textNode.parentElement;
  while (node) {
    const style = node.style;
    if (fontSize === undefined && style.fontSize) {
      fontSize = Math.round(parseFloat(style.fontSize));
    }
    if (color === undefined && style.color) {
      color = toHex(style.color);
    }
    if (fontFamily === undefined && style.fontFamily) {
      const id = fontIdFromCss(style.fontFamily);
      if (id) {
        fontFamily = id;
      }
    }
    if (bold === undefined) {
      if (style.fontWeight) {
        bold = isBoldWeight(style.fontWeight);
      } else if (node.tagName === "B" || node.tagName === "STRONG") {
        bold = true;
      }
    }
    if (italic === undefined) {
      if (style.fontStyle) {
        italic = style.fontStyle === "italic";
      } else if (node.tagName === "I" || node.tagName === "EM") {
        italic = true;
      }
    }
    if (node === root) {
      break;
    }
    node = node.parentElement;
  }

  return {
    fontSize: fontSize ?? fallback.fontSize,
    color: color ?? fallback.color,
    bold: bold ?? fallback.bold,
    italic: italic ?? fallback.italic,
    fontFamily: fontFamily ?? fallback.fontFamily ?? DEFAULT_FONT_ID
  };
}

function sameStyle(a: RunStyle, b: RunStyle): boolean {
  return (
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.fontFamily === b.fontFamily
  );
}

// Walk every text node in document order, resolve its effective style, and merge
// adjacent runs that share a style. Newlines are preserved as "\n" inside text.
// <br> elements (inserted by insertLineBreak on Enter) are treated as "\n" so
// they survive the commit cycle — SHOW_TEXT alone skips element nodes entirely.
export function serializeDomToRuns(
  root: HTMLElement,
  fallback: RunStyle
): TextRun[] {
  const runs: TextRun[] = [];
  const push = (text: string, style: RunStyle) => {
    if (!text) {
      return;
    }
    const last = runs[runs.length - 1];
    if (last && sameStyle(last, style)) {
      last.text += text;
    } else {
      runs.push({ text, ...style });
    }
  };

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node: Node) {
        if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
        if (node instanceof HTMLElement && node.tagName === "BR") return NodeFilter.FILTER_ACCEPT;
        // Skip the element itself but still descend into its children (spans, etc.)
        return NodeFilter.FILTER_SKIP;
      }
    }
  );

  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      push(node.textContent ?? "", computeStyle(node, root, fallback));
    } else {
      // <br> element → newline, inherit style from surrounding context
      push("\n", computeStyle(node, root, fallback));
    }
    node = walker.nextNode();
  }
  return runs;
}

// ---- selection edits (editing mode) --------------------------------------

// Apply a single inline CSS property to the current selection by wrapping it in
// a fresh span, then stripping that property from descendants so the new outer
// value wins (the serializer reads innermost-first). No-op on a collapsed caret.
export function applyInlineStyleToSelection(
  property: string,
  value: string
): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }
  const range = selection.getRangeAt(0);
  const span = document.createElement("span");
  span.style.setProperty(property, value);
  span.appendChild(range.extractContents());
  span.querySelectorAll("*").forEach((node) => {
    if (node instanceof HTMLElement) {
      node.style.removeProperty(property);
    }
  });
  range.insertNode(span);

  selection.removeAllRanges();
  const reselect = document.createRange();
  reselect.selectNodeContents(span);
  selection.addRange(reselect);
}

// The uniform font size of the current selection, or null if it spans multiple
// sizes. A collapsed caret reports the size at the caret (for the toolbar input).
export function selectionFontSize(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);

  if (range.collapsed) {
    const at = (selection.anchorNode as Node | null)?.parentElement ?? root;
    return Math.round(parseFloat(getComputedStyle(at).fontSize));
  }

  const sizes = new Set<number>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (
      (node.textContent ?? "").length &&
      range.intersectsNode(node) &&
      node.parentElement
    ) {
      sizes.add(Math.round(parseFloat(getComputedStyle(node.parentElement).fontSize)));
    }
    node = walker.nextNode();
  }
  if (sizes.size === 0) {
    return null;
  }
  return sizes.size === 1 ? [...sizes][0] : null;
}

// The nearest inline font id for a node, climbing ancestors up to `root`. Reads
// the inline `font-family` (our `var(--font-x)` token) rather than
// getComputedStyle, which would resolve the var to a hashed family name we can't
// reverse-map. Falls back to the default when nothing on the path sets a font.
function inlineFontId(node: Node, root: HTMLElement): string {
  let el: HTMLElement | null =
    node instanceof HTMLElement ? node : node.parentElement;
  while (el) {
    const id = fontIdFromCss(el.style.fontFamily);
    if (id) {
      return id;
    }
    if (el === root) {
      break;
    }
    el = el.parentElement;
  }
  return DEFAULT_FONT_ID;
}

// The uniform font id of the current selection, or null if it spans multiple
// fonts. A collapsed caret reports the font at the caret (for the toolbar).
export function selectionFontFamily(root: HTMLElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);

  if (range.collapsed) {
    return inlineFontId((selection.anchorNode as Node | null) ?? root, root);
  }

  const ids = new Set<string>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if ((node.textContent ?? "").length && range.intersectsNode(node)) {
      ids.add(inlineFontId(node, root));
    }
    node = walker.nextNode();
  }
  if (ids.size === 0) {
    return null;
  }
  return ids.size === 1 ? [...ids][0] : null;
}

// The current selection's color via the browser. queryCommandValue returns the
// anchor's color for mixed selections, which is acceptable for the swatch.
export function selectionColor(): string {
  try {
    const value = document.queryCommandValue("foreColor");
    return value ? toHex(value) : "#111111";
  } catch {
    return "#111111";
  }
}
