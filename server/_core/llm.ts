/**
 * LLM wrapper — now uses Anthropic Claude Sonnet instead of Manus Forge/Gemini.
 * The public API surface (invokeLLM, types) is unchanged so all callers work as-is.
 */
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = { type: "text"; text: string };
export type ImageContent = { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };
export type FileContent = { type: "file_url"; file_url: { url: string; mime_type?: string } };
export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  maxTokens?: number;
  max_tokens?: number;
  // These are accepted but ignored for Anthropic compat
  toolChoice?: unknown;
  tool_choice?: unknown;
  outputSchema?: unknown;
  output_schema?: unknown;
  responseFormat?: unknown;
  response_format?: unknown;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(content: MessageContent | MessageContent[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(c => (typeof c === "string" ? c : c.type === "text" ? c.text : ""))
      .join("\n");
  }
  if (content.type === "text") return content.text;
  return "";
}

// Convert messages to Anthropic format, pulling system messages out
function toAnthropicMessages(messages: Message[]): {
  system: string | undefined;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systemParts: string[] = [];
  const converted: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(extractText(msg.content));
    } else if (msg.role === "user" || msg.role === "assistant") {
      converted.push({ role: msg.role, content: extractText(msg.content) });
    }
    // tool/function roles are skipped — not used in blog generation
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: converted,
  };
}

// ── Main invocation ───────────────────────────────────────────────────────────

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const apiKey = ENV.anthropicApiKey;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const maxTokens = params.maxTokens ?? params.max_tokens ?? 4000;
  const { system, messages } = toAnthropicMessages(params.messages);

  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-5",
    max_tokens: maxTokens,
    messages,
  };
  if (system) body.system = system;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API failed: ${response.status} ${err}`);
  }

  const data = await response.json() as {
    id: string;
    content: Array<{ type: string; text?: string }>;
    model: string;
    usage?: { input_tokens: number; output_tokens: number };
  };

  const textContent = data.content.find(c => c.type === "text")?.text ?? "";

  // Return in OpenAI-compatible shape so all existing callers work unchanged
  return {
    id: data.id,
    created: Math.floor(Date.now() / 1000),
    model: data.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: textContent },
        finish_reason: "stop",
      },
    ],
    usage: data.usage
      ? {
          prompt_tokens: data.usage.input_tokens,
          completion_tokens: data.usage.output_tokens,
          total_tokens: data.usage.input_tokens + data.usage.output_tokens,
        }
      : undefined,
  };
}
