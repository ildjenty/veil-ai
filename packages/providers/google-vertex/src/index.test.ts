import { describe, it, expect, vi } from "vitest";
import { SchemaType } from "@google-cloud/vertexai";
import type { Message, ContentPart, ToolDeclaration } from "veil-ai";
import {
  toVertexContents,
  toVertexPart,
  toVertexFunctionDeclaration,
  toVertexSchema,
  fromVertexResponse,
} from "./index";

describe("toVertexContents", () => {
  it("maps user role to user, assistant to model", () => {
    const messages: Message[] = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
    ];
    const result = toVertexContents(messages);
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
    const result = toVertexContents(messages);
    const fnResponse = result[1].parts[0] as any;
    expect(fnResponse.functionResponse.name).toBe("search");
  });
});

describe("toVertexPart", () => {
  it("converts text part", () => {
    const part: ContentPart = { type: "text", text: "hello" };
    expect(toVertexPart(part, new Map())).toEqual({ text: "hello" });
  });

  it("converts tool_use to functionCall", () => {
    const part: ContentPart = {
      type: "tool_use",
      id: "tc_1",
      name: "search",
      args: { q: "test" },
    };
    expect(toVertexPart(part, new Map())).toEqual({
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
    expect(toVertexPart(part, map)).toEqual({
      functionResponse: {
        name: "search",
        response: { output: "result" },
      },
    });
  });

  it("converts structured to JSON text", () => {
    const part: ContentPart = { type: "structured", data: { x: 1 } };
    expect(toVertexPart(part, new Map())).toEqual({ text: '{"x":1}' });
  });
});

describe("toVertexFunctionDeclaration", () => {
  it("converts ToolDeclaration with schema type mapping", () => {
    const tool: ToolDeclaration = {
      name: "get_weather",
      description: "Get weather",
      inputSchema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    };
    const result = toVertexFunctionDeclaration(tool);
    expect(result.name).toBe("get_weather");
    expect(result.description).toBe("Get weather");
    expect(result.parameters).toEqual({
      type: SchemaType.OBJECT,
      properties: { city: { type: SchemaType.STRING } },
      required: ["city"],
    });
  });
});

describe("toVertexSchema", () => {
  it("maps JSON Schema types to SchemaType enum", () => {
    expect(toVertexSchema({ type: "string" })).toEqual({ type: SchemaType.STRING });
    expect(toVertexSchema({ type: "number" })).toEqual({ type: SchemaType.NUMBER });
    expect(toVertexSchema({ type: "integer" })).toEqual({ type: SchemaType.INTEGER });
    expect(toVertexSchema({ type: "boolean" })).toEqual({ type: SchemaType.BOOLEAN });
    expect(toVertexSchema({ type: "array", items: { type: "string" } })).toEqual({
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    });
    expect(toVertexSchema({ type: "object" })).toEqual({ type: SchemaType.OBJECT });
  });

  it("preserves description, enum, required, nullable", () => {
    const schema = {
      type: "string",
      description: "A color",
      enum: ["red", "blue"],
      nullable: true,
    };
    expect(toVertexSchema(schema)).toEqual({
      type: SchemaType.STRING,
      description: "A color",
      enum: ["red", "blue"],
      nullable: true,
    });
  });

  it("recursively converts nested properties", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        address: {
          type: "object",
          properties: {
            city: { type: "string" },
          },
        },
      },
    };
    const result = toVertexSchema(schema);
    expect(result.properties.name).toEqual({ type: SchemaType.STRING });
    expect(result.properties.address.properties.city).toEqual({
      type: SchemaType.STRING,
    });
  });
});

describe("fromVertexResponse", () => {
  it("converts text response", () => {
    const response = {
      candidates: [
        {
          content: { role: "model", parts: [{ text: "Hello!" }] },
          finishReason: "STOP",
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    };
    const result = fromVertexResponse(response as any, false);
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
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    };
    const result = fromVertexResponse(response as any, false);
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
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    };
    const result = fromVertexResponse(response as any, true);
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
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 100,
        totalTokenCount: 110,
      },
    };
    const result = fromVertexResponse(response as any, false);
    expect(result.stopReason).toBe("max_tokens");
  });
});
