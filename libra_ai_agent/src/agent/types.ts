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
};

export type FinalAnswer = {
  summary: string;
  result: unknown;      
  citations: Citation[];
  stepsTaken: number;
  stoppedReason: "finished" | "step_limit" | "error";
};