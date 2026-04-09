import type { BaseAgent } from "../../protocol/agent";
import type { ToolContext } from "../../protocol/context";
import type { Tool, ToolDeclaration } from "../../protocol/tool";
import { AgentEngineError, TransferSignal } from "../../protocol/errors";

export interface TransferToolConfig {
  agents: BaseAgent[];
  description?: string;
  agentNameDescription?: string;
  messageDescription?: string;
  agentListBuilder?: (agents: BaseAgent[]) => string;
}

const DEFAULT_DESCRIPTION =
  "Transfer the conversation to another agent. Use this when another agent is better suited to handle the user's request.";

const DEFAULT_AGENT_NAME_DESCRIPTION = "Name of the agent to transfer to.";

const DEFAULT_MESSAGE_DESCRIPTION =
  "Message to pass to the target agent, summarizing the user's request and any relevant context.";

function defaultAgentListBuilder(agents: BaseAgent[]): string {
  const list = agents.map((a) => `- ${a.name}: ${a.description}`).join("\n");
  return `Available agents:\n${list}`;
}

export class TransferTool implements Tool {
  private readonly agents: BaseAgent[];
  private readonly description: string;
  private readonly agentNameDescription: string;
  private readonly messageDescription: string;
  private readonly agentListBuilder: (agents: BaseAgent[]) => string;

  constructor(config: TransferToolConfig) {
    this.agents = config.agents;
    this.description = config.description ?? DEFAULT_DESCRIPTION;
    this.agentNameDescription = config.agentNameDescription ?? DEFAULT_AGENT_NAME_DESCRIPTION;
    this.messageDescription = config.messageDescription ?? DEFAULT_MESSAGE_DESCRIPTION;
    this.agentListBuilder = config.agentListBuilder ?? defaultAgentListBuilder;
  }

  declaration(): ToolDeclaration {
    const agentDescriptions = this.agentListBuilder(this.agents);
    return {
      name: "transfer_to_agent",
      description: `${this.description}\n\n${agentDescriptions}`,
      inputSchema: {
        type: "object",
        properties: {
          agentName: {
            type: "string",
            description: this.agentNameDescription,
            enum: this.agents.map((a) => a.name),
          },
          message: {
            type: "string",
            description: this.messageDescription,
          },
        },
        required: ["agentName", "message"],
      },
    };
  }

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<never> {
    const agentName = typeof args.agentName === "string" ? args.agentName : String(args.agentName);
    const message = typeof args.message === "string" ? args.message : String(args.message);
    const target = this.agents.find((a) => a.name === agentName);
    if (!target) {
      throw new AgentEngineError(`Transfer target agent not found: ${agentName}`);
    }
    throw new TransferSignal(agentName, message);
  }
}
