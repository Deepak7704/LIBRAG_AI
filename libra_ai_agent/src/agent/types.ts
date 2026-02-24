export type SourceType = "web" | "drive";

export type Citation = {
  id: string;
  sourceType: SourceType;
  title?: string;
  url?: string;
  snippet?: string;
};

export type ToolResult = {
  ok: boolean;
  content: string;
  citations: Citation[];
  raw?: unknown;
};

export type ToolContext = {
  userId?: string;
  requestId: string;
};

export type AgentObservation = {
  step: number;
  tool: string;
  args: unknown;
  result: ToolResult;
};

export type AgentState = {
  requestId: string;
  task: string;
  maxSteps: number;
  step: number;
  notes: string[];
  observations: AgentObservation[];
  plan?: string[];
  driveContext?: {
    hasIngestedFiles: boolean;
    fileCount: number;
    fileNames: string[];
  };
};

export type FinalAnswer = {
  summary: string;
  result: unknown;
  citations: Citation[];
  stepsTaken: number;
  stoppedReason: "finished" | "step_limit" | "error" | "stopped";
};

export type AgentSseEvent =
  | { type: "agent_start"; task: string; maxSteps: number; requestId: string }
  | { type: "thinking"; step: number; requestId: string }
  | { type: "plan"; step: number; plan: string[]; requestId: string }
  | { type: "llm_request"; step: number; requestId: string }
  | { type: "llm_response_received"; step: number; requestId: string }
  | { type: "tool_call"; step: number; tool: string; args: unknown; reason?: string; requestId: string }
  | { type: "tool_result"; step: number; tool: string; ok: boolean; citations: Citation[]; requestId: string }
  | { type: "final"; step: number; summary: string; requestId: string }
  | { type: "stop"; step: number; reason: string; requestId: string }
  | { type: "llm_error"; step: number; error: string; requestId: string }
  | { type: "tool_error"; step: number; tool: string; error: string; requestId: string };