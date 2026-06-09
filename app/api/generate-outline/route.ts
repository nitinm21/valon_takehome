import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

import { CONTENT_TEMPLATE_IDS } from "../../lib/layouts";
import type { Outline, OutlineLayout, OutlineSlide } from "../../lib/types";

// Turns a PROMPT or a piece of PASTED TEXT into an editable deck OUTLINE:
// a deck title + per-slide { title, bullets, layout }. Slide 1 is always the
// title/cover slide. The model plans layouts across the whole deck for variety;
// the server then enforces the hard rules (count, cover, image cap, coverage)
// so the outline is always well-formed regardless of what the model returns.

const DEFAULT_MODEL = "gemini-2.5-flash";

const MIN_SLIDES = 1;
const MAX_SLIDES = 10;
const DEFAULT_SLIDES = 6;
const MAX_INPUT_CHARS = 8000;
const MAX_IMAGE_SLIDES = 2; // "two-col-image" is expensive — cap it.

// Per-field copy budgets (chars). Soft guards; the real fit happens in buildSlide.
const MAX_DECK_TITLE = 80;
const MAX_TITLE = 90;
const MAX_BULLET = 160;
const MAX_BULLETS = 6;

const OUTLINE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    deckTitle: { type: Type.STRING },
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
          layout: { type: Type.STRING, enum: CONTENT_TEMPLATE_IDS }
        },
        required: ["title", "bullets", "layout"]
      }
    }
  },
  required: ["deckTitle", "slides"]
};

function outlinePrompt(input: string, count: number): string {
  return `You are an expert presentation designer. Turn the INPUT into a clear, compelling slide deck OUTLINE.

The INPUT is either a short PROMPT/topic to expand into a full deck, OR a longer passage of PASTED TEXT to distill and restructure. If it is pasted text, extract the key ideas — do NOT copy sentences verbatim or dump the whole text onto slides.

INPUT:
${input}

Produce EXACTLY ${count} slide(s).

SLIDE 1 is the TITLE slide: a punchy deck title (<= 8 words) and at most ONE short subtitle line (as a single bullet, or no bullets at all). It opens the deck; it is not a content slide.

SLIDES 2..${count} are CONTENT slides. Each has:
- a short, specific title (<= 8 words), and
- 3 to 5 concise bullet points (each a short phrase, NOT a full paragraph).

Choose a LAYOUT for each CONTENT slide:
- "bullets": a list of short points (steps, lists, takeaways).
- "paragraph": 1-2 short explanatory paragraphs (narrative, context, definitions).
- "boxes": three parallel items (comparisons, pillars, categories, options).
- "two-col-image": text beside a supporting image (ideas that benefit from a visual).

LAYOUT RULES — plan across the WHOLE deck for visual variety:
- Use a MIX of layouts. Across the content slides, use each of the four at least once when there is room.
- Never use the same layout more than twice in a row.
- Use "two-col-image" for AT MOST 2 slides total; reserve it for the most visual ideas.
- Match the layout to the content.

Always provide the 3-5 bullets for every content slide even when the layout is "paragraph", "boxes", or "two-col-image" — they are the slide's key points and get expanded into the chosen layout. (Slide 1's "layout" value is ignored; it is rendered as the title slide.)

Return JSON only.`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clamp(input: string, max: number): string {
  const trimmed = input.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trimEnd();
}

function safeParse(text: string | undefined): unknown {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isContentLayout(value: string): value is OutlineLayout {
  return CONTENT_TEMPLATE_IDS.includes(value);
}

// Enforce the hard layout rules the model can't be trusted to follow exactly:
// slide 1 = cover, image slides capped, and (when there's room) every content
// layout represented at least once. Operates on the content slides in place.
function normalizeLayouts(slides: OutlineSlide[]): void {
  if (slides.length === 0) {
    return;
  }
  slides[0].layout = "cover";

  const content = slides.slice(1);
  // Validate + image cap.
  let imageCount = 0;
  for (const slide of content) {
    if (!isContentLayout(slide.layout) || slide.layout === "cover") {
      slide.layout = "bullets";
    }
    if (slide.layout === "two-col-image") {
      imageCount += 1;
      if (imageCount > MAX_IMAGE_SLIDES) {
        slide.layout = "bullets";
      }
    }
  }

  // Coverage: when there are at least 4 content slides, make sure each of the
  // four content layouts appears. Reassign from the most over-used layout,
  // without exceeding the image cap.
  if (content.length >= CONTENT_TEMPLATE_IDS.length) {
    const present = new Set(content.map((s) => s.layout));
    const missing = CONTENT_TEMPLATE_IDS.filter((id) => !present.has(id as OutlineLayout));
    for (const want of missing) {
      if (want === "two-col-image") {
        const current = content.filter((s) => s.layout === "two-col-image").length;
        if (current >= MAX_IMAGE_SLIDES) {
          continue;
        }
      }
      // Find a slide whose layout is used more than once (so dropping one keeps
      // that layout present) and reassign it.
      const counts = new Map<string, number>();
      for (const s of content) {
        counts.set(s.layout, (counts.get(s.layout) ?? 0) + 1);
      }
      const victim = content.find((s) => (counts.get(s.layout) ?? 0) > 1);
      if (victim) {
        victim.layout = want as OutlineLayout;
      }
    }
  }
}

function normalizeOutline(raw: unknown, count: number): Outline {
  const record = asRecord(raw);
  const deckTitle = clamp(str(record.deckTitle), MAX_DECK_TITLE) || "Untitled deck";

  const rawSlides = Array.isArray(record.slides) ? record.slides : [];
  const slides: OutlineSlide[] = rawSlides.slice(0, count).map((entry) => {
    const slide = asRecord(entry);
    const title = clamp(str(slide.title), MAX_TITLE);
    const bullets = (Array.isArray(slide.bullets) ? slide.bullets : [])
      .map((b) => clamp(str(b), MAX_BULLET))
      .filter(Boolean)
      .slice(0, MAX_BULLETS);
    const layoutRaw = str(slide.layout);
    const layout: OutlineLayout = isContentLayout(layoutRaw) ? layoutRaw : "bullets";
    return { title: title || "Untitled slide", bullets, layout };
  });

  normalizeLayouts(slides);
  return { deckTitle, slides };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_API_KEY in your local environment." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as { input?: string; slideCount?: number };
    const input = body.input?.trim().slice(0, MAX_INPUT_CHARS);
    if (!input) {
      return NextResponse.json(
        { error: "Enter a prompt or paste some text first." },
        { status: 400 }
      );
    }

    const requested = Number(body.slideCount);
    const count = Math.min(
      MAX_SLIDES,
      Math.max(MIN_SLIDES, Number.isFinite(requested) ? Math.round(requested) : DEFAULT_SLIDES)
    );

    const model = process.env.GOOGLE_SLIDE_MODEL || DEFAULT_MODEL;
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model,
      contents: outlinePrompt(input, count),
      config: {
        responseMimeType: "application/json",
        responseSchema: OUTLINE_SCHEMA,
        temperature: 0.6
      }
    });

    const parsed = safeParse(response.text);
    if (parsed === null) {
      return NextResponse.json(
        { error: "The model did not return a usable outline." },
        { status: 502 }
      );
    }

    const outline = normalizeOutline(parsed, count);
    if (outline.slides.length === 0) {
      return NextResponse.json(
        { error: "The model returned an empty outline. Try rephrasing." },
        { status: 502 }
      );
    }

    return NextResponse.json(outline);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong while generating.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
