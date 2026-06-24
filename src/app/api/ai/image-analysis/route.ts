import { NextResponse } from "next/server";
import type { ImageLabel } from "@/lib/aiPayload";
import {
  asRecord,
  getNumber,
  getString,
  stripModelThinking,
} from "@/lib/aiPayload";
import {
  fetchGroqChatWithFallback,
  getGroqApiKey,
  getMissingGroqKeyMessage,
  readGroqError,
} from "@/lib/groqHosted";

export const runtime = "nodejs";

const DEFAULT_MODEL = "qwen/qwen3.6-27b";
const DEFAULT_BACKUP_MODEL = "qwen/qwen3.6-27b";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

type VisionAnalysis = {
  fallback?: boolean;
  labels: ImageLabel[];
  model?: string;
  productHints: string[];
  searchQuery: string;
  summary: string;
  visibleText: string[];
};

const GENERIC_HINTS = ["gift", "flowers", "cake", "chocolate"];

function cleanFallbackTerms(value: string) {
  return value
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim().toLowerCase())
    .filter(
      (term) =>
        term.length >= 3 &&
        !/^\d+$/.test(term) &&
        !/^\d+x\d+$/i.test(term) &&
        !/^(img|image|photo|picture|screenshot|screen|scan|upload|whatsapp|document|file|jpeg|jpg|png|webp|heic|easy|final|copy|edited|edit|new|version|draft|small|large|wide|tall)$/.test(
          term,
        ),
    );
}

function buildFallbackAnalysis(file: File): VisionAnalysis {
  const baseName = file.name
    .replace(/\.[a-z0-9]+$/i, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const preferredTerms = cleanFallbackTerms(baseName).filter((term) =>
    /cake|chocolate|flower|flowers|rose|roses|perfume|gift|watch|hamper|bouquet|party|balloon|teddy|mug|jewel|jewellery|toy/i.test(
      term,
    ),
  );
  const terms = [...new Set([...preferredTerms, ...cleanFallbackTerms(baseName)])].slice(
    0,
    5,
  );
  const productHints = [...new Set([...terms, ...GENERIC_HINTS])].slice(0, 5);
  const searchQuery = terms.slice(0, 3).join(" ") || "gift";
  const focus = terms[0] ?? "gift";

  return {
    fallback: true,
    labels: terms.slice(0, 3).map((term) => ({ label: term, score: 0.2 })),
    productHints,
    searchQuery,
    summary:
      terms.length > 0
        ? `Vision is temporarily unavailable, so I searched for ${focus}-related gift ideas.`
        : "Vision is temporarily unavailable, so I searched for general gift ideas instead.",
    visibleText: [],
  };
}

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

function buildVisionRequest(model: string, imageUrl: string, useJsonMode: boolean) {
  return {
    model,
    messages: [
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text:
              'Analyze this shopping-related image for Kapruka Genie. Reply with a single JSON object only using this exact schema: {"summary":"one concise sentence","labels":[{"label":"short visual label","score":0.0}],"visibleText":["short text seen in the image"],"productHints":["products to search"],"searchQuery":"short product search query"}. Keep labels and productHints short. Use scores from 0 to 1. Include up to five labels.',
          },
          {
            type: "image_url" as const,
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
    temperature: 0.2,
    max_completion_tokens: 700,
    ...(useJsonMode
      ? {
          response_format: {
            type: "json_object" as const,
          },
        }
      : {}),
  };
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

  const backupModels = [
    process.env.GROQ_VISION_BACKUP_MODEL,
    DEFAULT_BACKUP_MODEL,
  ];
  let { model: resolvedModel, response } = await fetchGroqChatWithFallback(
    apiKey,
    buildVisionRequest(model, imageUrl, true),
    backupModels,
  );

  if (response.status === 400) {
    const errorText = await readGroqError(response);

    if (/Failed to generate JSON/i.test(errorText)) {
      ({ model: resolvedModel, response } = await fetchGroqChatWithFallback(
        apiKey,
        buildVisionRequest(model, imageUrl, false),
        backupModels,
      ));
    } else {
      return NextResponse.json(
        { error: errorText, model: resolvedModel },
        { status: response.status },
      );
    }
  }

  if (!response.ok) {
    if (
      response.status === 429 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      return NextResponse.json({
        ...buildFallbackAnalysis(file),
        model: resolvedModel,
      });
    }

    return NextResponse.json(
      { error: await readGroqError(response), model: resolvedModel },
      { status: response.status },
    );
  }

  const content = getAssistantContent((await response.json()) as unknown);

  if (!content) {
    return NextResponse.json(
      { error: "Groq returned an empty vision response.", model: resolvedModel },
      { status: 502 },
    );
  }

  return NextResponse.json({ ...parseAnalysis(content), model: resolvedModel });
}
