import { asRecord, getString } from "@/lib/aiPayload";

const DEFAULT_MCP_URL = "https://mcp.kapruka.com/mcp";
const MCP_PROTOCOL_VERSION = "2025-03-26";
const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 4000;
const MCP_SESSION_MAX_AGE_MS = 10 * 60 * 1000;

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

type McpSession = {
  createdAt: number;
  nextId: number;
  sessionId: string;
};

let activeSession: McpSession | null = null;
let sessionInitialization: Promise<McpSession> | null = null;

function getMcpUrl() {
  return process.env.KAPRUKA_MCP_URL ?? DEFAULT_MCP_URL;
}

function getMcpRequestTimeoutMs() {
  const configuredTimeout = Number(process.env.MCP_REQUEST_TIMEOUT_MS);

  if (!Number.isFinite(configuredTimeout)) {
    return DEFAULT_MCP_REQUEST_TIMEOUT_MS;
  }

  return Math.min(15000, Math.max(2000, Math.round(configuredTimeout)));
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
  const controller = new AbortController();
  const timeoutMs = getMcpRequestTimeoutMs();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(getMcpUrl(), {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Kapruka MCP request timed out after ${timeoutMs} ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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

async function initializeMcpSession(): Promise<McpSession> {
  const initialized = await postMcp({
    id: 1,
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
    createdAt: Date.now(),
    nextId: 2,
    sessionId,
  };
}

async function getMcpSession() {
  if (
    activeSession &&
    Date.now() - activeSession.createdAt < MCP_SESSION_MAX_AGE_MS
  ) {
    return activeSession;
  }

  if (!sessionInitialization) {
    sessionInitialization = initializeMcpSession()
      .then((session) => {
        activeSession = session;
        return session;
      })
      .finally(() => {
        sessionInitialization = null;
      });
  }

  return sessionInitialization;
}

function isExpiredSessionError(error: unknown) {
  return (
    error instanceof Error &&
    /session.{0,30}(?:expired|invalid|not found)|(?:expired|invalid).{0,30}session|not initialized/i.test(
      error.message,
    )
  );
}

function canRetryTool(toolName: string) {
  return toolName !== "kapruka_create_order";
}

async function callToolWithSession<T>(
  toolName: string,
  params: Record<string, unknown>,
  allowSessionRetry = true,
) {
  const session = await getMcpSession();
  const requestId = session.nextId;
  session.nextId += 1;

  try {
    const response = await postMcp(
      {
        id: requestId,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {
            params,
          },
          name: toolName,
        },
      },
      session.sessionId,
    );

    return parseToolJson<T>(toolName, response.message.result);
  } catch (error) {
    if (activeSession === session && isExpiredSessionError(error)) {
      activeSession = null;
    }

    if (
      allowSessionRetry &&
      canRetryTool(toolName) &&
      isExpiredSessionError(error)
    ) {
      return callToolWithSession<T>(toolName, params, false);
    }

    throw error;
  }
}

const sharedMcpClient: KaprukaMcpClient = {
  callTool<T>(toolName: string, params: Record<string, unknown>) {
    return callToolWithSession<T>(toolName, params);
  },
};

export async function createKaprukaMcpClient(): Promise<KaprukaMcpClient> {
  await getMcpSession();

  return sharedMcpClient;
}

export function getMcpString(
  record: Record<string, unknown> | null,
  key: string,
) {
  return getString(record, key)?.trim() ?? null;
}
