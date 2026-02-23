import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import { initSSE } from "../utils/sse";
import { runAgent } from "../agent/agent";
import type { AgentState } from "../agent/types";
import { createToolRegistry } from "../tools";
import { webSearchTool } from "../tools/webSearch";
import { webScrapeTool } from "../tools/webScrape";

export const agentRouter = Router();

function firstQueryValue(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

async function runAgentSSE(opts: {
  task: string;
  maxSteps: number;
  userId?: string;
  res: any;
}) {
  const { task, maxSteps, userId, res } = opts;

  const requestId = uuidv4();
  const sse = initSSE(res);
  let disconnected = false;
  res.on("close", () => {
    disconnected = true;
  });
  sse.send("meta", { requestId });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Missing GEMINI_API_KEY in environment." });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const llm = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  });

  const registry = createToolRegistry()
    .register(webSearchTool)
    .register(webScrapeTool);

  const state: AgentState = {
    requestId,
    task,
    maxSteps,
    step: 0,
    notes: [],
    observations: [],
  };

  try {
    const final = await runAgent({
      llm,
      registry,
      ctx: { userId, requestId },
      state,
      onStep: (evt) => {
        if (disconnected) return;
        try {
          sse.send("step", evt);
        } catch {
          disconnected = true;
        }
      },
    });
    if (!disconnected) {
      sse.send("final", final);
    }
  } catch (e: any) {
    if (!disconnected) {
      sse.send("final", {
        summary: `Route error: ${String(e?.message ?? e)}`,
        result: {},
        citations: [],
        stepsTaken: state.step,
        stoppedReason: "error",
      });
    }
  } finally {
    try {
      sse.close();
    } catch {}
  }
}

agentRouter.post("/run", async (req, res) => {
  const { task, maxSteps = 8, userId } = req.body ?? {};
  if (!task || typeof task !== "string") {
    return res.status(400).json({ error: "task (string) is required" });
  }

  await runAgentSSE({ task, maxSteps: Number(maxSteps) || 8, userId, res });
});

// Browser-friendly SSE: EventSource can only do GET.
agentRouter.get("/run", async (req, res) => {
  const task = firstQueryValue((req as any).query?.task);
  const maxStepsRaw = firstQueryValue((req as any).query?.maxSteps);
  const userId = firstQueryValue((req as any).query?.userId);

  if (!task) {
    return res.status(400).json({ error: "task (string) is required" });
  }

  const maxSteps = Math.max(1, Math.min(50, Number(maxStepsRaw) || 8));
  await runAgentSSE({ task, maxSteps, userId, res });
});