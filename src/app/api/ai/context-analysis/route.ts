import { NextResponse } from "next/server";
import { asRecord, getString, stripModelThinking } from "@/lib/aiPayload";
import {
  fetchGroqChatWithFallback,
  getGroqApiKey,
  getMissingGroqKeyMessage,
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
  "Other",
] as const;
const occasionOptions = [
  "Birthday",
  "Anniversary",
  "Wedding",
  "Graduation",
  "Other",
] as const;
const recipientOptions = ["Male", "Female", "Child", "Couple", "Other"] as const;
const giftTypeOptions = [
  "Flowers",
  "Cakes",
  "Chocolate",
  "Electronics",
  "Perfumes",
  "Fashion",
  "Other",
] as const;

type RequiredField = (typeof requiredFields)[number];
type DetectedLanguage = "English" | "Sinhala" | "Singlish";

type LocalAnalysis = {
  budget: string | null;
  category: string | null;
  detectedLanguage: DetectedLanguage | null;
  occasion: string | null;
  recipient: string | null;
  requestedGiftType: string | null;
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

function inferBudget(message: string) {
  const normalized = normalizeText(message);
  const amounts = parseAmounts(normalized);

  if (amounts.length === 0) {
    return null;
  }

  const hasBudgetMarker =
    /\b(budget|price|cost|rs\.?|lkr|rupees?|under|below|less than|up to|within|over|above|more than|minimum|maximum|between|range)\b/.test(
      normalized,
    ) || /(?:අයවැය|රුපියල්|රු\.?)/u.test(normalized);
  const hasAmountAfterFor =
    /\bfor\s+(?:(?:rs\.?|lkr)\s*\d+(?:\.\d+)?\s*k?|\d+(?:\.\d+)?\s*(?:k|rs\.?|lkr|rupees?))\b/.test(
      normalized,
    ) ||
    /\bfor\s+\d{3,}\s*[.!?]?\s*$/.test(normalized);
  const isStandaloneAmount =
    /^(?:rs\.?|lkr)?\s*\d+(?:\.\d+)?\s*k?\s*(?:rs\.?|lkr|rupees?)?$/.test(
      normalized.trim(),
    );

  if (!hasBudgetMarker && !hasAmountAfterFor && !isStandaloneAmount) {
    return null;
  }

  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);

  if (
    amounts.length >= 2 &&
    (minAmount === 2500 && maxAmount === 5000)
  ) {
    return budgetOptions[1];
  }

  if (
    amounts.length >= 2 &&
    (minAmount === 5000 && maxAmount === 10000)
  ) {
    return budgetOptions[2];
  }

  if (
    /\b(under|below|less than|max|maximum|up to|within|budget)\b/.test(
      normalized,
    )
  ) {
    return maxAmount === 2500 ? budgetOptions[0] : budgetOptions[4];
  }

  if (/\b(over|above|more than|minimum|min)\b/.test(normalized)) {
    return maxAmount === 10000 ? budgetOptions[3] : budgetOptions[4];
  }

  return budgetOptions[4];
}

function normalizeBudget(value: string | null) {
  if (!value) {
    return null;
  }

  return (
    budgetOptions.find(
      (option) => option.toLowerCase() === value.trim().toLowerCase(),
    ) ?? null
  );
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

  if (
    /\b(friend|teacher|boss|manager|colleague|coworker|employee|client|customer|neighbor|neighbour|grandparent|grandmother|grandfather|coach|mentor)\b/.test(
      normalized,
    )
  ) {
    return recipientOptions[4];
  }

  return null;
}

function inferOccasion(message: string) {
  const normalized = normalizeText(message);

  if (/\bbirthday|bday\b/.test(normalized)) return occasionOptions[0];
  if (/\banniversary\b/.test(normalized)) return occasionOptions[1];
  if (/\bwedding|marriage\b/.test(normalized)) return occasionOptions[2];
  if (/\bgraduation|graduate\b/.test(normalized)) return occasionOptions[3];
  if (
    /\b(christmas|new year|valentine(?:'s)? day|mother(?:'s)? day|father(?:'s)? day|housewarming|baby shower|engagement|retirement|farewell|promotion|religious festival)\b/.test(
      normalized,
    )
  ) {
    return occasionOptions[4];
  }

  return null;
}

function normalizeOccasion(value: string | null) {
  if (!value) {
    return null;
  }

  return (
    occasionOptions.find(
      (option) => option.toLowerCase() === value.trim().toLowerCase(),
    ) ?? null
  );
}

function normalizeRecipient(value: string | null) {
  if (!value) {
    return null;
  }

  return (
    recipientOptions.find(
      (option) => option.toLowerCase() === value.trim().toLowerCase(),
    ) ?? null
  );
}

function inferLanguage(message: string): DetectedLanguage {
  if (/[\u0D80-\u0DFF]/u.test(message)) {
    return "Sinhala";
  }

  const normalized = message.toLowerCase();
  const singlishWords =
    normalized.match(
      /\b(mama|oya|oyata|oyage|api|ape|mokak|mokada|mona|kohomada|koheda|keeyada|puluwan|puluwanda|karanna|hoyanna|balanna|denna|ekak|ekata|wage|thiyenawa|innawa|nathuwa|kiyala)\b/g,
    ) ?? [];

  return singlishWords.length >= 2 ||
    /\b(oyata|oyage|mokak|mokada|kohomada|puluwanda|karanna|hoyanna)\b/.test(
      normalized,
    )
    ? "Singlish"
    : "English";
}

function normalizeDetectedLanguage(
  value: string | null,
): DetectedLanguage | null {
  return value === "English" || value === "Sinhala" || value === "Singlish"
    ? value
    : null;
}

function normalizeGiftType(value: string | null) {
  if (!value) {
    return null;
  }

  return (
    giftTypeOptions.find(
      (option) => option.toLowerCase() === value.trim().toLowerCase(),
    ) ?? null
  );
}

function inferGiftType(message: string) {
  const normalized = normalizeText(message);

  if (/\b(flowers?|bouquets?|roses?)\b/.test(normalized)) return "Flowers";
  if (/\b(cakes?)\b/.test(normalized)) return "Cakes";
  if (/\b(chocolates?)\b/.test(normalized)) return "Chocolate";
  if (/\b(electronics?|headphones?|earbuds?|speakers?)\b/.test(normalized)) {
    return "Electronics";
  }
  if (/\b(perfumes?|fragrances?)\b/.test(normalized)) return "Perfumes";
  if (/\b(fashion|clothes?|clothing|watches?|handbags?)\b/.test(normalized)) {
    return "Fashion";
  }

  return null;
}

function inferLocalAnalysis(message: string): LocalAnalysis {
  return {
    budget: inferBudget(message),
    category: inferGiftType(message),
    detectedLanguage: inferLanguage(message),
    occasion: inferOccasion(message),
    recipient: inferRecipient(message),
    requestedGiftType: null,
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
    category:
      localAnalysis.category ??
      analysis.category ??
      getString(context, "category"),
    detectedLanguage:
      localAnalysis.detectedLanguage &&
      localAnalysis.detectedLanguage !== "English"
        ? localAnalysis.detectedLanguage
        : (analysis.detectedLanguage ??
          localAnalysis.detectedLanguage ??
          "English"),
    occasion:
      localAnalysis.occasion ??
      analysis.occasion ??
      getString(context, "occasion"),
    recipient:
      localAnalysis.recipient ??
      analysis.recipient ??
      getString(context, "recipient"),
    requestedGiftType:
      localAnalysis.requestedGiftType ?? analysis.requestedGiftType,
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
      category: null,
      detectedLanguage: null,
      missingFields: [...requiredFields],
      occasion: null,
      recipient: null,
      requestedGiftType: null,
    };
  }

  try {
    const parsed = asRecord(JSON.parse(jsonText) as unknown);
    return {
      budget: normalizeBudget(getString(parsed, "budget")),
      category: normalizeGiftType(getString(parsed, "category")),
      detectedLanguage: normalizeDetectedLanguage(
        getString(parsed, "detectedLanguage"),
      ),
      missingFields: parseRequiredFieldArray(parsed?.missingFields),
      occasion: normalizeOccasion(getString(parsed, "occasion")),
      recipient: normalizeRecipient(getString(parsed, "recipient")),
      requestedGiftType: getString(parsed, "requestedGiftType"),
    };
  } catch {
    return {
      budget: null,
      category: null,
      detectedLanguage: null,
      missingFields: [...requiredFields],
      occasion: null,
      recipient: null,
      requestedGiftType: null,
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
      {
        budget: null,
        category: null,
        detectedLanguage: null,
        occasion: null,
        recipient: null,
        requestedGiftType: null,
      },
      localAnalysis,
      context,
    );

    return NextResponse.json({
      ...knownContext,
      missingFields: requiredFields.filter((field) => !knownContext[field]),
      warning: getMissingGroqKeyMessage(),
    });
  }

  const { response } = await fetchGroqChatWithFallback(apiKey, {
    model:
      process.env.GROQ_PROCESSING_MODEL ??
      process.env.GROQ_CONTEXT_MODEL ??
      DEFAULT_MODEL,
    messages: [
        {
          role: "system",
          content:
            "You analyze the latest Kapruka Genie shopping message. Detect the language actually used in this message as English, Sinhala, or Singlish. Sinhala means Sinhala script; Singlish means Sinhala expressed mainly with Latin letters. The message language always has priority over any selected UI language. Extract budget, recipient, occasion, and gift type only when explicitly present in the current message. Return null for any absent preference; never use Other as a default. Normalize only the four exact preset budget ranges to their matching option, and return budget Other only for an explicitly requested non-preset numeric budget. Return occasion Other only for an explicitly requested occasion outside Birthday, Anniversary, Wedding, or Graduation. Return recipient Other only for an explicitly requested recipient outside Male, Female, Child, or Couple. Values stated in the current message replace conflicting existing context; existing context only fills details omitted from the message. Normalize known gift types to Flowers, Cakes, Chocolate, Electronics, Perfumes, or Fashion. For any other specific gift or product type, return category Other and preserve its short English name in requestedGiftType. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            existingContext: {
              budget: getString(context, "budget"),
              category: getString(context, "category"),
              occasion: getString(context, "occasion"),
              recipient: getString(context, "recipient"),
            },
            expectedSchema: {
              budget:
                "Under Rs. 2,500 | Rs. 2,500 - 5,000 | Rs. 5,000 - 10,000 | Above Rs. 10,000 | Other | null",
              category:
                "Flowers | Cakes | Chocolate | Electronics | Perfumes | Fashion | Other | null",
              detectedLanguage: "English | Sinhala | Singlish",
              missingFields: ["budget", "recipient", "occasion"],
              occasion:
                "Birthday | Anniversary | Wedding | Graduation | Other | null",
              recipient: "Male | Female | Child | Couple | Other | null",
              requestedGiftType: "specific English gift type or null",
            },
            message,
            normalizedOptions: {
              budget: [
                "Under Rs. 2,500",
                "Rs. 2,500 - 5,000",
                "Rs. 5,000 - 10,000",
                "Above Rs. 10,000",
                "Other",
              ],
              category: [
                "Flowers",
                "Cakes",
                "Chocolate",
                "Electronics",
                "Perfumes",
                "Fashion",
                "Other",
              ],
              occasion: [
                "Birthday",
                "Anniversary",
                "Wedding",
                "Graduation",
                "Other",
              ],
              recipient: ["Male", "Female", "Child", "Couple", "Other"],
            },
          }),
        },
    ],
    temperature: 0,
    max_completion_tokens: 350,
    response_format: {
      type: "json_object",
    },
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
