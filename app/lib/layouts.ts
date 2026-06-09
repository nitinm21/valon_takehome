// Preset slide layouts + the deterministic slide builder.
//
// The whole point of presets: the LLM (later) NEVER invents coordinates — it
// picks a template id and fills content. All geometry lives here in fixed
// 1280x720 logical rects (mirrors ARTBOARD_W/H in store.ts), so generated slides
// can't overlap or run off-canvas. buildSlide() turns a template choice + content
// + the derived theme into the exact same SlideElement[] the editor already
// renders, which is why generated text/images are editable & movable for free.
//
// Pure and framework-free (no store/React imports) so it runs client-side today
// and server-side in the future /api/generate-slide route.

import { pickReadableColor, type ThemeSummary } from "./theme";
import type {
  Background,
  ImageElement,
  ShapeElement,
  SlideElement,
  TextElement
} from "./types";

type Rect = { x: number; y: number; w: number; h: number };
type SlotRole = "title" | "body" | "image" | "box";
type Slot = { role: SlotRole; type: "text" | "image" | "box"; rect: Rect };

export type Template = {
  id: string;
  name: string;
  slots: Record<string, Slot>;
};

export type SlotContent = { text?: string; prompt?: string; heading?: string };
export type SlideContent = Record<string, SlotContent>;
export type GeneratedSlide = { background: Background; elements: SlideElement[] };

// One template per user-facing STYLE (Magic isn't a template — it's the mode
// where the LLM picks one of these). Slot insertion order matters: z is assigned
// in buildSlide by order, so a Boxes card (declared/pushed before its text) sits
// behind it.
export const TEMPLATES: Record<string, Template> = {
  // Title/opener slide: a large centered title with an optional subtitle. Used as
  // slide 1 of an AI-generated deck. Not offered in the manual style picker.
  cover: {
    id: "cover",
    name: "Cover",
    slots: {
      title: { role: "title", type: "text", rect: { x: 140, y: 250, w: 1000, h: 180 } },
      subtitle: { role: "body", type: "text", rect: { x: 200, y: 452, w: 880, h: 110 } }
    }
  },
  bullets: {
    id: "bullets",
    name: "Bullets",
    slots: {
      title: { role: "title", type: "text", rect: { x: 80, y: 80, w: 1120, h: 130 } },
      body: { role: "body", type: "text", rect: { x: 80, y: 240, w: 1120, h: 400 } }
    }
  },
  paragraph: {
    id: "paragraph",
    name: "Paragraphs",
    slots: {
      title: { role: "title", type: "text", rect: { x: 80, y: 80, w: 1120, h: 130 } },
      body: { role: "body", type: "text", rect: { x: 80, y: 250, w: 1120, h: 390 } }
    }
  },
  boxes: {
    id: "boxes",
    name: "Boxes",
    slots: {
      title: { role: "title", type: "text", rect: { x: 80, y: 70, w: 1120, h: 110 } },
      box1: { role: "box", type: "box", rect: { x: 80, y: 220, w: 353, h: 420 } },
      box2: { role: "box", type: "box", rect: { x: 463, y: 220, w: 354, h: 420 } },
      box3: { role: "box", type: "box", rect: { x: 847, y: 220, w: 353, h: 420 } }
    }
  },
  "two-col-image": {
    id: "two-col-image",
    name: "Two column with image",
    slots: {
      image: { role: "image", type: "image", rect: { x: 80, y: 100, w: 520, h: 520 } },
      title: { role: "title", type: "text", rect: { x: 650, y: 110, w: 550, h: 120 } },
      body: { role: "body", type: "text", rect: { x: 650, y: 260, w: 550, h: 360 } }
    }
  }
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);
// Content layouts only — excludes the cover, which is reserved for slide 1 of a
// generated deck. The magic picker and the deck planner choose from these.
export const CONTENT_TEMPLATE_IDS = TEMPLATE_IDS.filter((id) => id !== "cover");
export const DEFAULT_TEMPLATE = "paragraph";

function uid(): string {
  return crypto.randomUUID();
}

// Text rendering constants that mirror ElementView (line-height) and a rough
// proportional-font width factor. Used only for the auto-fit estimate below.
const LINE_HEIGHT = 1.2;
const AVG_CHAR_WIDTH = 0.52; // fraction of fontSize for an average glyph
const MIN_FIT_FONT = 14;

// Heuristic shrink-to-fit. Estimates wrapped line count at a given size and steps
// the font down until the text's estimated height fits the slot. Never upsizes
// past the theme size. It's an approximation (no real text metrics on the
// server/build side), but it catches the pathological overflow case — e.g. a deck
// whose titles are 120px dropped into a 120px-tall title slot (120 * 1.2 = 144 >
// 120). react-moveable still lets the user fine-tune the box afterward.
function fitFontSize(
  text: string,
  width: number,
  height: number,
  startSize: number
): number {
  const minSize = Math.min(startSize, MIN_FIT_FONT);
  for (let size = startSize; size > minSize; size -= 1) {
    const charsPerLine = Math.max(1, Math.floor(width / (size * AVG_CHAR_WIDTH)));
    const lines = text
      .split("\n")
      .reduce(
        (total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)),
        0
      );
    if (lines * size * LINE_HEIGHT <= height) {
      return size;
    }
  }
  return minSize;
}

// Box (card) inner spacing, in logical px.
const BOX_PADDING = 28;
const BOX_HEADING_H = 56;
const BOX_GAP = 12;

// Single-run text element. Final z is assigned by buildSlide (insertion order).
function textElement(
  rect: Rect,
  text: string,
  fontSize: number,
  color: string,
  bold: boolean,
  align: TextElement["align"]
): TextElement {
  return {
    id: uid(),
    type: "text",
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    rotation: 0,
    z: 0,
    align,
    runs: [{ text, fontSize, color, bold, italic: false }]
  };
}

function buildText(
  slot: Slot,
  text: string,
  theme: ThemeSummary,
  background: Background
): TextElement {
  const isTitle = slot.role === "title";
  const preferred = isTitle ? theme.titleColor : theme.bodyColor;
  const color = pickReadableColor(background, preferred);
  const baseFontSize = isTitle ? theme.titleSize : theme.bodySize;
  // Shrink to fit the slot so long copy / large theme sizes don't overflow.
  const fontSize = fitFontSize(text, slot.rect.w, slot.rect.h, baseFontSize);
  return textElement(
    slot.rect,
    text,
    fontSize,
    color,
    isTitle ? theme.titleBold : false,
    isTitle ? theme.align : "left"
  );
}

function buildImage(slot: Slot, prompt: string): ImageElement {
  // status "idle" so the box shows its inline prompt UI; the image-fill pass
  // flips it to "generating" and reuses generateImage().
  return {
    id: uid(),
    type: "image",
    prompt,
    status: "idle",
    x: slot.rect.x,
    y: slot.rect.y,
    w: slot.rect.w,
    h: slot.rect.h,
    rotation: 0,
    z: 0
  };
}

// Expand one "box" slot into a card (shape) + heading + body stacked inside the
// card rect. The card is pushed first so buildSlide gives it the lowest z (it
// sits behind its text). Returns [] for an empty box so there's no orphan card.
function buildBox(
  slot: Slot,
  content: SlotContent,
  theme: ThemeSummary
): SlideElement[] {
  const heading = content.heading?.trim();
  const body = content.text?.trim();
  if (!heading && !body) {
    return [];
  }

  const { x, y, w, h } = slot.rect;
  const cardBg: Background = { type: "solid", color: theme.surfaceColor };
  const innerX = x + BOX_PADDING;
  const innerW = w - BOX_PADDING * 2;

  const card: ShapeElement = {
    id: uid(),
    type: "shape",
    shape: "rect",
    fill: theme.surfaceColor,
    radius: 16,
    x,
    y,
    w,
    h,
    rotation: 0,
    z: 0
  };
  const out: SlideElement[] = [card];

  let cursorY = y + BOX_PADDING;
  if (heading) {
    const size = fitFontSize(
      heading,
      innerW,
      BOX_HEADING_H,
      Math.min(theme.titleSize, 30)
    );
    out.push(
      textElement(
        { x: innerX, y: cursorY, w: innerW, h: BOX_HEADING_H },
        heading,
        size,
        pickReadableColor(cardBg, theme.titleColor),
        true,
        "left"
      )
    );
    cursorY += BOX_HEADING_H + BOX_GAP;
  }
  if (body) {
    const bodyH = y + h - BOX_PADDING - cursorY;
    const size = fitFontSize(body, innerW, bodyH, Math.min(theme.bodySize, 22));
    out.push(
      textElement(
        { x: innerX, y: cursorY, w: innerW, h: bodyH },
        body,
        size,
        pickReadableColor(cardBg, theme.bodyColor),
        false,
        "left"
      )
    );
  }
  return out;
}

// Cover sizing: a deliberately large, centered title with a quieter subtitle.
// Title starts bigger than the deck's title size (covers carry the deck), then
// fits to its slot; subtitle is a fixed, modest size.
const COVER_TITLE_SIZE = 78;
const COVER_SUBTITLE_SIZE = 30;

// Build the opener slide: centered title (+ optional subtitle), regardless of the
// deck's usual alignment — covers always read centered.
function buildCover(
  template: Template,
  content: SlideContent,
  theme: ThemeSummary
): SlideElement[] {
  const out: SlideElement[] = [];
  const { background } = theme;

  const titleSlot = template.slots.title;
  const titleText = content.title?.text?.trim();
  if (titleSlot && titleText) {
    const startSize = Math.max(theme.titleSize, COVER_TITLE_SIZE);
    const size = fitFontSize(titleText, titleSlot.rect.w, titleSlot.rect.h, startSize);
    out.push(
      textElement(
        titleSlot.rect,
        titleText,
        size,
        pickReadableColor(background, theme.titleColor),
        true,
        "center"
      )
    );
  }

  const subtitleSlot = template.slots.subtitle;
  const subtitleText = content.subtitle?.text?.trim();
  if (subtitleSlot && subtitleText) {
    const size = fitFontSize(
      subtitleText,
      subtitleSlot.rect.w,
      subtitleSlot.rect.h,
      COVER_SUBTITLE_SIZE
    );
    out.push(
      textElement(
        subtitleSlot.rect,
        subtitleText,
        size,
        pickReadableColor(background, theme.bodyColor),
        false,
        "center"
      )
    );
  }
  return out;
}

// Turn newline-separated points into bullet lines (markers added here so the LLM
// just returns plain points).
function bulletize(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("•") ? line : `•  ${line}`))
    .join("\n");
}

// Deterministic: template id + per-slot content + theme -> a ready-to-insert
// slide. Unknown template ids fall back to DEFAULT_TEMPLATE; slots with no (or
// empty) content are skipped, so a partial generation still yields a valid slide.
export function buildSlide(
  templateId: string,
  content: SlideContent,
  theme: ThemeSummary
): GeneratedSlide {
  const template = TEMPLATES[templateId] ?? TEMPLATES[DEFAULT_TEMPLATE];
  const background = theme.background;
  const elements: SlideElement[] = [];

  // Cover has its own centered builder.
  if (template.id === "cover") {
    const coverElements = buildCover(template, content, theme);
    coverElements.forEach((element, index) => {
      element.z = index + 1;
    });
    return { background, elements: coverElements };
  }

  for (const [name, slot] of Object.entries(template.slots)) {
    const c = content[name];
    if (!c) {
      continue;
    }
    if (slot.role === "box") {
      elements.push(...buildBox(slot, c, theme));
    } else if (slot.type === "image") {
      elements.push(buildImage(slot, c.prompt?.trim() ?? ""));
    } else {
      let text = c.text?.trim();
      if (!text) {
        continue;
      }
      if (template.id === "bullets" && slot.role === "body") {
        text = bulletize(text);
      }
      elements.push(buildText(slot, text, theme, background));
    }
  }

  // Stacking order follows insertion order: a box's card (pushed first) sits
  // behind its heading/body text.
  elements.forEach((element, index) => {
    element.z = index + 1;
  });

  return { background, elements };
}
