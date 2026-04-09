import { describe, it, expect, vi } from "vitest";
import { AgentTool } from "./agent-tool";
import { createMockSessionService, createContext } from "../../__test__/mocks";
import type { BaseAgent, AgentResult } from "../../protocol/agent";
import type { ContentPart } from "../../protocol/message";
import type { AgentContext } from "../../protocol/context";

function createMockAgent(result: AgentResult): BaseAgent {
  return {
    name: "child",
    description: "child agent",
    run: vi.fn(async () => result),
  };
}

describe("AgentTool", () => {
  it("runs child agent with isolated session (empty messages)", async () => {
    const agent = createMockAgent({ type: "response", response: [{ type: "text", text: "result" }] });
    const sessionService = createMockSessionService();
    const tool = new AgentTool({ agent });

    const parentCtx = createContext({ sessionService });
    parentCtx.session.messages.push({ role: "user", content: [{ type: "text", text: "parent history" }] });
    parentCtx.session.state = { key: "value" };

    const result = await tool.execute({ input: "hello" }, parentCtx);

    expect(result).toBe("result");

    const runCall = (agent.run as ReturnType<typeof vi.fn>).mock.calls[0];
    const childCtx = runCall[1] as AgentContext;
    expect(childCtx.session.messages).toEqual([]);
    expect(childCtx.session.state).toEqual({ key: "value" });
  });

  it("runs child agent with fork session (copies messages)", async () => {
    const agent = createMockAgent({ type: "response", response: [{ type: "text", text: "result" }] });
    const sessionService = createMockSessionService();
    const tool = new AgentTool({ agent, sessionStrategy: "fork" });

    const parentCtx = createContext({ sessionService });
    parentCtx.session.messages.push({ role: "user", content: [{ type: "text", text: "parent history" }] });

    await tool.execute({ input: "hello" }, parentCtx);

    const runCall = (agent.run as ReturnType<typeof vi.fn>).mock.calls[0];
    const childCtx = runCall[1] as AgentContext;
    expect(childCtx.session.messages).toHaveLength(1);
    expect(childCtx.session.messages[0].content[0]).toEqual({ type: "text", text: "parent history" });
  });

  it("deletes child session after execution", async () => {
    const agent = createMockAgent({ type: "response", response: [{ type: "text", text: "ok" }] });
    const sessionService = createMockSessionService();
    const tool = new AgentTool({ agent });

    await tool.execute({ input: "hello" }, createContext({ sessionService }));

    expect(sessionService.delete).toHaveBeenCalled();
  });

  it("does not mutate parent session state", async () => {
    const agent: BaseAgent = {
      name: "mutator",
      description: "mutates state",
      run: vi.fn(async (_input: ContentPart[], ctx: AgentContext) => {
        ctx.session.state.newKey = "mutated";
        return { type: "response" as const, response: [{ type: "text" as const, text: "ok" }] };
      }),
    };

    const sessionService = createMockSessionService();
    const tool = new AgentTool({ agent });

    const parentCtx = createContext({ sessionService });
    parentCtx.session.state = { original: true };

    await tool.execute({ input: "go" }, parentCtx);

    expect(parentCtx.session.state).toEqual({ original: true });
  });

  it("returns transfer description as text", async () => {
    const agent = createMockAgent({ type: "transfer", targetAgent: "other", message: [{ type: "text", text: "msg" }] });
    const tool = new AgentTool({ agent });

    const result = await tool.execute({ input: "go" }, createContext({ sessionService: createMockSessionService() }));

    expect(result).toContain("transfer");
    expect(result).toContain("other");
  });

  it("returns escalate reason as text", async () => {
    const agent = createMockAgent({ type: "escalate", reason: "too hard" });
    const tool = new AgentTool({ agent });

    const result = await tool.execute({ input: "go" }, createContext({ sessionService: createMockSessionService() }));

    expect(result).toContain("escalated");
    expect(result).toContain("too hard");
  });
});
