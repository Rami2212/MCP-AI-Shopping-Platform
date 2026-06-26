import { NextResponse } from "next/server";
import type { ChatMessage } from "@/lib/aiPayload";
import { asRecord, getString, stripModelThinking } from "@/lib/aiPayload";
import {
  fetchGroqChatWithFallback,
  getGroqApiKey,
  getMissingGroqKeyMessage,
  readGroqError,
} from "@/lib/groqHosted";
import {
  getHuggingFaceApiKey,
  getHuggingFaceNovitaReply,
  getHuggingFaceNovitaReplyModel,
} from "@/lib/huggingFaceNovita";

export const runtime = "nodejs";

const DEFAULT_MODEL = "qwen/qwen3-32b";
const MAX_CONTEXT_MESSAGES = 10;
type SelectedLanguage = "English" | "Sinhala" | "Singlish" | "Tanglish";

function getSelectedLanguage(value: string | null): SelectedLanguage {
  return value === "Sinhala" ||
    value === "Singlish" ||
    value === "Tanglish"
    ? value
    : "English";
}

function isChatRole(role: unknown): role is ChatMessage["role"] {
  return role === "system" || role === "user" || role === "assistant";
}

function parseMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = asRecord(item);
      const role = record?.role;
      const content = getString(record, "content");
      const cleanedContent = content ? stripModelThinking(content) : null;

      if (!isChatRole(role) || !cleanedContent) {
        return null;
      }

      return {
        role,
        content: cleanedContent,
      };
    })
    .filter((message): message is ChatMessage => message !== null)
    .slice(-MAX_CONTEXT_MESSAGES);
}

function getAssistantReply(payload: unknown) {
  const record = asRecord(payload);
  const choices = record?.choices;

  if (!Array.isArray(choices)) {
    return null;
  }

  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  const content = message?.content;

  if (typeof content === "string") {
    return stripModelThinking(content);
  }

  if (Array.isArray(content)) {
    return stripModelThinking(
      content
        .map((part) => getString(asRecord(part), "text"))
        .filter((text): text is string => Boolean(text))
        .join("\n"),
    );
  }

  return null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const bodyRecord = asRecord(body);
  const messages = parseMessages(bodyRecord?.messages);
  const selectedLanguage = getSelectedLanguage(
    getString(bodyRecord, "selectedLanguage") ??
      getString(bodyRecord, "language"),
  );

  if (!messages.some((message) => message.role === "user")) {
    return NextResponse.json(
      { error: "Send at least one user message." },
      { status: 400 },
    );
  }

  const apiKey = getGroqApiKey();
  const huggingFaceApiKey = getHuggingFaceApiKey();
  const useNovita = selectedLanguage === "Tanglish" && Boolean(huggingFaceApiKey);
  const systemMessage: ChatMessage = {
    role: "system",
    content: `You are a concise multilingual shopping assistant for testing an ecommerce AI website. Help with product discovery, comparisons, sizing, returns, and checkout questions. Always reply in the selected language: ${selectedLanguage}. Never detect or switch language based on the user's message. Understand Singlish as natural Sinhala meaning written informally with Latin letters, including spelling variations. Use Sinhala script for selected Sinhala. For selected Singlish, write natural conversational Sinhala entirely with Latin letters; do not answer in English and do not use Sinhala script. For selected Tanglish, write natural conversational Tamil mixed with simple English words in Latin letters only; do not answer fully in English and do not use Tamil script. English product terms may appear only when necessary. Do not reveal reasoning, analysis, scratchpad text, or <think> blocks. Reply with one short paragraph only: no bullets, numbered lists, product names, product IDs, prices, or written product recommendations because the UI shows products separately as cards.`,
  };

  if (useNovita && huggingFaceApiKey) {
    const reply = await getHuggingFaceNovitaReply(huggingFaceApiKey, {
      messages: [systemMessage, ...messages],
      max_tokens: 900,
      temperature: 0.4,
    });

    if (reply) {
      return NextResponse.json({
        reply,
        model: getHuggingFaceNovitaReplyModel(),
      });
    }
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: getMissingGroqKeyMessage() },
      { status: 500 },
    );
  }

  const model = process.env.GROQ_REPLY_MODEL ?? DEFAULT_MODEL;
  const groq = await fetchGroqChatWithFallback(apiKey, {
    model,
    messages: [systemMessage, ...messages],
    max_completion_tokens: 900,
    temperature: 0.4,
  });
  const response = groq.response;
  const usedModel = groq.model;

  if (!response.ok) {
    return NextResponse.json(
      { error: await readGroqError(response), model: usedModel },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as unknown;
  const reply = getAssistantReply(payload);

  if (!reply) {
    return NextResponse.json(
      { error: "Groq returned an empty chat response.", model: usedModel },
      { status: 502 },
    );
  }

  return NextResponse.json({ reply, model: usedModel });
}
