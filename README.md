# veil-ai

A transparent, lightweight LLM agent framework.

Zero dependencies. Protocol-driven. Provider-agnostic.

## Features

- **Zero dependencies** — All external integrations are interfaces. You inject implementations.
- **Protocol / Kit separation** — Types and interfaces (`protocol`) are separate from implementations (`kit`).
- **Middleware-based extensibility** — Agent, LLM, and Tool middleware for observation and modification at every layer.
- **Multi-agent composition** — Sequential, Parallel, Loop agents. Transfer and Escalate for control flow.
- **Provider-agnostic** — Anthropic, OpenAI, Gemini via adapter packages.
- **Structured output** — Force LLM responses to match a JSON Schema.

## Packages

| Package | Description |
|---|---|
| `veil-ai` | Core framework |
| `@veil-ai/anthropic` | Anthropic Claude provider |
| `@veil-ai/openai` | OpenAI provider |
| `@veil-ai/gemini` | Google Gemini provider |
| `@veil-ai/cli` | CLI for adding code snippets |

## Quick Start

```bash
npm install veil-ai
```

```typescript
import { LlmAgent, FunctionTool, Runner } from "veil-ai";

const agent = new LlmAgent({
  name: "assistant",
  description: "A helpful assistant",
  instruction: "You are a helpful assistant.",
  tools: [],
  llm: yourLlmProvider,
});

const runner = new Runner({ sessionService: yourSessionService });
const session = await yourSessionService.create();
const result = await runner.run(agent, session.id, [{ type: "text", text: "Hello!" }]);
```

## License

MIT
