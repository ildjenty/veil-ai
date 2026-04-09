import type {
  ResolveArtifactService,
  ResolveContext,
  ResolveMemoryService,
  ResolveSessionService,
} from "./register";
import type { Session } from "./session";

export interface ExecutionContext extends ResolveContext {
  session: Session;
  sessionService: ResolveSessionService;
  artifactService?: ResolveArtifactService;
  memoryService?: ResolveMemoryService;
  signal?: AbortSignal;
}

export interface AgentContext extends ExecutionContext {}

export interface ToolContext extends ExecutionContext {}
