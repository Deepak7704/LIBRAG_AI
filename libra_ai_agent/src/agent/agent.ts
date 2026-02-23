import type { GenerativeModel } from "@google/generative-ai";
import { LlmActionSchema, type LlmAction } from "./schema";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { AgentState, FinalAnswer, ToolContext } from "./types";

function stripMarkdownCodeFences(s: string) {
  return s
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

function extractFirstJsonObject(s: string) {
  const text = stripMarkdownCodeFences(s);
  const start = text.indexOf("{");
  if (start === -1) return text;

  let inString = false;
  let escape = false;
  let depth = 0;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return text.slice(start);
}

function escapeRawNewlinesInsideJsonStrings(jsonText: string) {
  let out = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < jsonText.length; i++) {
    const ch = jsonText[i]!;

    if (inString) {
      if (escape) {
        escape = false;
        out += ch;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        out += ch;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        continue;
      }
      out += ch;
      continue;
    }

    if (ch === '"') inString = true;
    out += ch;
  }

  return out;
}

function parseLlmActionFromText(text: string): LlmAction {
  const candidate = extractFirstJsonObject(text)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^\uFEFF/, "");

  const normalized = escapeRawNewlinesInsideJsonStrings(candidate).replace(
    /,\s*([}\]])/g,
    "$1"
  );

  return LlmActionSchema.parse(JSON.parse(normalized));
}


type ToolRegistry = {
  listForPrompt: () => { name: string; description: string; argsExample: unknown }[];
  get: (name: string) => {
    schema: {
      safeParse: (input: unknown) =>
        | { success: true; data: any }
        | { success: false; error: any };
    };
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

export async function runAgent(opts: RunAgentOpts): Promise<FinalAnswer> {
  const { llm, registry, ctx, state, onStep } = opts;

  const push = (evt: any) => onStep?.({ requestId: state.requestId, ...evt });

  push({ type: "agent_start", task: state.task, maxSteps: state.maxSteps });

  while (state.step < state.maxSteps) {
    state.step += 1;
    push({ type: "thinking", step: state.step });

    const toolsForPrompt = registry.listForPrompt();
    const system = buildSystemPrompt(toolsForPrompt);
    const user = buildUserPrompt(state);
    const fullPrompt = `${system}\n\nUSER_STATE_JSON:\n${user}`;

    let action: LlmAction;
    try {
      push({ type: "llm_request", step: state.step });

      const resp = await llm.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          // Best-effort: some Gemini models honor this and only emit JSON.
          responseMimeType: "application/json" as any,
        },
      });

      push({ type: "llm_response_received", step: state.step });

      const text = resp.response.text() ?? "{}";
      try {
        action = parseLlmActionFromText(text);
      } catch (e: any) {
        push({
          type: "llm_parse_retry",
          step: state.step,
          error: String(e?.message ?? e),
        });

        const retryPrompt =
          `${fullPrompt}\n\n` +
          `IMPORTANT: Your response MUST be a single valid JSON object. ` +
          `Do not include code fences. Escape newlines inside strings as \\\\n.`;

        const retry = await llm.generateContent({
          contents: [{ role: "user", parts: [{ text: retryPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json" as any,
          },
        });

        const retryText = retry.response.text() ?? "{}";
        action = parseLlmActionFromText(retryText);
      }
    } catch (e: any) {
      push({
        type: "llm_error",
        step: state.step,
        error: String(e?.message ?? e),
      });

      return {
        summary: "LLM error (request failed or invalid JSON). Stopping.",
        result: { error: String(e?.message ?? e) },
        citations: collectCitations(state),
        stepsTaken: state.step,
        stoppedReason: "error",
      };
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
        stoppedReason: "finished",
      };
    }
    let tool;
    try {
      tool = registry.get(action.tool);
    } catch {
      push({ type: "unknown_tool", step: state.step, tool: action.tool });
      state.notes.push(
        `Unknown tool requested: ${action.tool}. Use only tools listed in "Available tools".`
      );
      continue;
    }

    const parsedArgs = tool.schema.safeParse(action.args);
    if (!parsedArgs.success) {
      const err = parsedArgs.error?.flatten?.() ?? parsedArgs.error;
      push({
        type: "tool_args_invalid",
        step: state.step,
        tool: action.tool,
        error: err,
      });

      state.notes.push(
        `Tool args invalid for ${action.tool}. Error: ${JSON.stringify(
          err
        )}. Fix args and try again.`
      );
      continue;
    }

    push({
      type: "tool_call",
      step: state.step,
      tool: action.tool,
      args: parsedArgs.data,
      reason: action.reason,
    });
    try {
      const result = await tool.run(parsedArgs.data, ctx, state);

      state.observations.push({
        step: state.step,
        tool: action.tool,
        args: parsedArgs.data,
        result,
      });

      state.notes.push(
        `Step ${state.step} used ${action.tool}. ok=${result.ok}. Key output: ${String(
          result.content ?? ""
        ).slice(0, 300)}`
      );

      push({
        type: "tool_result",
        step: state.step,
        tool: action.tool,
        ok: !!result.ok,
        citations: result.citations ?? [],
      });

      if (!result.ok) {
        state.notes.push(
          `Tool ${action.tool} failed (ok=false). Consider retrying with different args or another tool.`
        );
      }
    } catch (e: any) {
      push({
        type: "tool_error",
        step: state.step,
        tool: action.tool,
        error: String(e?.message ?? e),
      });

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