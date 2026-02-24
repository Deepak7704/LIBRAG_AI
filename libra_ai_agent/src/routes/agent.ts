import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";
import { initSSE } from "../utils/sse";
import { runAgent } from "../agent/agent";
import type { AgentState } from "../agent/types";
import { createToolRegistry } from "../tools";
import { webSearchTool } from "../tools/webSearch";
import { webScrapeTool } from "../tools/webScrape";
import { driveRetrieveTool } from "../tools/driveRetrieve";
import { vectorSearchTool } from "../tools/vectorSearch";
import { prisma } from "../../lib/prisma";

export const agentRouter = Router();

function firstQueryValue(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

async function saveToConversation(
  userId: string,
  conversationId: string | undefined,
  task: string,
  final: any
): Promise<string> {
  let convId = conversationId;

  if (!convId) {
    const conv = await prisma.conversation.create({
      data: { userId, title: task.slice(0, 120) },
    });
    convId = conv.id;
  }

  await prisma.message.createMany({
    data: [
      { conversationId: convId, role: "user", content: task },
      { conversationId: convId, role: "assistant", content: JSON.stringify(final) },
    ],
  });

  return convId;
}

async function runAgentSSE(opts: {
  task: string;
  maxSteps: number;
  userId?: string;
  conversationId?: string;
  res: any;
}) {
  const { task, maxSteps, userId, conversationId, res } = opts;

  const requestId = uuidv4();
  const sse = initSSE(res);

  let disconnected = false;
  res.on("close", () => {
    disconnected = true;
  });

  sse.send("meta", { requestId });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing GEMINI_API_KEY in environment." });
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const llm = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  });

  const registry = createToolRegistry()
    .register(webSearchTool)
    .register(webScrapeTool)
    .register(driveRetrieveTool)
    .register(vectorSearchTool);

  // Fetch user's ingested Drive files for context
  let driveContext: { hasIngestedFiles: boolean; fileCount: number; fileNames: string[] } = {
    hasIngestedFiles: false,
    fileCount: 0,
    fileNames: [],
  };
  if (userId) {
    try {
      const driveFiles = await prisma.driveFile.findMany({
        where: { userId },
        select: { name: true },
        take: 50,
      });
      if (driveFiles.length > 0) {
        driveContext = {
          hasIngestedFiles: true,
          fileCount: driveFiles.length,
          fileNames: driveFiles.map((f) => f.name),
        };
      }
    } catch { }
  }

  const state: AgentState = {
    requestId,
    task,
    maxSteps,
    step: 0,
    notes: [],
    observations: [],
    plan: [],
    driveContext,
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
        } catch (e) {
          console.error("[agent] SSE send error:", e);
          disconnected = true;
        }
      },
    });

    if (!disconnected) sse.send("final", final);

    if (userId) {
      try {
        // Only save conversations for authenticated users (with Google Auth)
        const auth = await prisma.googleAuth.findUnique({ where: { userId } });
        if (auth) {
          const convId = await saveToConversation(userId, conversationId, task, final);
          if (!disconnected) sse.send("saved", { conversationId: convId });
        }
      } catch (e) { console.error("[agent] saveToConversation failed:", e); }
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
    } catch (e) { console.error("[agent] conversation list query failed:", e); }
  }
}

agentRouter.post("/run", async (req, res) => {
  const { task, maxSteps = 8, userId, conversationId } = req.body ?? {};
  if (!task || typeof task !== "string") {
    res.status(400).json({ error: "task (string) is required" });
    return;
  }

  await runAgentSSE({ task, maxSteps: Number(maxSteps) || 8, userId, conversationId, res });
});

agentRouter.get("/run", async (req, res) => {
  const task = firstQueryValue((req as any).query?.task);
  const maxStepsRaw = firstQueryValue((req as any).query?.maxSteps);
  const userId = firstQueryValue((req as any).query?.userId);
  const conversationId = firstQueryValue((req as any).query?.conversationId);

  if (!task) {
    res.status(400).json({ error: "task (string) is required" });
    return;
  }

  const maxSteps = Math.max(1, Math.min(50, Number(maxStepsRaw) || 8));
  await runAgentSSE({ task, maxSteps, userId, conversationId, res });
});

agentRouter.get("/conversations", async (req, res) => {
  const userId = firstQueryValue((req as any).query?.userId);
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      createdAt: true,
    },
  });

  res.json({ conversations });
});

agentRouter.get("/conversations/:id", async (req, res) => {
  const { id } = req.params;
  const userId = firstQueryValue((req as any).query?.userId);

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conversation || (userId && conversation.userId !== userId)) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.json({ conversation });
});