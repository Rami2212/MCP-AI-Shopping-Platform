import { asRecord, getString } from "@/lib/aiPayload";

export const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

export const GROQ_SPEECH_URL = "https://api.groq.com/openai/v1/audio/speech";
export const GROQ_TRANSCRIPTIONS_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";

export function getGroqApiKey() {
  return process.env.GROQ_API_KEY ?? process.env.GROQ_TOKEN;
}

export function getMissingGroqKeyMessage() {
  return "Missing GROQ_API_KEY. Add it to src/.env.local, then restart npm run dev.";
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
      return `${fallback}: This Groq model requires org admin terms acceptance before API use. Open the model in Groq Console and accept the terms: ${getFirstUrl(message) ?? "https://console.groq.com/docs/text-to-speech"}`;
    }

    return message ? `${fallback}: ${message}` : `${fallback}: ${body}`;
  } catch {
    return `${fallback}: ${body}`;
  }
}

function getFirstUrl(text: string) {
  return text.match(/https:\/\/\S+/)?.[0] ?? null;
}
