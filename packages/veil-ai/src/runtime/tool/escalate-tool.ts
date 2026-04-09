import type { ToolContext } from "../../protocol/context";
import type { Tool, ToolDeclaration } from "../../protocol/tool";
import { EscalateSignal } from "../../protocol/errors";

export interface EscalateToolConfig {
  description?: string;
  reasonDescription?: string;
}

const DEFAULT_DESCRIPTION =
  "Escalate the conversation when you cannot handle the request. Use this when the task is outside your capabilities or requires human intervention.";

const DEFAULT_REASON_DESCRIPTION = "Reason for escalation.";

export class EscalateTool implements Tool {
  private readonly description: string;
  private readonly reasonDescription: string;

  constructor(config?: EscalateToolConfig) {
    this.description = config?.description ?? DEFAULT_DESCRIPTION;
    this.reasonDescription = config?.reasonDescription ?? DEFAULT_REASON_DESCRIPTION;
  }

  declaration(): ToolDeclaration {
    return {
      name: "escalate",
      description: this.description,
      inputSchema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: this.reasonDescription,
          },
        },
        required: ["reason"],
      },
    };
  }

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<never> {
    const reason = typeof args.reason === "string" ? args.reason : String(args.reason);
    throw new EscalateSignal(reason);
  }
}
