import type { ContentPart } from "../../protocol/message";
import type { ToolContext } from "../../protocol/context";
import type { BaseAgent } from "../../protocol/agent";
import type { Tool, ToolDeclaration } from "../../protocol/tool";

export interface AgentToolConfig {
  agent: BaseAgent;
  name?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  inputMapper?: (args: Record<string, unknown>) => ContentPart[];
  sessionStrategy?: "isolated" | "fork";
}

const DEFAULT_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    input: { type: "string", description: "Input to the agent." },
  },
  required: ["input"],
};

function defaultInputMapper(args: Record<string, unknown>): ContentPart[] {
  const text = typeof args.input === "string" ? args.input : String(args.input);
  return [{ type: "text", text }];
}

export class AgentTool implements Tool {
  private readonly agent: BaseAgent;
  private readonly toolName: string;
  private readonly toolDescription: string;
  private readonly inputSchema: Record<string, unknown>;
  private readonly inputMapper: (args: Record<string, unknown>) => ContentPart[];
  private readonly sessionStrategy: "isolated" | "fork";

  constructor(config: AgentToolConfig) {
    this.agent = config.agent;
    this.toolName = config.name ?? config.agent.name;
    this.toolDescription = config.description ?? config.agent.description;
    this.inputSchema = config.inputSchema ?? DEFAULT_INPUT_SCHEMA;
    this.inputMapper = config.inputMapper ?? defaultInputMapper;
    this.sessionStrategy = config.sessionStrategy ?? "isolated";
  }

  declaration(): ToolDeclaration {
    return {
      name: this.toolName,
      description: this.toolDescription,
      inputSchema: this.inputSchema,
    };
  }

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
    const { session, sessionService } = context;

    const childSession = await sessionService.create();
    childSession.state = structuredClone(session.state);

    if (this.sessionStrategy === "fork") {
      childSession.messages = structuredClone(session.messages);
    }

    await sessionService.save(childSession);

    const inputParts = this.inputMapper(args);

    const childContext = {
      session: childSession,
      sessionService,
      signal: context.signal,
    };
    const result = await this.agent.run(inputParts, childContext);

    await sessionService.delete(childSession.id);

    switch (result.type) {
      case "response": {
        const text = result.response
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");
        return text;
      }
      case "transfer":
        return `Agent "${this.agent.name}" requested transfer to "${result.targetAgent}".`;
      case "escalate":
        return `Agent "${this.agent.name}" escalated: ${result.reason}`;
    }
  }
}
