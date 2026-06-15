import { NextResponse } from "next/server";
import { asRecord, getString } from "@/lib/aiPayload";
import {
  getGroqApiKey,
  getMissingGroqKeyMessage,
  GROQ_SPEECH_URL,
  GROQ_TRANSCRIPTIONS_URL,
  readGroqError,
} from "@/lib/groqHosted";

export const runtime = "nodejs";

const DEFAULT_STT_MODEL = "whisper-large-v3-turbo";
const DEFAULT_TTS_MODEL = "canopylabs/orpheus-v1-english";
const DEFAULT_TTS_VOICE = "hannah";
const MAX_AUDIO_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_SPEECH_INPUT_LENGTH = 1200;

function getText(value: unknown) {
  return getString(asRecord(value), "text")?.trim() ?? null;
}

function getTranscript(payload: unknown) {
  return getString(asRecord(payload), "text")?.trim() ?? null;
}

async function transcribeAudio(request: Request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("audio");
  const languageValue = formData?.get("language");
  const language = typeof languageValue === "string" ? languageValue : null;

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Record or upload an audio file." },
      { status: 400 },
    );
  }

  if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Audio is too large. Keep Groq voice uploads under 12 MB." },
      { status: 413 },
    );
  }

  const model = process.env.GROQ_STT_MODEL ?? DEFAULT_STT_MODEL;
  const groqFormData = new FormData();
  groqFormData.append("file", file, file.name || "kapruka-voice.webm");
  groqFormData.append("model", model);
  groqFormData.append("response_format", "json");
  if (language) {
    groqFormData.append("language", language);
  }

  const response = await fetch(GROQ_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getGroqApiKey()}`,
    },
    body: groqFormData,
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: await readGroqError(response), model },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as unknown;
  const transcript = getTranscript(payload);

  if (!transcript) {
    return NextResponse.json(
      { error: "Groq returned an empty transcript.", model },
      { status: 502 },
    );
  }

  return NextResponse.json({ model, transcript });
}

async function speakText(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const text = getText(body);

  if (!text) {
    return NextResponse.json(
      { error: "Send text to convert to speech." },
      { status: 400 },
    );
  }

  if (text.length > MAX_SPEECH_INPUT_LENGTH) {
    return NextResponse.json(
      { error: "Text is too long. Keep Groq TTS input under 1200 characters." },
      { status: 413 },
    );
  }

  const model = process.env.GROQ_TTS_MODEL ?? DEFAULT_TTS_MODEL;
  const voice = process.env.GROQ_TTS_VOICE ?? DEFAULT_TTS_VOICE;
  const response = await fetch(GROQ_SPEECH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getGroqApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: "wav",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: await readGroqError(response), model, voice },
      { status: response.status },
    );
  }

  return new Response(await response.arrayBuffer(), {
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "audio/wav",
      "X-Groq-Model": model,
      "X-Groq-Voice": voice,
    },
  });
}

export async function POST(request: Request) {
  if (!getGroqApiKey()) {
    return NextResponse.json(
      { error: getMissingGroqKeyMessage() },
      { status: 500 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return transcribeAudio(request);
  }

  return speakText(request);
}
