export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ImageLabel = {
  label: string;
  score: number;
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function getString(
  record: Record<string, unknown> | null,
  key: string,
) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

export function getNumber(
  record: Record<string, unknown> | null,
  key: string,
) {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

export function stripModelThinking(content: string) {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .replace(/```think[\s\S]*?```/gi, "")
    .trim();
}
