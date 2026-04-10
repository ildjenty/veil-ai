import { GoogleGenAI } from "@google/genai";
import type { Content, Part, GenerateContentResponse } from "@google/genai";
import type {
  LlmProvider,
  LlmGenerateOptions,
  LlmResponse,
  LlmStreamResponse,
  LlmContentPart,
  Message,
  ContentPart,
} from "veil-ai";

export interface GoogleGenAIProviderConfig {
  model: string;
  client: GoogleGenAI;
  maxTokens?: number;
}

export class GoogleGenAIProvider implements LlmProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly defaultMaxTokens: number;

  constructor(config: GoogleGenAIProviderConfig) {
    this.client = config.client;
    this.model = config.model;
    this.defaultMaxTokens = config.maxTokens ?? 4096;
  }

  async generate(options: LlmGenerateOptions): Promise<LlmResponse> {
    const contents = toGeminiContents(options.messages);

    const config: Record<string, unknown> = {
      maxOutputTokens: options.maxTokens ?? this.defaultMaxTokens,
      ...options.providerOptions,
    };

    if (options.systemPrompt) {
      config.systemInstruction = options.systemPrompt;
    }

    if (options.tools && options.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parametersJsonSchema: t.inputSchema,
          })),
        },
      ];
    }

    if (options.outputSchema) {
      config.responseMimeType = "application/json";
      config.responseJsonSchema = options.outputSchema;
    }

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config,
    });

    return fromGeminiResponse(response, options.outputSchema != null);
  }

  async generateStream(options: LlmGenerateOptions): Promise<LlmStreamResponse> {
    const contents = toGeminiContents(options.messages);

    const config: Record<string, unknown> = {
      maxOutputTokens: options.maxTokens ?? this.defaultMaxTokens,
      ...options.providerOptions,
    };

    if (options.systemPrompt) {
      config.systemInstruction = options.systemPrompt;
    }

    if (options.tools && options.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parametersJsonSchema: t.inputSchema,
          })),
        },
      ];
    }

    if (options.outputSchema) {
      config.responseMimeType = "application/json";
      config.responseJsonSchema = options.outputSchema;
    }

    const result = await this.client.models.generateContentStream({
      model: this.model,
      contents,
      config,
    });

    const hasOutputSchema = options.outputSchema != null;

    let resolveResponse!: (r: LlmResponse) => void;
    const response = new Promise<LlmResponse>((resolve) => {
      resolveResponse = resolve;
    });

    async function* streamChunks() {
      let lastChunk: GenerateContentResponse | undefined;

      for await (const chunk of result) {
        lastChunk = chunk;
        const text = chunk.text;
        if (text) {
          yield { type: "text" as const, text };
        }
      }

      resolveResponse(
        lastChunk
          ? fromGeminiResponse(lastChunk, hasOutputSchema)
          : { content: [], stopReason: "end", usage: { input: 0, output: 0 } },
      );
    }

    return { stream: streamChunks(), response };
  }
}

export function toGeminiContents(messages: Message[]): Content[] {
  const toolNameMap = new Map<string, string>();
  for (const msg of messages) {
    for (const part of msg.content) {
      if (part.type === "tool_use") {
        toolNameMap.set(part.id, part.name);
      }
    }
  }

  return messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: msg.content.map((part) => toGeminiPart(part, toolNameMap)),
  }));
}

export function toGeminiPart(
  part: ContentPart,
  toolNameMap: Map<string, string>,
): Part {
  switch (part.type) {
    case "text":
      return { text: part.text };
    case "tool_use":
      return { functionCall: { name: part.name, args: part.args } };
    case "tool_result":
      return {
        functionResponse: {
          id: part.toolUseId,
          name: toolNameMap.get(part.toolUseId) ?? "",
          response: { output: part.content },
        },
      };
    case "structured":
      return { text: JSON.stringify(part.data) };
  }
}

export function fromGeminiResponse(
  response: GenerateContentResponse,
  hasOutputSchema: boolean,
): LlmResponse {
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const content: LlmContentPart[] = [];

  for (const part of parts) {
    if (part.functionCall) {
      content.push({
        type: "tool_use",
        id: part.functionCall.id ?? crypto.randomUUID(),
        name: part.functionCall.name ?? "",
        args: (part.functionCall.args ?? {}) as Record<string, unknown>,
      });
    } else if (part.text != null) {
      if (hasOutputSchema) {
        try {
          const data = JSON.parse(part.text);
          content.push({ type: "structured", data });
        } catch {
          content.push({ type: "text", text: part.text });
        }
      } else {
        content.push({ type: "text", text: part.text });
      }
    }
  }

  const hasFunctionCalls = content.some((p) => p.type === "tool_use");

  return {
    content,
    stopReason: hasFunctionCalls
      ? "tool_use"
      : candidate?.finishReason === "MAX_TOKENS"
        ? "max_tokens"
        : "end",
    usage: {
      input: response.usageMetadata?.promptTokenCount ?? 0,
      output: response.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
