import type { Message, LlmContentPart } from "./message";
import type { ToolDeclaration } from "./tool";

export interface LlmGenerateOptions {
  messages: Message[];
  tools?: ToolDeclaration[];
  systemPrompt?: string;
  maxTokens?: number;
  outputSchema?: Record<string, unknown>;
}

export interface LlmResponse {
  content: LlmContentPart[];
  stopReason: "end" | "tool_use" | "max_tokens";
  usage: { input: number; output: number };
}

export interface LlmProvider {
  generate(options: LlmGenerateOptions): Promise<LlmResponse>;
}
