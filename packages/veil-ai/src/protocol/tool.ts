import type { ToolContext } from "./context";

export interface ToolDeclaration {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface Tool {
  declaration(): ToolDeclaration;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<unknown>;
}
