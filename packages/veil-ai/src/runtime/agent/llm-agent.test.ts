import { describe, it, expect, vi } from "vitest";
import { LlmAgent } from "./llm-agent";
import { FunctionTool } from "../tool/function-tool";
import { TransferSignal, EscalateSignal, MaxTurnsExceededError, LlmProviderError, AbortError } from "../../protocol/errors";
import { createMockLlm, textResponse, toolUseResponse, structuredResponse, createContext } from "../../__test__/mocks";
import type { ToolContext } from "../../protocol/context";

function createAgent(overrides: Partial<ConstructorParameters<typeof LlmAgent>[0]> = {}) {
  return new LlmAgent({
    name: "test",
    description: "test agent",
    instruction: "You are a test agent.",
    tools: [],
    llm: createMockLlm(textResponse("hello")),
    ...overrides,
  });
}

describe("LlmAgent", () => {
  it("returns text response when LLM responds without tool use", async () => {
    const agent = createAgent();
    const result = await agent.run([{ type: "text", text: "hi" }], createContext());

    expect(result.type).toBe("response");
    if (result.type === "response") {
      expect(result.response).toEqual([{ type: "text", text: "hello" }]);
    }
  });

  it("executes tool and returns final response", async () => {
    const handler = vi.fn(async () => ({ value: 42 }));
    const tool = new FunctionTool({
      name: "calc",
      description: "calculate",
      inputSchema: { type: "object", properties: { x: { type: "number" } } },
      handler,
    });

    const llm = createMockLlm(
      toolUseResponse([{ id: "t1", name: "calc", args: { x: 1 } }]),
      textResponse("result is 42"),
    );

    const agent = createAgent({ tools: [tool], llm });
    const result = await agent.run([{ type: "text", text: "calc" }], createContext());

    expect(handler).toHaveBeenCalledWith({ x: 1 }, expect.any(Object));
    expect(result.type).toBe("response");
    if (result.type === "response") {
      expect(result.response).toEqual([{ type: "text", text: "result is 42" }]);
    }
  });

  it("handles multiple tool calls in one response", async () => {
    const handler = vi.fn(async (args: Record<string, unknown>) => args);
    const tool = new FunctionTool({
      name: "echo",
      description: "echo",
      inputSchema: { type: "object" },
      handler,
    });

    const llm = createMockLlm(
      toolUseResponse([
        { id: "t1", name: "echo", args: { a: 1 } },
        { id: "t2", name: "echo", args: { b: 2 } },
      ]),
      textResponse("done"),
    );

    const agent = createAgent({ tools: [tool], llm });
    await agent.run([{ type: "text", text: "go" }], createContext());

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("sends tool error as isError tool_result", async () => {
    const tool = new FunctionTool({
      name: "fail",
      description: "fails",
      inputSchema: { type: "object" },
      handler: async () => { throw new Error("boom"); },
    });

    const llm = createMockLlm(
      toolUseResponse([{ id: "t1", name: "fail", args: {} }]),
      textResponse("handled error"),
    );

    const agent = createAgent({ tools: [tool], llm });
    const ctx = createContext();
    await agent.run([{ type: "text", text: "go" }], ctx);

    const toolResultMessage = ctx.session.messages.find(
      (m) => m.role === "user" && m.content.some((p) => p.type === "tool_result"),
    );
    expect(toolResultMessage).toBeDefined();
    const toolResult = toolResultMessage!.content.find((p) => p.type === "tool_result");
    expect(toolResult).toMatchObject({ type: "tool_result", isError: true, content: "boom" });
  });

  it("returns transfer result when TransferSignal is thrown", async () => {
    const tool = new FunctionTool({
      name: "transfer",
      description: "transfer",
      inputSchema: { type: "object" },
      handler: async () => { throw new TransferSignal("other", "please handle"); },
    });

    const llm = createMockLlm(
      toolUseResponse([{ id: "t1", name: "transfer", args: {} }]),
    );

    const agent = createAgent({ tools: [tool], llm });
    const result = await agent.run([{ type: "text", text: "go" }], createContext());

    expect(result.type).toBe("transfer");
    if (result.type === "transfer") {
      expect(result.targetAgent).toBe("other");
    }
  });

  it("returns escalate result when EscalateSignal is thrown", async () => {
    const tool = new FunctionTool({
      name: "esc",
      description: "escalate",
      inputSchema: { type: "object" },
      handler: async () => { throw new EscalateSignal("cannot handle"); },
    });

    const llm = createMockLlm(
      toolUseResponse([{ id: "t1", name: "esc", args: {} }]),
    );

    const agent = createAgent({ tools: [tool], llm });
    const result = await agent.run([{ type: "text", text: "go" }], createContext());

    expect(result.type).toBe("escalate");
    if (result.type === "escalate") {
      expect(result.reason).toBe("cannot handle");
    }
  });

  it("throws MaxTurnsExceededError when maxTurns exceeded", async () => {
    const tool = new FunctionTool({
      name: "loop",
      description: "loop",
      inputSchema: { type: "object" },
      handler: async () => "ok",
    });

    const generate = vi.fn(async () => toolUseResponse([{ id: "t1", name: "loop", args: {} }]));

    const agent = createAgent({
      tools: [tool],
      llm: { generate },
      maxTurns: 2,
    });

    await expect(agent.run([{ type: "text", text: "go" }], createContext()))
      .rejects.toThrow(MaxTurnsExceededError);
  });

  it("throws AbortError when signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const agent = createAgent();
    const ctx = createContext({ signal: controller.signal });

    await expect(agent.run([{ type: "text", text: "go" }], ctx))
      .rejects.toThrow(AbortError);
  });

  it("throws LlmProviderError on max_tokens with tool_use", async () => {
    const llm = createMockLlm({
      content: [{ type: "tool_use", id: "t1", name: "x", args: {} }],
      stopReason: "max_tokens",
      usage: { input: 10, output: 5 },
    });

    const agent = createAgent({ llm });
    await expect(agent.run([{ type: "text", text: "go" }], createContext()))
      .rejects.toThrow(LlmProviderError);
  });

  it("resolves state template in instruction", async () => {
    const llm = createMockLlm(textResponse("ok"));
    const agent = createAgent({
      instruction: "You are {{role}}.",
      llm,
    });

    const ctx = createContext();
    ctx.session.state = { role: "assistant" };
    await agent.run([{ type: "text", text: "hi" }], ctx);

    expect((llm.generate as ReturnType<typeof vi.fn>).mock.calls[0][0].systemPrompt).toBe("You are assistant.");
  });

  it("saves output to state when outputKey is set", async () => {
    const agent = createAgent({ outputKey: "result" });
    const ctx = createContext();

    await agent.run([{ type: "text", text: "hi" }], ctx);

    expect(ctx.session.state).toHaveProperty("result", "hello");
  });

  it("applies agent middleware", async () => {
    const middleware = vi.fn(async (input, context, next) => {
      const result = await next();
      return result;
    });

    const agent = createAgent({ agentMiddleware: [middleware] });
    await agent.run([{ type: "text", text: "hi" }], createContext());

    expect(middleware).toHaveBeenCalled();
  });

  it("applies tool middleware", async () => {
    const toolMw = vi.fn(async (name: string, args: Record<string, unknown>, context: ToolContext, next: () => Promise<unknown>) => {
      return next();
    });

    const tool = new FunctionTool({
      name: "t",
      description: "t",
      inputSchema: { type: "object" },
      handler: async () => "ok",
    });

    const llm = createMockLlm(
      toolUseResponse([{ id: "t1", name: "t", args: {} }]),
      textResponse("done"),
    );

    const agent = createAgent({ tools: [tool], llm, toolMiddleware: [toolMw] });
    await agent.run([{ type: "text", text: "go" }], createContext());

    expect(toolMw).toHaveBeenCalledWith("t", {}, expect.any(Object), expect.any(Function));
  });

  it("passes outputSchema to LLM and returns structured response", async () => {
    const schema = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
    const llm = createMockLlm(structuredResponse({ name: "John" }));

    const agent = createAgent({ llm, outputSchema: schema });
    const ctx = createContext();
    const result = await agent.run([{ type: "text", text: "extract" }], ctx);

    expect((llm.generate as ReturnType<typeof vi.fn>).mock.calls[0][0].outputSchema).toEqual(schema);
    expect(result.type).toBe("response");
    if (result.type === "response") {
      expect(result.response).toEqual([{ type: "structured", data: { name: "John" } }]);
    }
  });
});
