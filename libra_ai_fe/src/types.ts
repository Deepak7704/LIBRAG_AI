export type Citation = {
  id: string;
  sourceType: "web" | "drive";
  title?: string;
  url?: string;
  snippet?: string;
};

export type FinalEvent = {
  summary: string;
  result: any;
  citations: Citation[];
  stepsTaken: number;
  stoppedReason: "finished" | "stopped" | "step_limit" | "error";
};

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: string | null;
  webViewLink: string | null;
};

export type StepEvent = {
  type: string;
  step?: number;
  tool?: string;
  args?: any;
  reason?: string;
  plan?: string[];
  summary?: string;
  ok?: boolean;
  citations?: Citation[];
  error?: string;
  requestId?: string;
};

export type IngestResult = {
  fileId: string;
  fileName: string;
  chunks: number;
  status: "ok" | "skipped" | "error";
  error?: string;
};