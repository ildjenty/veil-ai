import { vi } from "vitest";
import type { LlmProvider, LlmResponse } from "../protocol/llm";
import type { BaseSessionService, Session } from "../protocol/session";
import type { AgentContext } from "../protocol/context";

export function textResponse(text: string): LlmResponse {
  return {
    content: [{ type: "text", text }],
    stopReason: "end",
    usage: { input: 10, output: 5 },
  };
}

export function structuredResponse(data: Record<string, unknown>): LlmResponse {
  return {
    content: [{ type: "structured", data }],
    stopReason: "end",
    usage: { input: 10, output: 5 },
  };
}

export function toolUseResponse(calls: { id: string; name: string; args: Record<string, unknown> }[]): LlmResponse {
  return {
    content: calls.map((c) => ({ type: "tool_use" as const, ...c })),
    stopReason: "tool_use",
    usage: { input: 10, output: 5 },
  };
}

export function createMockLlm(...responses: LlmResponse[]): LlmProvider {
  const generate = vi.fn();
  for (const response of responses) {
    generate.mockResolvedValueOnce(response);
  }
  return { generate };
}

export function createMockSessionService(): BaseSessionService & {
  sessions: Map<string, Session>;
} {
  const sessions = new Map<string, Session>();
  let counter = 0;

  return {
    sessions,
    create: vi.fn(async () => {
      const session: Session = {
        id: `session-${++counter}`,
        messages: [],
        state: {},
      };
      sessions.set(session.id, session);
      return session;
    }),
    get: vi.fn(async (id: string) => {
      return sessions.get(id) ?? null;
    }),
    save: vi.fn(async (session: Session) => {
      sessions.set(session.id, session);
    }),
    delete: vi.fn(async (id: string) => {
      sessions.delete(id);
    }),
  };
}

export function createContext(overrides?: Partial<AgentContext>): AgentContext {
  const sessionService = createMockSessionService();
  return {
    session: { id: "test-session", messages: [], state: {} },
    sessionService,
    ...overrides,
  };
}
