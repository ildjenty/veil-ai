import type { Message, LlmContentPart } from "./message";
import type { ToolDeclaration } from "./tool";

export interface LlmGenerateOptions {
  messages: Message[];
  tools?: ToolDeclaration[];
  systemPrompt?: string;
  maxTokens?: number;
  outputSchema?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
}

export interface LlmResponse {
  content: LlmContentPart[];
  stopReason: "end" | "tool_use" | "max_tokens";
  usage: { input: number; output: number };
}

export interface LlmStreamChunk {
  type: "text";
  text: string;
}

export interface LlmStreamResponse {
  stream: AsyncIterable<LlmStreamChunk>;
  response: Promise<LlmResponse>;
}

export interface LlmProvider {
  generate(options: LlmGenerateOptions): Promise<LlmResponse>;
  generateStream?(options: LlmGenerateOptions): Promise<LlmStreamResponse>;
}
