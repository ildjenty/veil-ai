import type { ToolContext } from "../../protocol/context";
import type { Tool, ToolDeclaration } from "../../protocol/tool";

export interface FunctionToolConfig {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
}

export class FunctionTool implements Tool {
  constructor(private readonly config: FunctionToolConfig) {}

  declaration(): ToolDeclaration {
    return {
      name: this.config.name,
      description: this.config.description,
      inputSchema: this.config.inputSchema,
    };
  }

  execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
    return this.config.handler(args, context);
  }
}
