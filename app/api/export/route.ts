import { NextResponse } from "next/server";
import pptxgen from "pptxgenjs";

// LAYOUT_WIDE is 13.333in × 7.5in (16:9). The editor's logical slide is
// 1280×720, so one logical px maps linearly to inches; font px → points at ×0.75
// (1280 logical px ↔ 960 pt). See IMPLEMENTATION_PLAN.md §3.7.
const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;
const LOGICAL_W = 1280;
const LOGICAL_H = 720;
const PT_PER_PX = 0.75;

type ExportRun = {
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
};
type ExportText = {
  type: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  align: "left" | "center" | "right";
  runs: ExportRun[];
};
type ExportImage = {
  type: "image";
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};
type ExportShape = {
  type: "shape";
  shape: "rect" | "ellipse" | "triangle";
  fill: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};
type ExportElement = ExportText | ExportImage | ExportShape;
type ExportBackground =
  | { type: "solid"; color: string }
  | { type: "image"; data: string };
type ExportSlide = { background: ExportBackground; elements: ExportElement[] };

const inX = (x: number) => (x / LOGICAL_W) * SLIDE_W_IN;
const inY = (y: number) => (y / LOGICAL_H) * SLIDE_H_IN;
const hex = (color: string) => color.replace("#", "").toUpperCase();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      slides?: ExportSlide[];
    };

    if (!body.slides?.length) {
      return NextResponse.json({ error: "No slides to export." }, { status: 400 });
    }

    const deck = new pptxgen();
    deck.layout = "LAYOUT_WIDE";
    deck.author = "Valon";
    deck.company = "Valon";
    deck.title = body.title || "Valon Slides export";

    for (const slideData of body.slides) {
      const slide = deck.addSlide();

      slide.background =
        slideData.background.type === "solid"
          ? { color: hex(slideData.background.color) }
          : { data: slideData.background.data };

      // Draw bottom-to-top so later (higher z) elements sit on top.
      const elements = [...slideData.elements].sort((a, b) => a.z - b.z);

      for (const el of elements) {
        const pos = { x: inX(el.x), y: inY(el.y), w: inX(el.w), h: inY(el.h) };

        if (el.type === "text") {
          // Each run becomes a pptx text run; a "\n" inside a run splits into
          // segments joined with breakLine so newlines survive the export.
          const runs = el.runs.flatMap((run) => {
            const parts = run.text.split("\n");
            return parts.map((part, index) => ({
              text: part,
              options: {
                fontFace: "Inter",
                fontSize: run.fontSize * PT_PER_PX,
                color: hex(run.color),
                bold: run.bold,
                italic: run.italic,
                breakLine: index < parts.length - 1
              }
            }));
          });
          slide.addText(runs, {
            ...pos,
            align: el.align,
            valign: "top",
            margin: 0
          });
        } else if (el.type === "image") {
          // Cover-fit to match the editor (crop overflow, no distortion).
          slide.addImage({
            data: el.src,
            ...pos,
            sizing: { type: "cover", w: pos.w, h: pos.h }
          });
        } else {
          slide.addShape(el.shape, { ...pos, fill: { color: hex(el.fill) } });
        }
      }
    }

    const file = await deck.write({ outputType: "nodebuffer" });

    let responseBody: BodyInit;
    if (typeof file === "string" || file instanceof Blob || file instanceof ArrayBuffer) {
      responseBody = file;
    } else {
      const arrayBuffer = new ArrayBuffer(file.byteLength);
      new Uint8Array(arrayBuffer).set(file);
      responseBody = arrayBuffer;
    }

    return new Response(responseBody, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": 'attachment; filename="valon-slides.pptx"'
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong while exporting.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
