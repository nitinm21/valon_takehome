import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

import {
  CONTENT_TEMPLATE_IDS,
  DEFAULT_TEMPLATE,
  TEMPLATES,
  type SlideContent
} from "../../lib/layouts";

// Turns a topic + the deck's derived theme + a chosen STYLE into a VALIDATED
// { templateId, slots }. It never returns coordinates — the client feeds this
// into buildSlide(), which owns positioning. Background is reused from the deck
// theme (not model-chosen) so generated slides stay on-theme.
//
// style: "magic" -> a tiny first call lets the model pick the layout; any concrete
// style FORCES that layout (skips the picker). Either way the CONTENT call uses a
// per-template schema whose slots are REQUIRED — without that, the model satisfies
// the schema by emitting only a title and skips the body/boxes/image.

const DEFAULT_MODEL = "gemini-2.5-flash";

// Per-slot copy budgets (chars). A soft guard against pathological lengths; the
// real fit-to-slot happens in buildSlide.
const TEXT_LIMITS: Record<string, number> = { title: 120, body: 600 };
const BOX_HEADING_LIMIT = 40;
const BOX_TEXT_LIMIT = 160;
const PROMPT_LIMIT = 400;

// Required inner fields are the whole point — see header note.
const slotText = {
  type: Type.OBJECT,
  properties: { text: { type: Type.STRING } },
  required: ["text"]
};
const slotImage = {
  type: Type.OBJECT,
  properties: { prompt: { type: Type.STRING } },
  required: ["prompt"]
};
const slotBox = {
  type: Type.OBJECT,
  properties: { heading: { type: Type.STRING }, text: { type: Type.STRING } },
  required: ["heading", "text"]
};

// A content schema for ONE resolved template: only that template's slots, all
// required, so the model fills every one.
function schemaForTemplate(templateId: string) {
  const template = TEMPLATES[templateId] ?? TEMPLATES[DEFAULT_TEMPLATE];
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, slot] of Object.entries(template.slots)) {
    required.push(name);
    properties[name] =
      slot.role === "box" ? slotBox : slot.type === "image" ? slotImage : slotText;
  }
  return {
    type: Type.OBJECT,
    properties: { slots: { type: Type.OBJECT, properties, required } },
    required: ["slots"]
  };
}

// Tiny schema for the Magic layout-picker call. Cover is excluded — it's only
// ever slide 1 of a generated deck, never a magic pick.
const CLASSIFY_SCHEMA = {
  type: Type.OBJECT,
  properties: { templateId: { type: Type.STRING, enum: CONTENT_TEMPLATE_IDS } },
  required: ["templateId"]
};

// Per-style content instructions. Keys match template ids (= the user styles).
const STYLE_GUIDE: Record<string, string> = {
  cover:
    "Layout TITLE SLIDE. Fill `title` (the deck or section title) and `subtitle` (one short supporting line).",
  bullets:
    "Layout BULLETS. Fill `title` and `body`. body = 3 to 6 short points, ONE PER LINE (newline-separated). Do NOT add bullet characters — they are added automatically.",
  paragraph:
    "Layout PARAGRAPHS. Fill `title` and `body`. body = 1 to 2 short paragraphs (about 45 words total).",
  boxes:
    "Layout BOXES. Fill `title` and three boxes `box1`, `box2`, `box3`. Each box has a short `heading` (1 to 3 words) and `text` (one concise sentence).",
  "two-col-image":
    "Layout TWO-COLUMN WITH IMAGE. Fill `title`, `body` (about 40 words), and `image` (a vivid image-generation prompt; describe a picture only — no text, words, or UI)."
};

const STYLE_MENU = [
  "bullets: a title + 3-6 short points",
  "paragraph: a title + 1-2 short paragraphs",
  "boxes: a title + three boxes (heading + sentence each)",
  "two-col-image: a title + short body + one image"
].join("\n- ");

function classifyPrompt(topic: string, theme: unknown): string {
  return `Choose the single best slide layout for this topic.

TOPIC:
${topic}

DECK THEME:
${JSON.stringify(theme)}

LAYOUTS:
- ${STYLE_MENU}

Return JSON with the best "templateId".`;
}

function contentPrompt(topic: string, theme: unknown, templateId: string): string {
  return `You write the content for ONE presentation slide that matches the deck's visual theme.

TOPIC:
${topic}

DECK THEME (match palette and tone):
${JSON.stringify(theme)}

${STYLE_GUIDE[templateId] ?? STYLE_GUIDE.paragraph}

GENERAL RULES:
- title: a punchy heading, at most ~8 words.
- For image prompts: describe a picture only — no text, words, or UI.
- Keep copy concise so it fits comfortably in its slot.
Return JSON only.`;
}

// DECK mode: expand ONE approved outline slide (title + key points) into the
// layout the deck planner assigned. Stays faithful to the outline so the user's
// edits in the outline editor flow through to the finished slide.
function deckContentPrompt(
  outline: { deckTitle?: string; title?: string; bullets?: string[] },
  theme: unknown,
  templateId: string
): string {
  const deckTitle = outline.deckTitle?.trim() || "this presentation";
  const title = outline.title?.trim() || "";
  const points = (outline.bullets ?? [])
    .map((b) => `- ${b}`)
    .join("\n");

  return `You write the content for ONE slide in a presentation titled "${deckTitle}".

This slide's APPROVED OUTLINE:
TITLE: ${title}
KEY POINTS:
${points || "- (none provided)"}

Expand these key points into the layout below. Stay faithful to the title and points — do NOT introduce unrelated topics.

DECK THEME (match palette and tone):
${JSON.stringify(theme)}

${STYLE_GUIDE[templateId] ?? STYLE_GUIDE.paragraph}

GENERAL RULES:
- title: use the slide title above (you may tighten it), at most ~8 words.
- For image prompts: describe a picture only — no text, words, or UI.
- Keep copy concise so it fits comfortably in its slot.
Return JSON only.`;
}

// EDIT mode: iterate on an existing slide. Keep its layout (same templateId) and
// change only what the instruction asks, using the current content as the base.
function editPrompt(
  instruction: string,
  theme: unknown,
  templateId: string,
  currentSlots: unknown
): string {
  return `You are EDITING an existing presentation slide. Keep the SAME layout — fill the slots for templateId "${templateId}" — and change ONLY what the instruction asks; keep everything else faithful to the current content.

CURRENT SLIDE CONTENT (JSON):
${JSON.stringify(currentSlots ?? {})}

CHANGE REQUESTED:
${instruction}

DECK THEME (match palette and tone):
${JSON.stringify(theme)}

${STYLE_GUIDE[templateId] ?? STYLE_GUIDE.paragraph}

GENERAL RULES:
- Apply only the requested change; preserve the rest of the content.
- title: a punchy heading, at most ~8 words.
- For image prompts: describe a picture only — no text, words, or UI.
- Keep copy concise so it fits comfortably in its slot.
Return JSON only.`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clampText(input: string, max: number): string {
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

// Keep ONLY the slots the chosen template defines, with the right fields
// (text / prompt / heading+text) and clamped lengths. Anything else the model
// emitted is dropped, so buildSlide always receives clean, in-bounds content.
function sanitizeSlots(templateId: string, rawSlots: unknown): SlideContent {
  const template = TEMPLATES[templateId];
  const source = asRecord(rawSlots);
  const out: SlideContent = {};

  for (const [name, slot] of Object.entries(template.slots)) {
    const value = asRecord(source[name]);
    if (slot.role === "box") {
      const heading = clampText(str(value.heading), BOX_HEADING_LIMIT);
      const text = clampText(str(value.text), BOX_TEXT_LIMIT);
      if (heading || text) {
        out[name] = { heading, text };
      }
    } else if (slot.type === "image") {
      const prompt = clampText(str(value.prompt), PROMPT_LIMIT);
      if (prompt) {
        out[name] = { prompt };
      }
    } else {
      const text = clampText(str(value.text), TEXT_LIMITS[slot.role] ?? 200);
      if (text) {
        out[name] = { text };
      }
    }
  }

  return out;
}

// Magic: ask the model to pick a layout. Falls back to the default on any failure.
async function chooseTemplate(
  client: GoogleGenAI,
  model: string,
  topic: string,
  theme: unknown
): Promise<string> {
  try {
    const response = await client.models.generateContent({
      model,
      contents: classifyPrompt(topic, theme),
      config: {
        responseMimeType: "application/json",
        responseSchema: CLASSIFY_SCHEMA,
        temperature: 0.3
      }
    });
    const parsed = asRecord(safeParse(response.text));
    return typeof parsed.templateId === "string" &&
      CONTENT_TEMPLATE_IDS.includes(parsed.templateId)
      ? parsed.templateId
      : DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
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

    const body = (await request.json()) as {
      topic?: string;
      theme?: unknown;
      style?: string;
      current?: unknown;
      outline?: { deckTitle?: string; title?: string; bullets?: string[] };
    };
    const topic = body.topic?.trim();
    if (!topic) {
      return NextResponse.json({ error: "Topic is required." }, { status: 400 });
    }
    const theme = body.theme ?? {};
    const model = process.env.GOOGLE_SLIDE_MODEL || DEFAULT_MODEL;
    const client = new GoogleGenAI({ apiKey });

    // Edit mode is signalled by the client sending the current slide's known
    // template; we keep that layout and rewrite the content per the instruction.
    const current = asRecord(body.current);
    const editTemplateId =
      typeof current.templateId === "string" && TEMPLATES[current.templateId]
        ? current.templateId
        : "";

    let templateId: string;
    let contents: string;
    if (editTemplateId) {
      templateId = editTemplateId;
      contents = editPrompt(topic, theme, templateId, current.slots);
    } else {
      const style = typeof body.style === "string" && body.style ? body.style : "magic";
      const forced = style !== "magic" && CONTENT_TEMPLATE_IDS.includes(style);
      templateId = forced ? style : await chooseTemplate(client, model, topic, theme);
      // Deck mode: ground the content in the approved outline slide.
      contents = body.outline
        ? deckContentPrompt(body.outline, theme, templateId)
        : contentPrompt(topic, theme, templateId);
    }

    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: schemaForTemplate(templateId),
        temperature: 0.6
      }
    });

    const parsed = safeParse(response.text);
    if (parsed === null) {
      return NextResponse.json(
        { error: "The model did not return usable JSON." },
        { status: 502 }
      );
    }

    const slots = sanitizeSlots(templateId, asRecord(parsed).slots);
    if (Object.keys(slots).length === 0) {
      return NextResponse.json(
        { error: "The model returned no usable slide content." },
        { status: 502 }
      );
    }

    return NextResponse.json({ templateId, slots });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong while generating.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
