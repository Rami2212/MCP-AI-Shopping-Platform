import { NextResponse } from "next/server";
import {
  getGroqApiKey,
  getMissingGroqKeyMessage,
  GROQ_TRANSCRIPTIONS_URL,
  readGroqError,
} from "@/lib/groqHosted";

export const runtime = "nodejs";

const STT_MODEL = "whisper-large-v3-turbo";
const MAX_AUDIO_UPLOAD_BYTES = 12 * 1024 * 1024;
type TranscriptionLanguage = "en";

function getTranscript(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const text = Reflect.get(payload, "text");
  return typeof text === "string" ? text.trim() || null : null;
}

function getDetectedLanguage(payload: unknown): TranscriptionLanguage | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const language = Reflect.get(payload, "language");
  if (typeof language !== "string") {
    return null;
  }

  const normalizedLanguage = language.trim().toLowerCase();
  if (normalizedLanguage === "en" || normalizedLanguage === "english") {
    return "en";
  }

  return null;
}

function isSupportedLanguage(value: string): value is TranscriptionLanguage {
  return value === "en";
}

function isRecognizedTranscript(transcript: string) {
  const normalizedTranscript = transcript.trim();

  if (
    !normalizedTranscript ||
    /^(?:[.?!,\-–—…\s]+|\[(?:inaudible|music|noise|silence)[^\]]*\]|\((?:inaudible|music|noise|silence)[^)]*\))$/iu.test(
      normalizedTranscript,
    )
  ) {
    return false;
  }

  return /[A-Za-z]{2}/u.test(normalizedTranscript);
}

function retryResponse() {
  return NextResponse.json(
    {
      error:
        "We couldn't clearly recognize that voice message. Please try again in English.",
      model: STT_MODEL,
      retry: true,
    },
    { status: 422 },
  );
}

async function transcribeAudio(request: Request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("audio");
  const languageValue = formData?.get("language");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Record or upload an audio file." },
      { status: 400 },
    );
  }

  if (
    typeof languageValue !== "string" ||
    !isSupportedLanguage(languageValue)
  ) {
    return NextResponse.json(
      { error: "Voice search supports English only." },
      { status: 400 },
    );
  }

  if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Audio is too large. Keep Groq voice uploads under 12 MB." },
      { status: 413 },
    );
  }

  const model = STT_MODEL;
  const groqFormData = new FormData();
  groqFormData.append("file", file, file.name || "kapruka-voice.webm");
  groqFormData.append("model", model);
  groqFormData.append("response_format", "verbose_json");

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
  const detectedLanguage = getDetectedLanguage(payload);

  if (
    !transcript ||
    !detectedLanguage ||
    !isRecognizedTranscript(transcript)
  ) {
    return retryResponse();
  }

  return NextResponse.json({ language: detectedLanguage, model, transcript });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      {
        error:
          "This route only transcribes audio. Read-aloud uses the browser speech engine.",
      },
      { status: 415 },
    );
  }

  if (!getGroqApiKey()) {
    return NextResponse.json(
      { error: getMissingGroqKeyMessage() },
      { status: 500 },
    );
  }

  return transcribeAudio(request);
}
