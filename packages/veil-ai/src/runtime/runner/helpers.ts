import type { ContentPart } from "../../protocol/message";
import type { ResolveArtifactService, ResolveMemoryService, ResolveSessionService } from "../../protocol/register";
import type { Session } from "../../protocol/session";
import type { BaseAgent, AgentResult } from "../../protocol/agent";
import type { ExecutionContext } from "../../protocol/context";
import { AgentEngineError } from "../../protocol/errors";

export function resolveTransfer(
  result: AgentResult,
  agentMap: Map<string, BaseAgent>,
): { agent: BaseAgent; input: ContentPart[] } | null {
  if (result.type !== "transfer") return null;

  const target = agentMap.get(result.targetAgent);
  if (!target) {
    throw new AgentEngineError(
      `Transfer target agent not found: ${result.targetAgent}`,
    );
  }
  return { agent: target, input: result.message };
}

export function buildContext(
  session: Session,
  services: {
    sessionService: ResolveSessionService;
    artifactService?: ResolveArtifactService;
    memoryService?: ResolveMemoryService;
  },
  signal?: AbortSignal,
): ExecutionContext {
  return {
    session,
    sessionService: services.sessionService,
    artifactService: services.artifactService,
    memoryService: services.memoryService,
    signal,
  };
}
