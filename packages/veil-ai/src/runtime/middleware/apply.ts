import type { ContentPart } from "../../protocol/message";
import type { AgentContext, ExecutionContext, ToolContext } from "../../protocol/context";
import type { AgentResult } from "../../protocol/agent";
import type { LlmGenerateOptions, LlmResponse } from "../../protocol/llm";
import type { AgentMiddleware, LlmMiddleware, ToolMiddleware } from "../../protocol/middleware";

export function applyAgentMiddleware(
  middlewares: AgentMiddleware[],
  core: (input: ContentPart[], context: AgentContext) => Promise<AgentResult>,
): (input: ContentPart[], context: AgentContext) => Promise<AgentResult> {
  let fn = core;
  for (let i = middlewares.length - 1; i >= 0; i--) {
    const mw = middlewares[i];
    const next = fn;
    fn = (input, context) => mw(input, context, () => next(input, context));
  }
  return fn;
}

export function applyLlmMiddleware(
  middlewares: LlmMiddleware[],
  core: (options: LlmGenerateOptions, context: ExecutionContext) => Promise<LlmResponse>,
): (options: LlmGenerateOptions, context: ExecutionContext) => Promise<LlmResponse> {
  let fn = core;
  for (let i = middlewares.length - 1; i >= 0; i--) {
    const mw = middlewares[i];
    const next = fn;
    fn = (options, context) => mw(options, context, () => next(options, context));
  }
  return fn;
}

export function applyToolMiddleware(
  middlewares: ToolMiddleware[],
  core: (name: string, args: Record<string, unknown>, context: ToolContext) => Promise<unknown>,
): (name: string, args: Record<string, unknown>, context: ToolContext) => Promise<unknown> {
  let fn = core;
  for (let i = middlewares.length - 1; i >= 0; i--) {
    const mw = middlewares[i];
    const next = fn;
    fn = (name, args, context) => mw(name, args, context, () => next(name, args, context));
  }
  return fn;
}
