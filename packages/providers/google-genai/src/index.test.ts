import { describe, it, expect, vi } from "vitest";
import type { Message, ContentPart } from "veil-ai";
import { toGeminiContents, toGeminiPart, fromGeminiResponse } from "./index";

describe("toGeminiContents", () => {
  it("maps user role to user, assistant to model", () => {
    const messages: Message[] = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
    ];
    const result = toGeminiContents(messages);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("model");
  });

  it("resolves tool name for tool_result via toolNameMap", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "tc_1", name: "search", args: { q: "x" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", toolUseId: "tc_1", content: "found it" },
        ],
      },
    ];
    const result = toGeminiContents(messages);
    const fnResponse = result[1].parts![0];
    expect((fnResponse as any).functionResponse.name).toBe("search");
    expect((fnResponse as any).functionResponse.id).toBe("tc_1");
  });
});

describe("toGeminiPart", () => {
  it("converts text part", () => {
    const part: ContentPart = { type: "text", text: "hello" };
    expect(toGeminiPart(part, new Map())).toEqual({ text: "hello" });
  });

  it("converts tool_use to functionCall", () => {
    const part: ContentPart = {
      type: "tool_use",
      id: "tc_1",
      name: "search",
      args: { q: "test" },
    };
    expect(toGeminiPart(part, new Map())).toEqual({
      functionCall: { name: "search", args: { q: "test" } },
    });
  });

  it("converts tool_result to functionResponse with name from map", () => {
    const part: ContentPart = {
      type: "tool_result",
      toolUseId: "tc_1",
      content: "result",
    };
    const map = new Map([["tc_1", "search"]]);
    expect(toGeminiPart(part, map)).toEqual({
      functionResponse: {
        id: "tc_1",
        name: "search",
        response: { output: "result" },
      },
    });
  });

  it("converts structured to JSON text", () => {
    const part: ContentPart = { type: "structured", data: { x: 1 } };
    expect(toGeminiPart(part, new Map())).toEqual({ text: '{"x":1}' });
  });
});

describe("fromGeminiResponse", () => {
  it("converts text response", () => {
    const response = {
      candidates: [
        {
          content: { role: "model", parts: [{ text: "Hello!" }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    };
    const result = fromGeminiResponse(response as any, false);
    expect(result.content).toEqual([{ type: "text", text: "Hello!" }]);
    expect(result.stopReason).toBe("end");
    expect(result.usage).toEqual({ input: 10, output: 5 });
  });

  it("converts function call response", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "mock-uuid" });

    const response = {
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              { functionCall: { name: "search", args: { q: "test" } } },
            ],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    };
    const result = fromGeminiResponse(response as any, false);
    expect(result.content).toEqual([
      { type: "tool_use", id: "mock-uuid", name: "search", args: { q: "test" } },
    ]);
    expect(result.stopReason).toBe("tool_use");

    vi.unstubAllGlobals();
  });

  it("converts text to structured when outputSchema is set", () => {
    const response = {
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text: '{"answer":42}' }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    };
    const result = fromGeminiResponse(response as any, true);
    expect(result.content).toEqual([
      { type: "structured", data: { answer: 42 } },
    ]);
  });

  it("maps MAX_TOKENS finish reason", () => {
    const response = {
      candidates: [
        {
          content: { role: "model", parts: [{ text: "partial" }] },
          finishReason: "MAX_TOKENS",
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 100 },
    };
    const result = fromGeminiResponse(response as any, false);
    expect(result.stopReason).toBe("max_tokens");
  });

  it("handles empty candidates", () => {
    const response = {
      candidates: [],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
    };
    const result = fromGeminiResponse(response as any, false);
    expect(result.content).toEqual([]);
    expect(result.stopReason).toBe("end");
  });
});
