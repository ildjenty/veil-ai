export class AgentEngineError extends Error {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = "AgentEngineError";
  }
}

export class MaxTurnsExceededError extends AgentEngineError {
  constructor(
    public readonly turn: number,
    public readonly maxTurns: number,
  ) {
    super(`Max turns exceeded: ${turn}/${maxTurns}`);
    this.name = "MaxTurnsExceededError";
  }
}

export class ToolNotFoundError extends AgentEngineError {
  constructor(public readonly toolName: string) {
    super(`Tool not found: ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolExecutionError extends AgentEngineError {
  constructor(
    public readonly toolName: string,
    cause: Error,
  ) {
    super(`Tool execution failed: ${toolName}`, { cause });
    this.name = "ToolExecutionError";
  }
}

export class LlmProviderError extends AgentEngineError {
  constructor(cause: Error) {
    super("LLM provider error", { cause });
    this.name = "LlmProviderError";
  }
}

export class AbortError extends AgentEngineError {
  constructor() {
    super("Agent execution was aborted");
    this.name = "AbortError";
  }
}

export class TransferSignal extends AgentEngineError {
  constructor(
    public readonly targetAgent: string,
    public readonly message: string,
  ) {
    super(`Transfer to agent: ${targetAgent}`);
    this.name = "TransferSignal";
  }
}

export class EscalateSignal extends AgentEngineError {
  constructor(public readonly reason: string) {
    super(`Escalate: ${reason}`);
    this.name = "EscalateSignal";
  }
}
