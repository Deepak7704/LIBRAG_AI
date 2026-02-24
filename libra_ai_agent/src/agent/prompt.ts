import type { AgentState } from "./types";

export function buildSystemPrompt(
  tools: { name: string; description: string; argsExample: unknown }[],
  driveContext?: { hasIngestedFiles: boolean; fileCount: number; fileNames: string[] }
) {
  const driveSection = driveContext?.hasIngestedFiles
    ? `
IMPORTANT - User's Google Drive Context:
The user has ${driveContext.fileCount} ingested document(s) available for semantic search:
${driveContext.fileNames.slice(0, 20).map((n) => `  - ${n}`).join("\n")}

CRITICAL ROUTING RULES:
- If the user's question could relate to ANY of these documents, you MUST use vector_search FIRST before trying web_search.
- Use vector_search for any question about the user's files, documents, reports, notes, or personal data.
- Only fall back to web_search if vector_search returns no relevant results.
- When in doubt whether a question is about the user's documents or general knowledge, prefer vector_search first.
`
    : "";

  return `
You are an autonomous task-solving agent.

You MUST respond with exactly ONE valid JSON object and nothing else.

Valid response shapes:
- {"type":"plan","plan":["..."],"reason":"..."}
- {"type":"tool_call","tool":"...","args":{...},"reason":"..."}
- {"type":"final","summary":"...","result":{...}}
- {"type":"stop","reason":"..."}

Rules:
- If you are at the beginning OR your approach needs restructuring, output type="plan".
- A plan is 3 to 6 short steps. No tools are called in a plan.
- Otherwise, use type="tool_call" to gather missing info using the tools below.
- After a tool_call, you will receive the tool output in the next step and must decide what to do next.
- Prefer web_search before web_scrape unless you already have a reliable URL.
- Use vector_search when the user asks about their personal documents, Drive files, or anything that might be in their ingested data.
- Use drive_retrieve only when you have a specific Drive file ID to fetch.
- When you have enough info, output type="final" with a structured result and a short summary.
- If the task cannot be completed, output type="stop" and explain why.
${driveSection}
Available tools:
${tools
      .map(
        (t) =>
          `- ${t.name}: ${t.description}\n  args example: ${JSON.stringify(
            t.argsExample
          )}`
      )
      .join("\n")}
`.trim();
}

export function buildUserPrompt(state: AgentState) {
  const observations = state.observations.map((o) => ({
    step: o.step,
    tool: o.tool,
    args: o.args,
    ok: o.result.ok,
    content: String(o.result.content ?? "").slice(0, 4000),
    citations: o.result.citations ?? [],
  }));

  return JSON.stringify(
    {
      task: state.task,
      step: state.step,
      maxSteps: state.maxSteps,
      plan: state.plan ?? [],
      notes: state.notes,
      observations,
      driveContext: state.driveContext ?? null,
    },
    null,
    2
  );
}