import type { Message } from "./message";
import type { ResolveState } from "./register";

export interface Session {
  id: string;
  messages: Message[];
  state: ResolveState;
}

export interface BaseSessionService {
  create(): Promise<Session>;
  get(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  delete(id: string): Promise<void>;
}
