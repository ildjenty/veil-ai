# Contributing to veil-ai

## Development Setup

```bash
git clone https://github.com/ildjenty/veil-ai.git
cd veil-ai
pnpm install
pnpm build
pnpm test
```

## Project Structure

```
packages/
  veil-ai/            — Framework core (veil-ai on npm)
  cli/                — CLI tool
  providers/
    anthropic/        — Anthropic Claude provider
    openai/           — OpenAI provider
    google-genai/     — Google Generative AI provider
    google-vertex/    — Google Vertex AI provider
snippets/             — Code snippets (distributed via CLI)
docs/                 — Documentation site (Starlight)
```

## Pull Requests

- Create a branch from `main`
- Ensure `pnpm typecheck` and `pnpm test` pass
- Keep commits focused and descriptive

## Code Style

- TypeScript strict mode
- No `as` type casts — use type guards
- No unnecessary comments — code should be self-explanatory
- Prefer composition over inheritance
