import { asRecord, getString } from "@/lib/aiPayload";

const DEFAULT_MCP_URL = "https://mcp.kapruka.com/mcp";
const MCP_PROTOCOL_VERSION = "2025-03-26";

type McpMessage = {
  error?: {
    code?: number;
    message?: string;
  };
  result?: unknown;
};

type McpToolContent = {
  text?: string;
  type?: string;
};

type McpToolResult = {
  content?: McpToolContent[];
  isError?: boolean;
  structuredContent?: {
    result?: unknown;
  };
};

export type KaprukaMcpClient = {
  callTool: <T>(toolName: string, params: Record<string, unknown>) => Promise<T>;
};

function getMcpUrl() {
  return process.env.KAPRUKA_MCP_URL ?? DEFAULT_MCP_URL;
}

function getSseMessages(body: string) {
  return body
    .split(/\r?\n\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

function parseMcpMessage(body: string, contentType: string | null): McpMessage {
  if (contentType?.includes("text/event-stream")) {
    const [message] = getSseMessages(body);

    if (!message) {
      throw new Error("Kapruka MCP returned an empty stream response.");
    }

    return JSON.parse(message) as McpMessage;
  }

  return body ? (JSON.parse(body) as McpMessage) : {};
}

async function postMcp(payload: unknown, sessionId?: string) {
  const response = await fetch(getMcpUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      body
        ? `Kapruka MCP failed with ${response.status}: ${body}`
        : `Kapruka MCP failed with ${response.status} ${response.statusText}`,
    );
  }

  const message = parseMcpMessage(body, response.headers.get("content-type"));

  if (message.error) {
    throw new Error(message.error.message ?? "Kapruka MCP returned an error.");
  }

  return {
    message,
    sessionId: response.headers.get("mcp-session-id") ?? sessionId ?? null,
  };
}

function getToolResultText(result: McpToolResult) {
  const structuredResult = result.structuredContent?.result;

  if (typeof structuredResult === "string") {
    return structuredResult.trim();
  }

  if (structuredResult !== undefined) {
    return JSON.stringify(structuredResult);
  }

  return (
    result.content
      ?.filter((item) => item.type === "text" && item.text)
      .map((item) => item.text)
      .join("\n")
      .trim() ?? ""
  );
}

function parseToolJson<T>(toolName: string, result: unknown): T {
  const toolResult = asRecord(result) as McpToolResult | null;

  if (!toolResult) {
    throw new Error(`${toolName} returned an invalid MCP result.`);
  }

  const text = getToolResultText(toolResult);

  if (toolResult.isError || text.startsWith("Error:")) {
    throw new Error(text || `${toolName} failed.`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return { result: text } as T;
  }
}

export async function createKaprukaMcpClient(): Promise<KaprukaMcpClient> {
  let nextId = 1;
  const initialized = await postMcp({
    id: nextId,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: {
        name: "kapruka-genie",
        version: "0.1.0",
      },
      protocolVersion: MCP_PROTOCOL_VERSION,
    },
  });
  nextId += 1;

  if (!initialized.sessionId) {
    throw new Error("Kapruka MCP did not return a session id.");
  }
  const sessionId = initialized.sessionId;

  await postMcp(
    {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    },
    sessionId,
  );

  return {
    async callTool<T>(toolName: string, params: Record<string, unknown>) {
      const response = await postMcp(
        {
          id: nextId,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {
              params,
            },
            name: toolName,
          },
        },
        sessionId,
      );
      nextId += 1;

      return parseToolJson<T>(toolName, response.message.result);
    },
  };
}

export function getMcpString(
  record: Record<string, unknown> | null,
  key: string,
) {
  return getString(record, key)?.trim() ?? null;
}
