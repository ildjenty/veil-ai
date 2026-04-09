import { describe, it, expect, vi } from "vitest";
import { Runner } from "./runner";
import { AgentEngineError } from "../../protocol/errors";
import { createMockSessionService } from "../../__test__/mocks";
import type { BaseAgent, AgentResult } from "../../protocol/agent";
import type { ContentPart } from "../../protocol/message";

function createMockAgent(name: string, result: AgentResult): BaseAgent {
  return {
    name,
    description: `${name} agent`,
    run: vi.fn(async () => result),
  };
}

describe("Runner", () => {
  it("runs agent with existing session and saves after", async () => {
    const sessionService = createMockSessionService();
    const session = await sessionService.create();

    const agent = createMockAgent("main", { type: "response", response: [{ type: "text", text: "hi" }] });
    const runner = new Runner({ sessionService });

    const result = await runner.run(agent, session.id, [{ type: "text", text: "hello" }]);

    expect(result.type).toBe("response");
    expect(sessionService.save).toHaveBeenCalled();
  });

  it("throws when session not found", async () => {
    const sessionService = createMockSessionService();
    const agent = createMockAgent("main", { type: "response", response: [] });
    const runner = new Runner({ sessionService });

    await expect(runner.run(agent, "nonexistent", [{ type: "text", text: "hi" }]))
      .rejects.toThrow(AgentEngineError);
  });

  it("saves session even on agent error", async () => {
    const sessionService = createMockSessionService();
    const session = await sessionService.create();

    const agent: BaseAgent = {
      name: "failing",
      description: "fails",
      run: vi.fn(async () => { throw new Error("agent failed"); }),
    };

    const runner = new Runner({ sessionService });

    await expect(runner.run(agent, session.id, [{ type: "text", text: "hi" }]))
      .rejects.toThrow("agent failed");

    expect(sessionService.save).toHaveBeenCalled();
  });

  it("resolves transfer to another agent", async () => {
    const agentB = createMockAgent("agentB", { type: "response", response: [{ type: "text", text: "from B" }] });
    const agentA = createMockAgent("agentA", { type: "transfer", targetAgent: "agentB", message: [{ type: "text", text: "handle this" }] });

    const sessionService = createMockSessionService();
    const session = await sessionService.create();

    const runner = new Runner({
      sessionService,
      agents: [agentA, agentB],
    });

    const result = await runner.run(agentA, session.id, [{ type: "text", text: "start" }]);

    expect(result.type).toBe("response");
    if (result.type === "response") {
      expect(result.response).toEqual([{ type: "text", text: "from B" }]);
    }
    expect(agentB.run).toHaveBeenCalled();
  });

  it("throws when transfer target not found", async () => {
    const agentA = createMockAgent("agentA", { type: "transfer", targetAgent: "unknown", message: [{ type: "text", text: "?" }] });

    const sessionService = createMockSessionService();
    const session = await sessionService.create();

    const runner = new Runner({ sessionService, agents: [agentA] });

    await expect(runner.run(agentA, session.id, [{ type: "text", text: "go" }]))
      .rejects.toThrow("Transfer target agent not found");
  });

  it("returns escalate result without transfer", async () => {
    const agent = createMockAgent("main", { type: "escalate", reason: "need human" });

    const sessionService = createMockSessionService();
    const session = await sessionService.create();

    const runner = new Runner({ sessionService });
    const result = await runner.run(agent, session.id, [{ type: "text", text: "help" }]);

    expect(result.type).toBe("escalate");
    if (result.type === "escalate") {
      expect(result.reason).toBe("need human");
    }
  });
});
