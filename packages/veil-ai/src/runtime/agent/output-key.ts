import type { AgentContext } from "../../protocol/context";
import type { AgentResult } from "../../protocol/agent";

export function saveOutputToState(
  result: AgentResult,
  outputKey: string | undefined,
  context: AgentContext,
): void {
  if (!outputKey || result.type !== "response") return;
  const text = result.response
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
  context.session.state[outputKey] = text;
}
