import { VertexAI, SchemaType } from "@google-cloud/vertexai";
import type {
  Content,
  FunctionDeclaration,
  GenerateContentResult,
  GenerationConfig,
  Part,
  StreamGenerateContentResult,
  Tool as VertexTool,
} from "@google-cloud/vertexai";
import type {
  LlmProvider,
  LlmGenerateOptions,
  LlmResponse,
  LlmStreamResponse,
  LlmContentPart,
  Message,
  ContentPart,
  ToolDeclaration,
} from "veil-ai";

export interface GoogleVertexProviderConfig {
  model: string;
  project: string;
  location: string;
  maxTokens?: number;
}

export class GoogleVertexProvider implements LlmProvider {
  private readonly vertexAI: VertexAI;
  private readonly model: string;
  private readonly defaultMaxTokens: number;

  constructor(config: GoogleVertexProviderConfig) {
    this.vertexAI = new VertexAI({
      project: config.project,
      location: config.location,
    });
    this.model = config.model;
    this.defaultMaxTokens = config.maxTokens ?? 4096;
  }

  async generate(options: LlmGenerateOptions): Promise<LlmResponse> {
    const tools: VertexTool[] | undefined =
      options.tools && options.tools.length > 0
        ? [
            {
              functionDeclarations: options.tools.map(
                toVertexFunctionDeclaration,
              ),
            },
          ]
        : undefined;

    const { providerOptions } = options;

    const generationConfig: GenerationConfig = {
      maxOutputTokens: options.maxTokens ?? this.defaultMaxTokens,
      ...(providerOptions?.generationConfig as GenerationConfig),
    };

    if (options.outputSchema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = toVertexSchema(options.outputSchema);
    }

    const generativeModel = this.vertexAI.getGenerativeModel({
      model: this.model,
      tools,
      generationConfig,
      systemInstruction: options.systemPrompt
        ? { role: "user", parts: [{ text: options.systemPrompt }] }
        : undefined,
      ...(providerOptions?.modelOptions as Record<string, unknown>),
    });

    const contents = toVertexContents(options.messages);
    const result: GenerateContentResult = await generativeModel.generateContent(
      { contents },
    );
    const response = result.response;

    return fromVertexResponse(response, options.outputSchema != null);
  }

  async generateStream(
    options: LlmGenerateOptions,
  ): Promise<LlmStreamResponse> {
    const { providerOptions } = options;

    const tools: VertexTool[] | undefined =
      options.tools && options.tools.length > 0
        ? [
            {
              functionDeclarations: options.tools.map(
                toVertexFunctionDeclaration,
              ),
            },
          ]
        : undefined;

    const generationConfig: GenerationConfig = {
      maxOutputTokens: options.maxTokens ?? this.defaultMaxTokens,
      ...(providerOptions?.generationConfig as GenerationConfig),
    };

    if (options.outputSchema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = toVertexSchema(options.outputSchema);
    }

    const generativeModel = this.vertexAI.getGenerativeModel({
      model: this.model,
      tools,
      generationConfig,
      systemInstruction: options.systemPrompt
        ? { role: "user", parts: [{ text: options.systemPrompt }] }
        : undefined,
      ...(providerOptions?.modelOptions as Record<string, unknown>),
    });

    const contents = toVertexContents(options.messages);
    const result: StreamGenerateContentResult =
      await generativeModel.generateContentStream({ contents });

    const hasOutputSchema = options.outputSchema != null;

    let resolveResponse!: (r: LlmResponse) => void;
    const response = new Promise<LlmResponse>((resolve) => {
      resolveResponse = resolve;
    });

    async function* streamChunks() {
      for await (const chunk of result.stream) {
        const text = chunk.candidates?.[0]?.content?.parts?.[0];
        if (text && "text" in text && text.text) {
          yield { type: "text" as const, text: text.text };
        }
      }

      const finalResponse = await result.response;
      resolveResponse(fromVertexResponse(finalResponse, hasOutputSchema));
    }

    return { stream: streamChunks(), response };
  }
}

export function toVertexContents(messages: Message[]): Content[] {
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
    parts: msg.content.map((part) => toVertexPart(part, toolNameMap)),
  }));
}

export function toVertexPart(
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
          name: toolNameMap.get(part.toolUseId) ?? "",
          response: { output: part.content },
        },
      };
    case "structured":
      return { text: JSON.stringify(part.data) };
  }
}

export function toVertexFunctionDeclaration(
  tool: ToolDeclaration,
): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parameters: toVertexSchema(tool.inputSchema),
  };
}

const SCHEMA_TYPE_MAP: Record<string, SchemaType> = {
  string: SchemaType.STRING,
  number: SchemaType.NUMBER,
  integer: SchemaType.INTEGER,
  boolean: SchemaType.BOOLEAN,
  array: SchemaType.ARRAY,
  object: SchemaType.OBJECT,
};

export function toVertexSchema(
  schema: Record<string, unknown>,
): ReturnType<typeof Object> {
  const result: Record<string, unknown> = {};
  const type = schema.type as string | undefined;

  if (type) {
    result.type = SCHEMA_TYPE_MAP[type] ?? type;
  }
  if (schema.description != null) result.description = schema.description;
  if (schema.enum != null) result.enum = schema.enum;
  if (schema.required != null) result.required = schema.required;
  if (schema.nullable != null) result.nullable = schema.nullable;
  if (schema.format != null) result.format = schema.format;
  if (schema.example != null) result.example = schema.example;

  if (schema.properties != null) {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      schema.properties as Record<string, Record<string, unknown>>,
    )) {
      props[key] = toVertexSchema(value);
    }
    result.properties = props;
  }

  if (schema.items != null) {
    result.items = toVertexSchema(schema.items as Record<string, unknown>);
  }

  return result;
}

export function fromVertexResponse(
  response: GenerateContentResult["response"],
  hasOutputSchema: boolean,
): LlmResponse {
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const content: LlmContentPart[] = [];

  for (const part of parts) {
    if ("functionCall" in part && part.functionCall) {
      content.push({
        type: "tool_use",
        id: crypto.randomUUID(),
        name: part.functionCall.name,
        args: (part.functionCall.args ?? {}) as Record<string, unknown>,
      });
    } else if ("text" in part && part.text != null) {
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
  const finishReason = candidate?.finishReason;

  return {
    content,
    stopReason: hasFunctionCalls
      ? "tool_use"
      : finishReason === "MAX_TOKENS"
        ? "max_tokens"
        : "end",
    usage: {
      input: response.usageMetadata?.promptTokenCount ?? 0,
      output: response.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
