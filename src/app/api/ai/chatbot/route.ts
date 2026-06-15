import { NextResponse } from "next/server";
import type { ChatMessage } from "@/lib/aiPayload";
import { asRecord, getString, stripModelThinking } from "@/lib/aiPayload";
import {
  getGroqApiKey,
  getMissingGroqKeyMessage,
  GROQ_CHAT_COMPLETIONS_URL,
  readGroqError,
} from "@/lib/groqHosted";

export const runtime = "nodejs";

const DEFAULT_MODEL = "qwen/qwen3-32b";
const MAX_CONTEXT_MESSAGES = 10;

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
  const apiKey = getGroqApiKey();

  if (!apiKey) {
    return NextResponse.json(
      { error: getMissingGroqKeyMessage() },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const messages = parseMessages(asRecord(body)?.messages);

  if (!messages.some((message) => message.role === "user")) {
    return NextResponse.json(
      { error: "Send at least one user message." },
      { status: 400 },
    );
  }

  const model = process.env.GROQ_REPLY_MODEL ?? DEFAULT_MODEL;
  const systemMessage: ChatMessage = {
    role: "system",
    content:
      "You are a concise multilingual shopping assistant for testing an ecommerce AI website. Help with product discovery, comparisons, sizing, returns, and checkout questions. Reply in the requested language when possible, including Sinhala in Sinhala script and Singlish when requested. Do not reveal reasoning, analysis, scratchpad text, or <think> blocks. Do not list product names, product IDs, prices, or product recommendations in chat text; the UI always shows products separately as cards.",
  };

  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [systemMessage, ...messages],
      max_completion_tokens: 900,
      temperature: 0.4,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: await readGroqError(response), model },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as unknown;
  const reply = getAssistantReply(payload);

  if (!reply) {
    return NextResponse.json(
      { error: "Groq returned an empty chat response.", model },
      { status: 502 },
    );
  }

  return NextResponse.json({ reply, model });
}
