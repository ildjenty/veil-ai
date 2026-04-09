import type { ContentPart } from "./message";
import type { AgentContext, ExecutionContext, ToolContext } from "./context";
import type { AgentResult } from "./agent";
import type { LlmGenerateOptions, LlmResponse } from "./llm";

export type AgentMiddleware = (
  input: ContentPart[],
  context: AgentContext,
  next: () => Promise<AgentResult>,
) => Promise<AgentResult>;

export type LlmMiddleware = (
  options: LlmGenerateOptions,
  context: ExecutionContext,
  next: () => Promise<LlmResponse>,
) => Promise<LlmResponse>;

export type ToolMiddleware = (
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
  next: () => Promise<unknown>,
) => Promise<unknown>;
