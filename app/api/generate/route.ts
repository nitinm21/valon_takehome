import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const DEFAULT_MODEL = "gemini-3-pro-image-preview";
// This endpoint now fills a single image element, not a whole slide, so we ask
// the model for just the picture the user described — no slide framing.
const IMAGE_STYLE_APPENDIX = `
Render a single high-quality image of the subject described above.
Do not add slide layouts, captions, borders, watermarks, or UI chrome.
`.trim();

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_API_KEY in your local environment." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const effectivePrompt = `${prompt}\n\n${IMAGE_STYLE_APPENDIX}`;

    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: process.env.GOOGLE_IMAGE_MODEL || DEFAULT_MODEL,
      contents: effectivePrompt,
      config: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    });

    const parts = (response.candidates ?? []).flatMap(
      (candidate) => candidate.content?.parts ?? []
    );
    const imagePart = parts.find((part) => part.inlineData?.data);
    const text = parts
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text?.trim())
      .filter(Boolean)
      .join("\n");

    if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
      return NextResponse.json(
        {
          error:
            text || "The model answered, but it did not send an image back."
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      imageData: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
      text
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong while generating.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
