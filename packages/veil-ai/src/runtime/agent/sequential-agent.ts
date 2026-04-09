import type { ContentPart } from "../../protocol/message";
import type { AgentContext } from "../../protocol/context";
import type { BaseAgent, AgentResult } from "../../protocol/agent";
import { AbortError } from "../../protocol/errors";
import { saveOutputToState } from "./output-key";

export interface SequentialAgentConfig {
  name: string;
  description: string;
  agents: BaseAgent[];
  outputKey?: string;
}

export class SequentialAgent implements BaseAgent {
  readonly name: string;
  readonly description: string;
  private readonly agents: BaseAgent[];
  private readonly outputKey?: string;

  constructor(config: SequentialAgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.agents = config.agents;
    this.outputKey = config.outputKey;
  }

  async run(input: ContentPart[], context: AgentContext): Promise<AgentResult> {
    let currentInput = input;
    let lastResult: AgentResult = { type: "response", response: input };

    for (const agent of this.agents) {
      if (context.signal?.aborted) {
        throw new AbortError();
      }

      lastResult = await agent.run(currentInput, context);

      if (lastResult.type !== "response") {
        return lastResult;
      }

      currentInput = lastResult.response;
    }

    saveOutputToState(lastResult, this.outputKey, context);
    return lastResult;
  }
}
