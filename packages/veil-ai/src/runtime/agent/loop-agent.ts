import type { ContentPart } from "../../protocol/message";
import type { AgentContext } from "../../protocol/context";
import type { BaseAgent, AgentResult } from "../../protocol/agent";
import { AbortError, MaxTurnsExceededError } from "../../protocol/errors";
import { saveOutputToState } from "./output-key";

export interface LoopAgentConfig {
  name: string;
  description: string;
  agent: BaseAgent;
  maxIterations?: number;
  outputKey?: string;
}

const DEFAULT_MAX_ITERATIONS = 10;

export class LoopAgent implements BaseAgent {
  readonly name: string;
  readonly description: string;
  private readonly agent: BaseAgent;
  private readonly maxIterations: number;
  private readonly outputKey?: string;

  constructor(config: LoopAgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.agent = config.agent;
    this.maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.outputKey = config.outputKey;
  }

  async run(input: ContentPart[], context: AgentContext): Promise<AgentResult> {
    let currentInput = input;

    for (let i = 0; i < this.maxIterations; i++) {
      if (context.signal?.aborted) {
        throw new AbortError();
      }

      const result = await this.agent.run(currentInput, context);

      switch (result.type) {
        case "escalate": {
          const finalResult: AgentResult = {
            type: "response",
            response: [{ type: "text", text: result.reason }],
          };
          saveOutputToState(finalResult, this.outputKey, context);
          return finalResult;
        }
        case "transfer":
          return result;
        case "response":
          currentInput = result.response;
          break;
      }
    }

    throw new MaxTurnsExceededError(this.maxIterations, this.maxIterations);
  }
}
