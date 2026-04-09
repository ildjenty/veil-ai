import type { ContentPart, Message } from "../../protocol/message";
import type { AgentContext } from "../../protocol/context";
import type { LlmProvider, LlmGenerateOptions, LlmResponse } from "../../protocol/llm";
import type { Tool } from "../../protocol/tool";
import type { AgentMiddleware, LlmMiddleware, ToolMiddleware } from "../../protocol/middleware";
import type { BaseAgent, AgentResult } from "../../protocol/agent";
import { saveOutputToState } from "./output-key";
import {
  AbortError,
  EscalateSignal,
  LlmProviderError,
  MaxTurnsExceededError,
  ToolNotFoundError,
  TransferSignal,
} from "../../protocol/errors";
import { applyAgentMiddleware, applyLlmMiddleware, applyToolMiddleware } from "../middleware/apply";

export interface LlmAgentConfig {
  name: string;
  description: string;
  instruction: string;
  tools: Tool[];
  llm: LlmProvider;
  maxTurns?: number;
  outputKey?: string;
  outputSchema?: Record<string, unknown>;
  stateDelimiters?: [string, string];
  agentMiddleware?: AgentMiddleware[];
  llmMiddleware?: LlmMiddleware[];
  toolMiddleware?: ToolMiddleware[];
}

const DEFAULT_MAX_TURNS = 10;

export class LlmAgent implements BaseAgent {
  readonly name: string;
  readonly description: string;
  private readonly instruction: string;
  private readonly tools: Tool[];
  private readonly llm: LlmProvider;
  private readonly maxTurns: number;
  private readonly outputKey?: string;
  private readonly outputSchema?: Record<string, unknown>;
  private readonly stateDelimiters: [string, string];
  private readonly agentMiddleware: AgentMiddleware[];
  private readonly llmMiddleware: LlmMiddleware[];
  private readonly toolMiddleware: ToolMiddleware[];

  constructor(config: LlmAgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.instruction = config.instruction;
    this.tools = config.tools;
    this.llm = config.llm;
    this.maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
    this.outputKey = config.outputKey;
    this.outputSchema = config.outputSchema;
    this.stateDelimiters = config.stateDelimiters ?? ["{{", "}}"];
    this.agentMiddleware = config.agentMiddleware ?? [];
    this.llmMiddleware = config.llmMiddleware ?? [];
    this.toolMiddleware = config.toolMiddleware ?? [];
  }

  async run(input: ContentPart[], context: AgentContext): Promise<AgentResult> {
    const wrapped = applyAgentMiddleware(
      this.agentMiddleware,
      (input, context) => this.execute(input, context),
    );
    return wrapped(input, context);
  }

  private async execute(input: ContentPart[], context: AgentContext): Promise<AgentResult> {
    const { session } = context;

    session.messages.push({ role: "user", content: input });

    const toolDeclarations = this.tools.map((t) => t.declaration());
    const toolMap = new Map(this.tools.map((t) => [t.declaration().name, t]));

    const generateWithMiddleware = applyLlmMiddleware(
      this.llmMiddleware,
      (options) => this.llm.generate(options),
    );

    const executeToolWithMiddleware = applyToolMiddleware(
      this.toolMiddleware,
      (name, args, toolContext) => {
        const tool = toolMap.get(name);
        if (!tool) throw new ToolNotFoundError(name);
        return tool.execute(args, toolContext);
      },
    );

    let turn = 0;
    while (true) {
      if (context.signal?.aborted) {
        throw new AbortError();
      }

      const resolvedInstruction = this.resolveInstruction(this.instruction, session.state);
      const options: LlmGenerateOptions = {
        messages: session.messages,
        tools: toolDeclarations.length > 0 ? toolDeclarations : undefined,
        systemPrompt: resolvedInstruction,
        outputSchema: this.outputSchema,
      };

      const response: LlmResponse = await generateWithMiddleware(options, context);

      if (response.stopReason === "max_tokens") {
        const hasToolUse = response.content.some((p) => p.type === "tool_use");
        if (hasToolUse) {
          throw new LlmProviderError(new Error("Incomplete tool call due to max_tokens"));
        }
      }

      const assistantMessage: Message = { role: "assistant", content: response.content };
      session.messages.push(assistantMessage);

      const toolUseParts = response.content.filter((p) => p.type === "tool_use");
      if (toolUseParts.length === 0) {
        const responseParts: ContentPart[] = response.content.filter((p) => p.type === "text" || p.type === "structured");
        const result: AgentResult = { type: "response", response: responseParts };
        saveOutputToState(result, this.outputKey, context);
        return result;
      }

      const toolResults: ContentPart[] = [];
      for (const part of toolUseParts) {
        if (part.type !== "tool_use") continue;
        try {
          const result = await executeToolWithMiddleware(part.name, part.args, context);
          toolResults.push({ type: "tool_result", toolUseId: part.id, content: JSON.stringify(result) });
        } catch (error) {
          if (error instanceof TransferSignal) {
            session.messages.push({ role: "user", content: [{ type: "tool_result", toolUseId: part.id, content: `Transferring to ${error.targetAgent}` }] });
            return { type: "transfer", targetAgent: error.targetAgent, message: [{ type: "text", text: error.message }] };
          }
          if (error instanceof EscalateSignal) {
            session.messages.push({ role: "user", content: [{ type: "tool_result", toolUseId: part.id, content: `Escalating: ${error.reason}` }] });
            return { type: "escalate", reason: error.reason };
          }
          const err = error instanceof Error ? error : new Error(String(error));
          if (err instanceof ToolNotFoundError) throw err;
          toolResults.push({ type: "tool_result", toolUseId: part.id, content: err.message, isError: true });
        }
      }

      session.messages.push({ role: "user", content: toolResults });

      turn++;
      if (turn >= this.maxTurns) {
        throw new MaxTurnsExceededError(turn, this.maxTurns);
      }
    }
  }

  private resolveInstruction(instruction: string, state: Record<string, unknown>): string {
    const [open, close] = this.stateDelimiters;
    const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escaped(open)}(\\w+)${escaped(close)}`, "g");
    return instruction.replace(pattern, (match, key) => {
      const value = state[key];
      return value !== undefined ? String(value) : match;
    });
  }
}
