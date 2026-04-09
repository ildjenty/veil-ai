import { describe, it, expect } from "vitest";
import type { Message, ToolDeclaration } from "veil-ai";
import {
  toOpenAIMessages,
  toOpenAITool,
  fromOpenAIMessage,
  mapFinishReason,
} from "./index";

describe("toOpenAIMessages", () => {
  it("prepends system prompt if provided", () => {
    const messages: Message[] = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
    ];
    const result = toOpenAIMessages(messages, "You are helpful.");
    expect(result[0]).toEqual({ role: "system", content: "You are helpful." });
    expect(result[1]).toEqual({ role: "user", content: "hi" });
  });

  it("omits system message when no systemPrompt", () => {
    const messages: Message[] = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
    ];
    const result = toOpenAIMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: "user", content: "hi" });
  });

  it("converts tool_result parts to tool role messages", () => {
    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "tool_result", toolUseId: "tc_1", content: '{"temp":22}' },
        ],
      },
    ];
    const result = toOpenAIMessages(messages);
    expect(result).toEqual([
      { role: "tool", tool_call_id: "tc_1", content: '{"temp":22}' },
    ]);
  });

  it("converts assistant messages with tool_calls", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "tc_1", name: "search", args: { q: "test" } },
        ],
      },
    ];
    const result = toOpenAIMessages(messages);
    expect(result).toHaveLength(1);
    const msg = result[0] as any;
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("Let me check.");
    expect(msg.tool_calls).toEqual([
      {
        id: "tc_1",
        type: "function",
        function: { name: "search", arguments: '{"q":"test"}' },
      },
    ]);
  });

  it("handles assistant message with only tool_use (no text)", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "tc_1", name: "fn", args: {} },
        ],
      },
    ];
    const result = toOpenAIMessages(messages);
    const msg = result[0] as any;
    expect(msg.content).toBeNull();
    expect(msg.tool_calls).toHaveLength(1);
  });

  it("handles user message with mixed text and tool_result", () => {
    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "tool_result", toolUseId: "tc_1", content: "result" },
          { type: "text", text: "Also this" },
        ],
      },
    ];
    const result = toOpenAIMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      role: "tool",
      tool_call_id: "tc_1",
      content: "result",
    });
    expect(result[1]).toEqual({ role: "user", content: "Also this" });
  });
});

describe("toOpenAITool", () => {
  it("wraps ToolDeclaration in function type", () => {
    const tool: ToolDeclaration = {
      name: "get_weather",
      description: "Get weather",
      inputSchema: {
        type: "object",
        properties: { city: { type: "string" } },
      },
    };
    expect(toOpenAITool(tool)).toEqual({
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather",
        parameters: tool.inputSchema,
      },
    });
  });
});

describe("fromOpenAIMessage", () => {
  it("converts text content", () => {
    const msg = { role: "assistant" as const, content: "Hello", refusal: null };
    expect(fromOpenAIMessage(msg as any, false)).toEqual([
      { type: "text", text: "Hello" },
    ]);
  });

  it("converts text content to structured when outputSchema is set", () => {
    const msg = {
      role: "assistant" as const,
      content: '{"answer":42}',
      refusal: null,
    };
    expect(fromOpenAIMessage(msg as any, true)).toEqual([
      { type: "structured", data: { answer: 42 } },
    ]);
  });

  it("falls back to text when JSON parse fails with outputSchema", () => {
    const msg = {
      role: "assistant" as const,
      content: "not json",
      refusal: null,
    };
    expect(fromOpenAIMessage(msg as any, true)).toEqual([
      { type: "text", text: "not json" },
    ]);
  });

  it("converts tool_calls", () => {
    const msg = {
      role: "assistant" as const,
      content: null,
      refusal: null,
      tool_calls: [
        {
          id: "tc_1",
          type: "function" as const,
          function: { name: "search", arguments: '{"q":"test"}' },
        },
      ],
    };
    expect(fromOpenAIMessage(msg as any, false)).toEqual([
      { type: "tool_use", id: "tc_1", name: "search", args: { q: "test" } },
    ]);
  });

  it("returns empty for null content and no tool_calls", () => {
    const msg = { role: "assistant" as const, content: null, refusal: null };
    expect(fromOpenAIMessage(msg as any, false)).toEqual([]);
  });
});

describe("mapFinishReason", () => {
  it("maps stop to end", () => {
    expect(mapFinishReason("stop")).toBe("end");
  });

  it("maps tool_calls to tool_use", () => {
    expect(mapFinishReason("tool_calls")).toBe("tool_use");
  });

  it("maps length to max_tokens", () => {
    expect(mapFinishReason("length")).toBe("max_tokens");
  });

  it("maps null to end", () => {
    expect(mapFinishReason(null)).toBe("end");
  });
});
