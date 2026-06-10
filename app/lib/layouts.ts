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
  ChartElement,
  ImageElement,
  KpiElement,
  ShapeElement,
  SlideElement,
  TableElement,
  TextElement
} from "./types";

type Rect = { x: number; y: number; w: number; h: number };
type SlotRole = "title" | "body" | "image" | "box" | "kpi" | "chart" | "table";
type Slot = {
  role: SlotRole;
  type: "text" | "image" | "box" | "kpi" | "chart" | "table";
  rect: Rect;
};

export type Template = {
  id: string;
  name: string;
  slots: Record<string, Slot>;
};

// Structured payloads for the data-viz slots. These are what the agent authors —
// pure data, no geometry or colors (buildSlide applies the theme).
export type KpiContent = {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
  good?: boolean;
};
export type ChartContent = {
  chartType: "bar" | "line";
  labels: string[];
  series: { name?: string; values: number[] }[];
  yLabel?: string;
};
export type TableContent = { columns: string[]; rows: string[][] };

export type SlotContent = {
  text?: string;
  prompt?: string;
  heading?: string;
  kpi?: KpiContent;
  chart?: ChartContent;
  table?: TableContent;
};
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
  },
  // ---- data-viz templates (agent-authored deployment reviews) --------------
  // The kpi1-4 rects are defaults for a full row; buildSlide redistributes the
  // row across however many KPIs are actually provided (1-4) so a 3-KPI slide
  // doesn't leave a hole on the right.
  kpis: {
    id: "kpis",
    name: "KPI row",
    slots: {
      title: { role: "title", type: "text", rect: { x: 80, y: 70, w: 1120, h: 110 } },
      kpi1: { role: "kpi", type: "kpi", rect: { x: 80, y: 240, w: 262, h: 260 } },
      kpi2: { role: "kpi", type: "kpi", rect: { x: 366, y: 240, w: 262, h: 260 } },
      kpi3: { role: "kpi", type: "kpi", rect: { x: 652, y: 240, w: 262, h: 260 } },
      kpi4: { role: "kpi", type: "kpi", rect: { x: 938, y: 240, w: 262, h: 260 } },
      context: { role: "body", type: "text", rect: { x: 80, y: 548, w: 1120, h: 100 } }
    }
  },
  chart: {
    id: "chart",
    name: "Chart with takeaway",
    slots: {
      title: { role: "title", type: "text", rect: { x: 80, y: 70, w: 1120, h: 110 } },
      chart: { role: "chart", type: "chart", rect: { x: 80, y: 220, w: 700, h: 430 } },
      body: { role: "body", type: "text", rect: { x: 820, y: 240, w: 380, h: 390 } }
    }
  },
  table: {
    id: "table",
    name: "Table",
    slots: {
      title: { role: "title", type: "text", rect: { x: 80, y: 70, w: 1120, h: 110 } },
      table: { role: "table", type: "table", rect: { x: 80, y: 210, w: 1120, h: 380 } },
      note: { role: "body", type: "text", rect: { x: 80, y: 612, w: 1120, h: 60 } }
    }
  }
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);
// Data-viz layouts are agent-only: they are authored through the deck API with
// REAL series/values from customer artifacts. The in-app LLM flow never picks
// them — a model invents numbers, an agent cites them.
export const DATA_TEMPLATE_IDS = ["kpis", "chart", "table"];
// Content layouts only — excludes the cover, which is reserved for slide 1 of a
// generated deck, and the data-viz templates above. The magic picker and the
// deck planner choose from these.
export const CONTENT_TEMPLATE_IDS = TEMPLATE_IDS.filter(
  (id) => id !== "cover" && !DATA_TEMPLATE_IDS.includes(id)
);
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
  align: TextElement["align"],
  fontFamily: string
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
    runs: [{ text, fontSize, color, bold, italic: false, fontFamily }]
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
    isTitle ? theme.align : "left",
    isTitle ? theme.titleFont : theme.bodyFont
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
        "left",
        theme.titleFont
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
        "left",
        theme.bodyFont
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
        "center",
        theme.titleFont
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
        "center",
        theme.bodyFont
      )
    );
  }
  return out;
}

// ---- data-viz builders ------------------------------------------------------
// Styling comes from the theme here (not from the agent): surface cards match
// the Boxes style, text colors pass the same WCAG pick, and the accent drives
// chart series / KPI deltas. The agent supplies only data.

const DEFAULT_ACCENT = "#2F6DF0";

function buildKpi(rect: Rect, content: KpiContent, theme: ThemeSummary): KpiElement {
  const cardBg: Background = { type: "solid", color: theme.surfaceColor };
  return {
    id: uid(),
    type: "kpi",
    label: content.label,
    value: content.value,
    delta: content.delta,
    trend: content.trend,
    good: content.good,
    color: pickReadableColor(cardBg, theme.titleColor),
    surface: theme.surfaceColor,
    accent: theme.accent ?? DEFAULT_ACCENT,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    rotation: 0,
    z: 0
  };
}

function buildChart(slot: Slot, content: ChartContent, theme: ThemeSummary): ChartElement {
  const cardBg: Background = { type: "solid", color: theme.surfaceColor };
  return {
    id: uid(),
    type: "chart",
    chartType: content.chartType,
    labels: content.labels,
    series: content.series.map((s) => ({ name: s.name, values: s.values })),
    yLabel: content.yLabel,
    color: pickReadableColor(cardBg, theme.bodyColor),
    surface: theme.surfaceColor,
    accent: theme.accent ?? DEFAULT_ACCENT,
    x: slot.rect.x,
    y: slot.rect.y,
    w: slot.rect.w,
    h: slot.rect.h,
    rotation: 0,
    z: 0
  };
}

function buildTable(slot: Slot, content: TableContent, theme: ThemeSummary): TableElement {
  const cardBg: Background = { type: "solid", color: theme.surfaceColor };
  return {
    id: uid(),
    type: "table",
    columns: content.columns,
    rows: content.rows,
    color: pickReadableColor(cardBg, theme.bodyColor),
    headerColor: pickReadableColor(cardBg, theme.titleColor),
    surface: theme.surfaceColor,
    accent: theme.accent ?? DEFAULT_ACCENT,
    x: slot.rect.x,
    y: slot.rect.y,
    w: slot.rect.w,
    h: slot.rect.h,
    rotation: 0,
    z: 0
  };
}

// Redistribute the KPI row across however many KPIs were provided (1-4): the
// declared kpi1-4 rects assume a full row; fewer cards widen to fill it.
const KPI_ROW = { x: 80, w: 1120, gap: 24 };

function kpiRects(count: number, template: Template): Rect[] {
  const sample = Object.values(template.slots).find((slot) => slot.role === "kpi");
  const y = sample?.rect.y ?? 240;
  const h = sample?.rect.h ?? 260;
  const w = Math.round((KPI_ROW.w - KPI_ROW.gap * (count - 1)) / count);
  return Array.from({ length: count }, (_, i) => ({
    x: KPI_ROW.x + i * (w + KPI_ROW.gap),
    y,
    w,
    h
  }));
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

  // KPI slots are laid out as a group (so 1-4 cards always fill the row evenly).
  const kpiContents = Object.entries(template.slots)
    .filter(([name, slot]) => slot.role === "kpi" && content[name]?.kpi)
    .map(([name]) => content[name].kpi as KpiContent);
  if (kpiContents.length > 0) {
    const rects = kpiRects(kpiContents.length, template);
    kpiContents.forEach((kpi, index) => {
      elements.push(buildKpi(rects[index], kpi, theme));
    });
  }

  for (const [name, slot] of Object.entries(template.slots)) {
    const c = content[name];
    if (!c) {
      continue;
    }
    if (slot.role === "kpi") {
      continue; // handled above as a group
    }
    if (slot.role === "box") {
      elements.push(...buildBox(slot, c, theme));
    } else if (slot.role === "chart") {
      if (c.chart) {
        elements.push(buildChart(slot, c.chart, theme));
      }
    } else if (slot.role === "table") {
      if (c.table) {
        elements.push(buildTable(slot, c.table, theme));
      }
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
