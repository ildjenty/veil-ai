import type { ContentPart } from "../../protocol/message";
import type { ResolveArtifactService, ResolveMemoryService, ResolveSessionService } from "../../protocol/register";
import type { BaseAgent, AgentResult } from "../../protocol/agent";
import { AgentEngineError } from "../../protocol/errors";
import { resolveTransfer, buildContext } from "./helpers";

export interface RunnerConfig {
  sessionService: ResolveSessionService;
  artifactService?: ResolveArtifactService;
  memoryService?: ResolveMemoryService;
  agents?: BaseAgent[];
}

export class Runner {
  private readonly sessionService: ResolveSessionService;
  private readonly artifactService?: ResolveArtifactService;
  private readonly memoryService?: ResolveMemoryService;
  private readonly agentMap: Map<string, BaseAgent>;

  constructor(config: RunnerConfig) {
    this.sessionService = config.sessionService;
    this.artifactService = config.artifactService;
    this.memoryService = config.memoryService;
    this.agentMap = new Map((config.agents ?? []).map((a) => [a.name, a]));
  }

  async run(
    agent: BaseAgent,
    sessionId: string,
    input: ContentPart[],
    signal?: AbortSignal,
  ): Promise<AgentResult> {
    const session = await this.sessionService.get(sessionId);
    if (!session) {
      throw new AgentEngineError(`Session not found: ${sessionId}`);
    }

    try {
      let currentAgent = agent;
      let currentInput = input;

      while (true) {
        const ctx = buildContext(
          session,
          { sessionService: this.sessionService, artifactService: this.artifactService, memoryService: this.memoryService },
          signal,
        );
        const result = await currentAgent.run(currentInput, ctx);

        const transfer = resolveTransfer(result, this.agentMap);
        if (!transfer) return result;

        currentAgent = transfer.agent;
        currentInput = transfer.input;
      }
    } finally {
      await this.sessionService.save(session);
    }
  }
}
