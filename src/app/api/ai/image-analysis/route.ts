import { NextResponse } from "next/server";
import type { ImageLabel } from "@/lib/aiPayload";
import {
  asRecord,
  getNumber,
  getString,
  stripModelThinking,
} from "@/lib/aiPayload";
import {
  getGroqApiKey,
  getMissingGroqKeyMessage,
  GROQ_CHAT_COMPLETIONS_URL,
  readGroqError,
} from "@/lib/groqHosted";

export const runtime = "nodejs";

const DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

type VisionAnalysis = {
  labels: ImageLabel[];
  productHints: string[];
  searchQuery: string;
  summary: string;
  visibleText: string[];
};

function parseLabels(payload: unknown): ImageLabel[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => {
      const record = asRecord(item);
      const label = getString(record, "label");
      const score = getNumber(record, "score");

      if (!label || typeof score !== "number") {
        return null;
      }

      return { label, score };
    })
    .filter((item): item is ImageLabel => item !== null)
    .slice(0, 5);
}

function parseStringArray(payload: unknown, maxItems: number) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function getAssistantContent(payload: unknown) {
  const choices = asRecord(payload)?.choices;

  if (!Array.isArray(choices)) {
    return null;
  }

  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  const content = getString(message, "content");
  return content ? stripModelThinking(content) : null;
}

function extractJsonObject(text: string) {
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return withoutFence.slice(start, end + 1);
}

function parseAnalysis(text: string): VisionAnalysis {
  const jsonText = extractJsonObject(text);

  if (!jsonText) {
    return {
      labels: [],
      productHints: [],
      searchQuery: text,
      summary: text,
      visibleText: [],
    };
  }

  try {
    const parsed = asRecord(JSON.parse(jsonText) as unknown);

    return {
      labels: parseLabels(parsed?.labels),
      productHints: parseStringArray(parsed?.productHints, 5),
      searchQuery: getString(parsed, "searchQuery") ?? "",
      summary: getString(parsed, "summary") ?? text,
      visibleText: parseStringArray(parsed?.visibleText, 8),
    };
  } catch {
    return {
      labels: [],
      productHints: [],
      searchQuery: text,
      summary: text,
      visibleText: [],
    };
  }
}

export async function POST(request: Request) {
  const apiKey = getGroqApiKey();

  if (!apiKey) {
    return NextResponse.json(
      { error: getMissingGroqKeyMessage() },
      { status: 500 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Upload an image file." },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Image is too large. Keep Groq base64 image uploads under 4 MB." },
      { status: 413 },
    );
  }

  const model = process.env.GROQ_VISION_MODEL ?? DEFAULT_MODEL;
  const imageBytes = Buffer.from(await file.arrayBuffer());
  const imageUrl = `data:${file.type || "image/jpeg"};base64,${imageBytes.toString(
    "base64",
  )}`;

  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Analyze this ecommerce image for Kapruka Genie image shopping. Return JSON only with this schema: {"summary":"one concise sentence","labels":[{"label":"short visual label","score":0.0}],"visibleText":["short text seen in the image"],"productHints":["products to search"],"searchQuery":"short product search query"}. Use scores from 0 to 1 and include up to five labels.',
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 700,
      response_format: {
        type: "json_object",
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: await readGroqError(response), model },
      { status: response.status },
    );
  }

  const content = getAssistantContent((await response.json()) as unknown);

  if (!content) {
    return NextResponse.json(
      { error: "Groq returned an empty vision response.", model },
      { status: 502 },
    );
  }

  return NextResponse.json({ ...parseAnalysis(content), model });
}
