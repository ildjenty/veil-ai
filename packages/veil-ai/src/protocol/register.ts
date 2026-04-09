/**
 * Type registry for user-defined type overrides.
 *
 * Users can augment this interface via `declare module` to override default types:
 *
 * ```typescript
 * declare module "@genome/agent-engine" {
 *   interface Register {
 *     state: { role: string; count: number };
 *     artifactData: { data: Uint8Array; mimeType: string };
 *     artifactService: MyVersionedArtifactService;
 *     sessionService: { list(): Promise<Session[]> }; // base methods are always preserved
 *     memoryService: MyMemoryService;
 *     context: { logger: Logger; userId: string };
 *   }
 * }
 * ```
 */
import type { BaseSessionService } from "./session";

export interface Register {}

export type ResolveState = Register extends { state: infer S }
  ? S
  : Record<string, unknown>;

export type ResolveArtifactData = Register extends { artifactData: infer A }
  ? A
  : unknown;

export type ResolveArtifactService = Register extends {
  artifactService: infer S;
}
  ? S
  : DefaultArtifactService;

export type ResolveSessionService = BaseSessionService &
  (Register extends { sessionService: infer S } ? S : {});

export type ResolveMemoryService = Register extends {
  memoryService: infer S;
}
  ? S
  : DefaultMemoryService;

export type ResolveContext = Register extends { context: infer C }
  ? C
  : {};

export interface DefaultMemoryService {
  search(query: string): Promise<unknown[]>;
  add(data: unknown): Promise<void>;
}

export interface DefaultArtifactService {
  save(name: string, data: ResolveArtifactData): Promise<void>;
  load(name: string): Promise<ResolveArtifactData | null>;
  list(): Promise<string[]>;
  delete(name: string): Promise<void>;
}
