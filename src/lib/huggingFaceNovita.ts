import type { ChatMessage } from "@/lib/aiPayload";
import { asRecord, getString, stripModelThinking } from "@/lib/aiPayload";

export const HUGGING_FACE_CHAT_COMPLETIONS_URL =
  "https://router.huggingface.co/v1/chat/completions";

const DEFAULT_REPLY_MODEL = "Qwen/Qwen3-Next-80B-A3B-Instruct:novita";
const DEFAULT_REPLY_TIMEOUT_MS = 4500;

type HuggingFaceChatPayload = {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
};

export function getHuggingFaceApiKey() {
  return process.env.HF_TOKEN ?? process.env.HUGGINGFACE_TOKEN;
}

export function getHuggingFaceNovitaReplyModel() {
  return process.env.HF_NOVITA_REPLY_MODEL ?? DEFAULT_REPLY_MODEL;
}

function getReplyTimeoutMs() {
  const configuredTimeout = Number(process.env.HF_NOVITA_REPLY_TIMEOUT_MS);

  if (!Number.isFinite(configuredTimeout)) {
    return DEFAULT_REPLY_TIMEOUT_MS;
  }

  return Math.min(10000, Math.max(1500, Math.round(configuredTimeout)));
}

function getAssistantReply(payload: unknown) {
  const choices = asRecord(payload)?.choices;

  if (!Array.isArray(choices)) {
    return null;
  }

  const message = asRecord(asRecord(choices[0])?.message);
  const content = message?.content;

  if (typeof content === "string") {
    return stripModelThinking(content).trim() || null;
  }

  if (Array.isArray(content)) {
    const reply = stripModelThinking(
      content
        .map((part) => getString(asRecord(part), "text"))
        .filter((text): text is string => Boolean(text))
        .join("\n"),
    ).trim();

    return reply || null;
  }

  return null;
}

export async function getHuggingFaceNovitaQwenReply(
  apiKey: string,
  payload: HuggingFaceChatPayload,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getReplyTimeoutMs());

  try {
    const response = await fetch(HUGGING_FACE_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        model: getHuggingFaceNovitaReplyModel(),
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    // A rate limit (429), temporary provider failure, timeout, or malformed
    // response deliberately falls through to the existing Groq reply.
    if (!response.ok) {
      return null;
    }

    return getAssistantReply((await response.json()) as unknown);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
