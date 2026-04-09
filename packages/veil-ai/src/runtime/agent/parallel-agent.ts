import type { ContentPart } from "../../protocol/message";
import type { AgentContext } from "../../protocol/context";
import type { BaseAgent, AgentResult } from "../../protocol/agent";
import { saveOutputToState } from "./output-key";

export interface ParallelAgentConfig {
  name: string;
  description: string;
  agents: BaseAgent[];
  outputKey?: string;
}

export class ParallelAgent implements BaseAgent {
  readonly name: string;
  readonly description: string;
  private readonly agents: BaseAgent[];
  private readonly outputKey?: string;

  constructor(config: ParallelAgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.agents = config.agents;
    this.outputKey = config.outputKey;
  }

  async run(input: ContentPart[], context: AgentContext): Promise<AgentResult> {
    const results = await Promise.all(
      this.agents.map((agent) => agent.run(input, context)),
    );

    const escalate = results.find((r) => r.type === "escalate");
    if (escalate) return escalate;

    const transfer = results.find((r) => r.type === "transfer");
    if (transfer) return transfer;

    const combined: ContentPart[] = results.flatMap((r) =>
      r.type === "response" ? r.response : [],
    );

    const result: AgentResult = { type: "response", response: combined };
    saveOutputToState(result, this.outputKey, context);
    return result;
  }
}
