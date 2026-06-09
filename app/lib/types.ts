// Core data model for the fluid slide editor.
//
// A slide is no longer a single baked image — it is an ordered list of
// independent, positioned elements over a background. All geometry is expressed
// in LOGICAL artboard pixels (a fixed 1280x720 space); the artboard is then
// scaled to fit the editor pane on screen. See IMPLEMENTATION_PLAN.md §3.

export type Geometry = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
};

// A styled span of characters. Per-character formatting (size/color/bold/italic)
// lives here; a text box is an ordered list of these. Alignment is box-level
// (a paragraph property, not per-character) so it stays on TextElement.
export type TextRun = {
  text: string;
  fontSize: number; // logical px
  color: string; // hex
  bold: boolean;
  italic: boolean;
  fontFamily?: string; // font id from lib/fonts.ts; absent = default (Inter)
};

export type TextElement = Geometry & {
  id: string;
  type: "text";
  runs: TextRun[];
  align: "left" | "center" | "right";
};

export type ImageElement = Geometry & {
  id: string;
  type: "image";
  src?: string; // data URL (lives in IndexedDB once Phase 3 lands)
  prompt: string;
  status: "idle" | "generating" | "done" | "error";
};

export type ShapeElement = Geometry & {
  id: string;
  type: "shape";
  shape: "rect" | "ellipse" | "triangle";
  fill: string;
  radius?: number;
};

export type SlideElement = TextElement | ImageElement | ShapeElement;

export type Background =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string; angle: number };

// Provenance for an AI-generated slide: the layout + style it came from and the
// structured content used. Lets the "edit" flow iterate on the slide in place
// (same layout) instead of generating a new one. Absent on hand-made slides.
export type SlideSource = {
  templateId: string;
  style: string;
  slots: Record<string, { text?: string; prompt?: string; heading?: string }>;
};

export type Slide = {
  id: string;
  background: Background;
  elements: SlideElement[];
  source?: SlideSource;
  // Set while an AI-generated deck is streaming in: the slide exists (so it shows
  // in the rail and can be navigated to) but its content hasn't arrived yet, so
  // the editor renders a skeleton/spinner. `pendingTitle` is the outline title
  // shown faintly during the wait. Both are cleared once content lands.
  pending?: boolean;
  pendingTitle?: string;
};

export type Deck = {
  id: string;
  title: string;
  slides: Slide[];
  selectedSlideId: string;
};

// ---- deck-creation outline ------------------------------------------------
// The intermediate structure the user edits before the full deck is generated.
// `layout` is the planned style for the slide ("cover" only ever for slide 1).

export type OutlineLayout =
  | "cover"
  | "bullets"
  | "paragraph"
  | "boxes"
  | "two-col-image";

export type OutlineSlide = {
  title: string;
  bullets: string[];
  layout: OutlineLayout;
};

export type Outline = {
  deckTitle: string;
  slides: OutlineSlide[];
};
