import type { ContentPart } from "./message";
import type { AgentContext } from "./context";

export interface AgentResponseResult {
  type: "response";
  response: ContentPart[];
}

export interface AgentTransferResult {
  type: "transfer";
  targetAgent: string;
  message: ContentPart[];
}

export interface AgentEscalateResult {
  type: "escalate";
  reason: string;
}

export type AgentResult = AgentResponseResult | AgentTransferResult | AgentEscalateResult;

export interface BaseAgent {
  name: string;
  description: string;
  run(input: ContentPart[], context: AgentContext): Promise<AgentResult>;
}
