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

export type Slide = {
  id: string;
  background: Background;
  elements: SlideElement[];
};

export type Deck = {
  id: string;
  title: string;
  slides: Slide[];
  selectedSlideId: string;
};
