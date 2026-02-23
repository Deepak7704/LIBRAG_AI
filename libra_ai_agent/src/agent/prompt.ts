import type { AgentState } from "./types";

export function buildSystemPrompt(tools: { name: string; description: string; argsExample: unknown }[]) {
  return `
You are an autonomous task-solving agent.

You MUST respond with a single valid JSON object and nothing else.

You can either:
- {"type":"tool_call","tool":"...","args":{...},"reason":"..."}
- {"type":"final","summary":"...","result":{...}}
- {"type":"stop","reason":"..."}

Rules:
- Use tools when they help you get facts, sources, or data.
- Every time you use a tool, you will be given its output next.
- Keep working until the task is fully solved or step limit is reached.
- Prefer web_search before web_scrape unless you already have a reliable URL.
- If you can answer now with available info, return type="final".

Available tools:
${tools
  .map((t) => `- ${t.name}: ${t.description}\n  args example: ${JSON.stringify(t.argsExample)}`)
  .join("\n")}
`.trim();
}

export function buildUserPrompt(state: AgentState) {
  const obs = state.observations
    .map((o) => {
      return {
        step: o.step,
        tool: o.tool,
        args: o.args,
        ok: o.result.ok,
        content: o.result.content.slice(0, 4000),
        citations: o.result.citations,
      };
    });

  return JSON.stringify(
    {
      task: state.task,
      step: state.step,
      maxSteps: state.maxSteps,
      notes: state.notes,
      observations: obs,
      instruction:
        "Decide the next best action. If you have enough info, return final with a structured result and a short summary.",
    },
    null,
    2
  );
}