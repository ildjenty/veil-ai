import { describe, it, expect } from "vitest";
import type { Message, ContentPart, ToolDeclaration } from "veil-ai";
import {
  toAnthropicMessage,
  toAnthropicContentBlock,
  toAnthropicTool,
  fromAnthropicContent,
  mapStopReason,
} from "./index";

describe("toAnthropicMessage", () => {
  it("converts a user text message", () => {
    const msg: Message = {
      role: "user",
      content: [{ type: "text", text: "hello" }],
    };
    const result = toAnthropicMessage(msg);
    expect(result).toEqual({
      role: "user",
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("converts an assistant message with tool_use", () => {
    const msg: Message = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me check." },
        { type: "tool_use", id: "tc_1", name: "search", args: { q: "test" } },
      ],
    };
    const result = toAnthropicMessage(msg);
    expect(result.role).toBe("assistant");
    expect(result.content).toHaveLength(2);
    expect(result.content[1]).toEqual({
      type: "tool_use",
      id: "tc_1",
      name: "search",
      input: { q: "test" },
    });
  });
});

describe("toAnthropicContentBlock", () => {
  it("converts text part", () => {
    const part: ContentPart = { type: "text", text: "hi" };
    expect(toAnthropicContentBlock(part)).toEqual({ type: "text", text: "hi" });
  });

  it("converts tool_use part (args -> input)", () => {
    const part: ContentPart = {
      type: "tool_use",
      id: "tc_1",
      name: "fn",
      args: { x: 1 },
    };
    expect(toAnthropicContentBlock(part)).toEqual({
      type: "tool_use",
      id: "tc_1",
      name: "fn",
      input: { x: 1 },
    });
  });

  it("converts tool_result part (toolUseId -> tool_use_id, isError -> is_error)", () => {
    const part: ContentPart = {
      type: "tool_result",
      toolUseId: "tc_1",
      content: "result",
      isError: false,
    };
    expect(toAnthropicContentBlock(part)).toEqual({
      type: "tool_result",
      tool_use_id: "tc_1",
      content: "result",
      is_error: false,
    });
  });

  it("converts structured part to text JSON", () => {
    const part: ContentPart = {
      type: "structured",
      data: { answer: 42 },
    };
    const result = toAnthropicContentBlock(part);
    expect(result).toEqual({ type: "text", text: '{"answer":42}' });
  });
});

describe("toAnthropicTool", () => {
  it("converts ToolDeclaration to Anthropic Tool format", () => {
    const tool: ToolDeclaration = {
      name: "get_weather",
      description: "Get weather",
      inputSchema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    };
    const result = toAnthropicTool(tool);
    expect(result.name).toBe("get_weather");
    expect(result.description).toBe("Get weather");
    expect(result.input_schema).toEqual(tool.inputSchema);
  });
});

describe("fromAnthropicContent", () => {
  it("converts text block", () => {
    const block = { type: "text" as const, text: "hello", citations: null };
    expect(fromAnthropicContent(block)).toEqual([
      { type: "text", text: "hello" },
    ]);
  });

  it("converts tool_use block (input -> args)", () => {
    const block = {
      type: "tool_use" as const,
      id: "tc_1",
      name: "search",
      input: { q: "test" },
    };
    expect(fromAnthropicContent(block as any)).toEqual([
      { type: "tool_use", id: "tc_1", name: "search", args: { q: "test" } },
    ]);
  });

  it("returns empty array for unknown block types", () => {
    const block = { type: "thinking" as any, thinking: "..." };
    expect(fromAnthropicContent(block as any)).toEqual([]);
  });
});

describe("mapStopReason", () => {
  it("maps end_turn to end", () => {
    expect(mapStopReason("end_turn")).toBe("end");
  });

  it("maps tool_use to tool_use", () => {
    expect(mapStopReason("tool_use")).toBe("tool_use");
  });

  it("maps max_tokens to max_tokens", () => {
    expect(mapStopReason("max_tokens")).toBe("max_tokens");
  });

  it("maps null to end", () => {
    expect(mapStopReason(null)).toBe("end");
  });

  it("maps stop_sequence to end", () => {
    expect(mapStopReason("stop_sequence")).toBe("end");
  });
});
