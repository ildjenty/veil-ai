import OpenAI from "openai";
import type {
  LlmProvider,
  LlmGenerateOptions,
  LlmResponse,
  LlmContentPart,
  Message,
  ContentPart,
  ToolDeclaration,
} from "veil-ai";

export interface OpenAIProviderConfig {
  model: string;
  client?: OpenAI;
  maxTokens?: number;
}

export class OpenAIProvider implements LlmProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly defaultMaxTokens: number;

  constructor(config: OpenAIProviderConfig) {
    this.client = config.client ?? new OpenAI();
    this.model = config.model;
    this.defaultMaxTokens = config.maxTokens ?? 4096;
  }

  async generate(options: LlmGenerateOptions): Promise<LlmResponse> {
    const messages = toOpenAIMessages(options.messages, options.systemPrompt);

    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: options.maxTokens ?? this.defaultMaxTokens,
      messages,
    };

    if (options.tools && options.tools.length > 0) {
      params.tools = options.tools.map(toOpenAITool);
    }

    if (options.outputSchema) {
      params.response_format = {
        type: "json_schema",
        json_schema: {
          name: "response",
          schema: options.outputSchema,
          strict: true,
        },
      };
    }

    const response = await this.client.chat.completions.create(params);
    const choice = response.choices[0];

    return {
      content: fromOpenAIMessage(choice.message, options.outputSchema != null),
      stopReason: mapFinishReason(choice.finish_reason),
      usage: {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}

export function toOpenAIMessages(
  messages: Message[],
  systemPrompt?: string,
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    result.push({ role: "system", content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === "user") {
      const toolResults = msg.content.filter(
        (p): p is Extract<ContentPart, { type: "tool_result" }> =>
          p.type === "tool_result",
      );
      const otherParts = msg.content.filter((p) => p.type !== "tool_result");

      for (const part of toolResults) {
        result.push({
          role: "tool",
          tool_call_id: part.toolUseId,
          content: part.content,
        });
      }

      if (otherParts.length > 0) {
        const text = otherParts
          .map((p) => {
            if (p.type === "text") return p.text;
            if (p.type === "structured") return JSON.stringify(p.data);
            return "";
          })
          .filter(Boolean)
          .join("\n");
        if (text) {
          result.push({ role: "user", content: text });
        }
      }
    } else {
      const textParts = msg.content.filter(
        (p) => p.type === "text" || p.type === "structured",
      );
      const toolUseParts = msg.content.filter(
        (p): p is Extract<ContentPart, { type: "tool_use" }> =>
          p.type === "tool_use",
      );

      const content = textParts
        .map((p) => {
          if (p.type === "text") return p.text;
          if (p.type === "structured") return JSON.stringify(p.data);
          return "";
        })
        .join("");

      const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: content || null,
      };

      if (toolUseParts.length > 0) {
        assistantMsg.tool_calls = toolUseParts.map((p) => ({
          id: p.id,
          type: "function" as const,
          function: { name: p.name, arguments: JSON.stringify(p.args) },
        }));
      }

      result.push(assistantMsg);
    }
  }

  return result;
}

export function toOpenAITool(tool: ToolDeclaration): OpenAI.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

export function fromOpenAIMessage(
  message: OpenAI.ChatCompletionMessage,
  hasOutputSchema: boolean,
): LlmContentPart[] {
  const parts: LlmContentPart[] = [];

  if (message.content) {
    if (hasOutputSchema) {
      try {
        const data = JSON.parse(message.content);
        parts.push({ type: "structured", data });
      } catch {
        parts.push({ type: "text", text: message.content });
      }
    } else {
      parts.push({ type: "text", text: message.content });
    }
  }

  if (message.tool_calls) {
    for (const tc of message.tool_calls) {
      if (tc.type === "function") {
        parts.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        });
      }
    }
  }

  return parts;
}

export function mapFinishReason(reason: string | null): LlmResponse["stopReason"] {
  switch (reason) {
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    default:
      return "end";
  }
}
