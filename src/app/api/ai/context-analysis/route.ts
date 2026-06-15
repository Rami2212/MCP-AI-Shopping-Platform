import { NextResponse } from "next/server";
import { asRecord, getString, stripModelThinking } from "@/lib/aiPayload";
import {
  getGroqApiKey,
  getMissingGroqKeyMessage,
  GROQ_CHAT_COMPLETIONS_URL,
  readGroqError,
} from "@/lib/groqHosted";

export const runtime = "nodejs";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const requiredFields = ["budget", "recipient", "occasion"] as const;
const budgetOptions = [
  "Under Rs. 2,500",
  "Rs. 2,500 - 5,000",
  "Rs. 5,000 - 10,000",
  "Above Rs. 10,000",
] as const;
const occasionOptions = [
  "Birthday",
  "Anniversary",
  "Wedding",
  "Graduation",
] as const;
const recipientOptions = ["Male", "Female", "Child", "Couple"] as const;

type RequiredField = (typeof requiredFields)[number];

type LocalAnalysis = {
  budget: string | null;
  occasion: string | null;
  recipient: string | null;
};

function parseRequiredFieldArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is RequiredField =>
    requiredFields.includes(item as RequiredField),
  );
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/,/g, "");
}

function parseAmounts(message: string) {
  const matches = [
    ...message.matchAll(/\b(?:rs\.?|lkr)?\s*(\d+(?:\.\d+)?)\s*(k)?\s*(?:rs\.?|lkr)?\b/gi),
  ];

  return matches
    .map((match) => {
      const amount = Number(match[1]);
      return Number.isFinite(amount) ? amount * (match[2] ? 1000 : 1) : null;
    })
    .filter((amount): amount is number => amount !== null && amount > 0);
}

function getBudgetOptionForAmount(amount: number) {
  if (amount <= 2500) return budgetOptions[0];
  if (amount <= 5000) return budgetOptions[1];
  if (amount <= 10000) return budgetOptions[2];
  return budgetOptions[3];
}

function inferBudget(message: string) {
  const normalized = normalizeText(message);
  const amounts = parseAmounts(normalized);

  if (amounts.length === 0) {
    return null;
  }

  const maxAmount = Math.max(...amounts);

  if (
    /\b(under|below|less than|max|maximum|up to|within|budget)\b/.test(
      normalized,
    )
  ) {
    return getBudgetOptionForAmount(maxAmount);
  }

  if (/\b(over|above|more than|minimum|min)\b/.test(normalized)) {
    return maxAmount >= 10000 ? budgetOptions[3] : getBudgetOptionForAmount(maxAmount);
  }

  return getBudgetOptionForAmount(maxAmount);
}

function inferRecipient(message: string) {
  const normalized = normalizeText(message);

  if (/\b(couple|parents|mom and dad|husband and wife)\b/.test(normalized)) {
    return recipientOptions[3];
  }

  if (/\b(child|children|kid|kids|baby|son|daughter|nephew|niece)\b/.test(normalized)) {
    return recipientOptions[2];
  }

  if (
    /\b(girlfriend|wife|mother|mom|mum|sister|aunt|aunty|female|lady|girl|her)\b/.test(
      normalized,
    )
  ) {
    return recipientOptions[1];
  }

  if (
    /\b(boyfriend|husband|father|dad|brother|uncle|male|gentleman|boy|him)\b/.test(
      normalized,
    )
  ) {
    return recipientOptions[0];
  }

  return null;
}

function inferOccasion(message: string) {
  const normalized = normalizeText(message);

  if (/\bbirthday|bday\b/.test(normalized)) return occasionOptions[0];
  if (/\banniversary\b/.test(normalized)) return occasionOptions[1];
  if (/\bwedding|marriage\b/.test(normalized)) return occasionOptions[2];
  if (/\bgraduation|graduate\b/.test(normalized)) return occasionOptions[3];

  return null;
}

function inferLocalAnalysis(message: string): LocalAnalysis {
  return {
    budget: inferBudget(message),
    occasion: inferOccasion(message),
    recipient: inferRecipient(message),
  };
}

function getKnownContext(
  analysis: LocalAnalysis,
  localAnalysis: LocalAnalysis,
  context: Record<string, unknown> | null,
) {
  return {
    budget:
      localAnalysis.budget ??
      analysis.budget ??
      getString(context, "budget"),
    occasion:
      localAnalysis.occasion ??
      analysis.occasion ??
      getString(context, "occasion"),
    recipient:
      localAnalysis.recipient ??
      analysis.recipient ??
      getString(context, "recipient"),
  };
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

function parseAnalysis(text: string) {
  const jsonText = extractJsonObject(text);

  if (!jsonText) {
    return {
      budget: null,
      missingFields: [...requiredFields],
      occasion: null,
      recipient: null,
    };
  }

  try {
    const parsed = asRecord(JSON.parse(jsonText) as unknown);
    return {
      budget: getString(parsed, "budget"),
      missingFields: parseRequiredFieldArray(parsed?.missingFields),
      occasion: getString(parsed, "occasion"),
      recipient: getString(parsed, "recipient"),
    };
  } catch {
    return {
      budget: null,
      missingFields: [...requiredFields],
      occasion: null,
      recipient: null,
    };
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const bodyRecord = asRecord(body);
  const message = getString(bodyRecord, "message");
  const context = asRecord(bodyRecord?.context);

  if (!message) {
    return NextResponse.json(
      { error: "Send a user message to analyze." },
      { status: 400 },
    );
  }

  const localAnalysis = inferLocalAnalysis(message);
  const apiKey = getGroqApiKey();

  if (!apiKey) {
    const knownContext = getKnownContext(
      { budget: null, occasion: null, recipient: null },
      localAnalysis,
      context,
    );

    return NextResponse.json({
      ...knownContext,
      missingFields: requiredFields.filter((field) => !knownContext[field]),
      warning: getMissingGroqKeyMessage(),
    });
  }

  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:
        process.env.GROQ_PROCESSING_MODEL ??
        process.env.GROQ_CONTEXT_MODEL ??
        DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You analyze the first Kapruka Genie shopping message. Extract only budget, recipient, and occasion. Respect any existing context values as already known. Recognize English, Sinhala, and Singlish. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            existingContext: {
              budget: getString(context, "budget"),
              occasion: getString(context, "occasion"),
              recipient: getString(context, "recipient"),
            },
            expectedSchema: {
              budget: "string or null",
              missingFields: ["budget", "recipient", "occasion"],
              occasion: "string or null",
              recipient: "string or null",
            },
            message,
            normalizedOptions: {
              budget: [
                "Under Rs. 2,500",
                "Rs. 2,500 - 5,000",
                "Rs. 5,000 - 10,000",
                "Above Rs. 10,000",
              ],
              occasion: ["Birthday", "Anniversary", "Wedding", "Graduation"],
              recipient: ["Male", "Female", "Child", "Couple"],
            },
          }),
        },
      ],
      temperature: 0,
      max_completion_tokens: 350,
      response_format: {
        type: "json_object",
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: await readGroqError(response) },
      { status: response.status },
    );
  }

  const content = getAssistantContent((await response.json()) as unknown);

  if (!content) {
    return NextResponse.json(
      { error: "Groq returned an empty context analysis." },
      { status: 502 },
    );
  }

  const analysis = parseAnalysis(content);
  const knownContext = getKnownContext(analysis, localAnalysis, context);

  return NextResponse.json({
    ...knownContext,
    missingFields: requiredFields.filter((field) => !knownContext[field]),
  });
}
