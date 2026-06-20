import { asRecord, getString } from "@/lib/aiPayload";

export const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

export const GROQ_TRANSCRIPTIONS_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";

const DEFAULT_TEXT_BACKUP_MODELS = [
  "llama-3.1-8b-instant",
  "qwen/qwen3-32b",
  "openai/gpt-oss-20b",
];
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_TOTAL_TIMEOUT_MS = 25000;
const MAX_MODEL_ATTEMPTS = 4;

type GroqChatPayload = Record<string, unknown> & {
  model: string;
};

type GroqChatFallbackResult = {
  model: string;
  response: Response;
};

export function getGroqApiKey() {
  return process.env.GROQ_API_KEY ?? process.env.GROQ_TOKEN;
}

export function getMissingGroqKeyMessage() {
  return "Missing GROQ_API_KEY. Add it to src/.env.local, then restart npm run dev.";
}

function parseModelList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function getRequestTimeoutMs() {
  const configuredTimeout = Number(process.env.GROQ_REQUEST_TIMEOUT_MS);

  if (!Number.isFinite(configuredTimeout)) {
    return DEFAULT_REQUEST_TIMEOUT_MS;
  }

  return Math.min(30000, Math.max(3000, Math.round(configuredTimeout)));
}

function getTotalTimeoutMs() {
  const configuredTimeout = Number(process.env.GROQ_TOTAL_TIMEOUT_MS);

  if (!Number.isFinite(configuredTimeout)) {
    return DEFAULT_TOTAL_TIMEOUT_MS;
  }

  return Math.min(60000, Math.max(10000, Math.round(configuredTimeout)));
}

function createGroqFailureResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function fetchGroqChatWithFallback(
  apiKey: string,
  payload: GroqChatPayload,
  backupModels?: Array<string | undefined>,
): Promise<GroqChatFallbackResult> {
  const configuredBackups =
    backupModels === undefined
      ? [
          process.env.GROQ_BACKUP_MODEL,
          ...parseModelList(process.env.GROQ_BACKUP_MODELS),
          ...DEFAULT_TEXT_BACKUP_MODELS,
        ]
      : backupModels;
  const models = [payload.model, ...configuredBackups]
    .filter((model): model is string => Boolean(model?.trim()))
    .map((model) => model.trim())
    .filter((model, index, candidates) => candidates.indexOf(model) === index)
    .slice(0, MAX_MODEL_ATTEMPTS);
  let latestRetryableFailure: GroqChatFallbackResult | null = null;
  const startedAt = Date.now();

  for (const [index, model] of models.entries()) {
    const remainingTime = getTotalTimeoutMs() - (Date.now() - startedAt);
    if (remainingTime <= 0) {
      break;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      Math.min(getRequestTimeoutMs(), remainingTime),
    );
    let response: Response;

    try {
      response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...payload, model }),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      response = createGroqFailureResponse(
        error instanceof Error && error.name === "AbortError" ? 504 : 503,
        error instanceof Error && error.name === "AbortError"
          ? `Groq model ${model} timed out.`
          : `Groq model ${model} could not be reached.`,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      return { model, response };
    }

    if (
      response.status === 429 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      latestRetryableFailure = { model, response };
      continue;
    }

    if (index === 0) {
      return { model, response };
    }
  }

  if (latestRetryableFailure) {
    return {
      model: latestRetryableFailure.model,
      response: createGroqFailureResponse(
        503,
        "Groq is temporarily unavailable after automatic model retries. Please try again shortly.",
      ),
    };
  }

  throw new Error("No Groq chat model is configured.");
}

export async function readGroqError(response: Response) {
  const fallback = `Groq request failed with ${response.status} ${response.statusText}`;
  const body = await response.text();

  if (!body) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    const record = asRecord(parsed);
    const error = asRecord(record?.error);
    const message =
      getString(error, "message") ??
      getString(record, "error") ??
      getString(record, "message");

    if (message?.includes("requires terms acceptance")) {
      return `${fallback}: This Groq model requires org admin terms acceptance before API use. Open the model in Groq Console and accept the terms: ${getFirstUrl(message) ?? "https://console.groq.com/docs/models"}`;
    }

    return message ? `${fallback}: ${message}` : `${fallback}: ${body}`;
  } catch {
    return `${fallback}: ${body}`;
  }
}

function getFirstUrl(text: string) {
  return text.match(/https:\/\/\S+/)?.[0] ?? null;
}
