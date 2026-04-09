export type Role = "user" | "assistant";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolUsePart {
  type: "tool_use";
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultPart {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export interface StructuredPart {
  type: "structured";
  data: Record<string, unknown>;
}

export type LlmContentPart = TextPart | ToolUsePart | StructuredPart;

export type ContentPart = TextPart | ToolUsePart | ToolResultPart | StructuredPart;

export interface Message {
  role: Role;
  content: ContentPart[];
}
