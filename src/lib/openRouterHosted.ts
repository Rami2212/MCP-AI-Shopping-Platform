import { asRecord, getString } from "@/lib/aiPayload";

export const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_SPEECH_URL =
  "https://openrouter.ai/api/v1/audio/speech";
export const OPENROUTER_TRANSCRIPTIONS_URL =
  "https://openrouter.ai/api/v1/audio/transcriptions";

export function getOpenRouterApiKey() {
  return process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_TOKEN;
}

export function getMissingOpenRouterKeyMessage() {
  return "Missing OPENROUTER_API_KEY. Add it to src/.env.local, then restart npm run dev.";
}

export function getOpenRouterHeaders(contentType = "application/json") {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
    "X-OpenRouter-Title":
      process.env.OPENROUTER_APP_TITLE ?? "Kapruka Genie AI Shopping",
  };
  const apiKey = getOpenRouterApiKey();

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

export function getOpenRouterFreeModel(
  preferredModel: string | undefined,
  fallbackModel = "openrouter/free",
) {
  const model = preferredModel?.trim();

  if (
    model &&
    (model === "openrouter/free" ||
      model.endsWith(":free") ||
      model.includes("/free"))
  ) {
    return model;
  }

  return fallbackModel;
}

export async function readOpenRouterError(response: Response) {
  const fallback = `OpenRouter request failed with ${response.status} ${response.statusText}`;
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

    return message ? `${fallback}: ${message}` : `${fallback}: ${body}`;
  } catch {
    return `${fallback}: ${body}`;
  }
}
