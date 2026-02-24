import type { GenerativeModel } from "@google/generative-ai";
import { LlmActionSchema, type LlmAction } from "./schema";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { AgentState, FinalAnswer, ToolContext } from "./types";

type ToolRegistry = {
  listForPrompt: () => { name: string; description: string; argsExample: unknown }[];
  get: (name: string) => {
    schema: { safeParse: (input: unknown) => any };
    run: (args: any, ctx: ToolContext, state: AgentState) => Promise<any>;
  };
};

type RunAgentOpts = {
  llm: GenerativeModel;
  registry: ToolRegistry;
  ctx: ToolContext;
  state: AgentState;
  onStep?: (event: any) => void;
};

function cleanJsonText(s: string) {
  const t = s
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();

  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");

  const slice = a !== -1 && b !== -1 && b > a ? t.slice(a, b + 1) : t;

  return slice.replace(/,\s*([}\]])/g, "$1");
}

function parseJson<T = any>(s: string): T {
  return JSON.parse(cleanJsonText(s));
}

async function getAction(llm: GenerativeModel, prompt: string) {
  const resp = await llm.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" as any },
  });

  const text = resp.response.text() ?? "{}";
  return LlmActionSchema.parse(parseJson(text));
}

export async function runAgent(opts: RunAgentOpts): Promise<FinalAnswer> {
  const { llm, registry, ctx, state, onStep } = opts;
  const push = (evt: any) => onStep?.({ requestId: state.requestId, ...evt });

  push({ type: "agent_start", task: state.task, maxSteps: state.maxSteps });

  while (state.step < state.maxSteps) {
    state.step += 1;

    const toolsForPrompt = registry.listForPrompt();
    const system = buildSystemPrompt(toolsForPrompt, state.driveContext);
    const user = buildUserPrompt(state);

    const prompt =
      `${system}\n\n` +
      `Return ONLY one valid JSON object.\n` +
      `No markdown. No code fences. No extra text.\n\n` +
      `USER_STATE_JSON:\n${user}`;

    let action: LlmAction;

    push({ type: "thinking", step: state.step });

    try {
      push({ type: "llm_request", step: state.step });
      action = await getAction(llm, prompt);
      push({ type: "llm_response_received", step: state.step });
    } catch (e1: any) {
      push({ type: "llm_parse_retry", step: state.step, error: String(e1?.message ?? e1) });

      const retryPrompt =
        `${prompt}\n\n` +
        `STRICT: Output ONLY JSON. Do not include any other characters.`;

      try {
        push({ type: "llm_request", step: state.step });
        action = await getAction(llm, retryPrompt);
        push({ type: "llm_response_received", step: state.step });
      } catch (e2: any) {
        push({ type: "llm_error", step: state.step, error: String(e2?.message ?? e2) });

        return {
          summary: "LLM error (request failed or invalid JSON). Stopping.",
          result: { error: String(e2?.message ?? e2) },
          citations: collectCitations(state),
          stepsTaken: state.step,
          stoppedReason: "error",
        };
      }
    }

    if (action.type === "final") {
      push({ type: "final", step: state.step, summary: action.summary });
      return {
        summary: action.summary,
        result: action.result,
        citations: collectCitations(state),
        stepsTaken: state.step,
        stoppedReason: "finished",
      };
    }

    if (action.type === "stop") {
      push({ type: "stop", step: state.step, reason: action.reason });
      return {
        summary: action.reason,
        result: { message: action.reason },
        citations: collectCitations(state),
        stepsTaken: state.step,
        stoppedReason: "stopped",
      };
    }

    if (action.type === "plan") {
      state.plan = action.plan;
      state.notes.push(`Plan: ${action.plan.join(" -> ")}`);
      push({ type: "plan", step: state.step, plan: action.plan });
      continue;
    }

    let tool;
    try {
      tool = registry.get(action.tool);
    } catch (e) {
      console.error("[agent] unknown tool lookup error:", e);
      push({ type: "unknown_tool", step: state.step, tool: action.tool });
      state.notes.push(`Unknown tool requested: ${action.tool}. Use only tools listed in "Available tools".`);
      continue;
    }

    const parsedArgs = tool.schema.safeParse(action.args);
    if (!parsedArgs.success) {
      const err = parsedArgs.error?.flatten?.() ?? parsedArgs.error;
      push({ type: "tool_args_invalid", step: state.step, tool: action.tool, error: err });
      state.notes.push(`Tool args invalid for ${action.tool}. Error: ${JSON.stringify(err)}.`);
      continue;
    }

    push({ type: "tool_call", step: state.step, tool: action.tool, args: parsedArgs.data, reason: action.reason });

    try {
      const result = await tool.run(parsedArgs.data, ctx, state);

      state.observations.push({
        step: state.step,
        tool: action.tool,
        args: parsedArgs.data,
        result,
      });

      state.notes.push(
        `Step ${state.step} used ${action.tool}. ok=${result.ok}. Key output: ${String(result.content ?? "").slice(0, 300)}`
      );

      push({
        type: "tool_result",
        step: state.step,
        tool: action.tool,
        ok: !!result.ok,
        citations: result.citations ?? [],
      });
    } catch (e: any) {
      push({ type: "tool_error", step: state.step, tool: action.tool, error: String(e?.message ?? e) });
      return {
        summary: `Tool error in ${action.tool}: ${String(e?.message ?? e)}`,
        result: {},
        citations: collectCitations(state),
        stepsTaken: state.step,
        stoppedReason: "error",
      };
    }
  }

  push({ type: "step_limit", stepsTaken: state.step });

  return {
    summary: `Stopped: step limit (${state.maxSteps}) reached.`,
    result: { message: "Increase maxSteps or refine the task." },
    citations: collectCitations(state),
    stepsTaken: state.step,
    stoppedReason: "step_limit",
  };
}

function collectCitations(state: AgentState) {
  const all = state.observations.flatMap((o) => o.result.citations || []);
  const seen = new Set<string>();
  const out: any[] = [];

  for (const c of all) {
    const key = c.url ?? c.id;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }

  return out;
}