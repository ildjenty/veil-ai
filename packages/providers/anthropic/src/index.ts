import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmProvider,
  LlmGenerateOptions,
  LlmResponse,
  LlmContentPart,
  Message,
  ContentPart,
  ToolDeclaration,
} from "veil-ai";

export interface AnthropicProviderConfig {
  model: string;
  client?: Anthropic;
  maxTokens?: number;
}

export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly defaultMaxTokens: number;

  constructor(config: AnthropicProviderConfig) {
    this.client = config.client ?? new Anthropic();
    this.model = config.model;
    this.defaultMaxTokens = config.maxTokens ?? 4096;
  }

  async generate(options: LlmGenerateOptions): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? this.defaultMaxTokens,
      system: options.systemPrompt,
      messages: options.messages.map(toAnthropicMessage),
      tools: options.tools?.map(toAnthropicTool),
    });

    return {
      content: response.content.flatMap(fromAnthropicContent),
      stopReason: mapStopReason(response.stop_reason),
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  }
}

export function toAnthropicMessage(message: Message): Anthropic.MessageParam {
  return {
    role: message.role,
    content: message.content.map(toAnthropicContentBlock),
  };
}

export function toAnthropicContentBlock(
  part: ContentPart,
): Anthropic.ContentBlockParam {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "tool_use":
      return {
        type: "tool_use",
        id: part.id,
        name: part.name,
        input: part.args,
      };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: part.toolUseId,
        content: part.content,
        is_error: part.isError,
      };
    case "structured":
      return { type: "text", text: JSON.stringify(part.data) };
  }
}

export function toAnthropicTool(tool: ToolDeclaration): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  };
}

export function fromAnthropicContent(block: Anthropic.ContentBlock): LlmContentPart[] {
  switch (block.type) {
    case "text":
      return [{ type: "text", text: block.text }];
    case "tool_use":
      return [
        {
          type: "tool_use",
          id: block.id,
          name: block.name,
          args: block.input as Record<string, unknown>,
        },
      ];
    default:
      return [];
  }
}

export function mapStopReason(reason: string | null): LlmResponse["stopReason"] {
  switch (reason) {
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    default:
      return "end";
  }
}
