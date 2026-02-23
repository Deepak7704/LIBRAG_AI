import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { ToolDef } from "./index";
import type { ToolResult } from "../agent/types";
import { tavily } from "@tavily/core";

const WebSearchArgs = z.object({
  query: z.string().min(3),
  topK: z.number().int().min(1).max(10).default(5),
});

export const webSearchTool: ToolDef<typeof WebSearchArgs> = {
  name: "web_search",
  description:
    "Search the web using Tavily and return top results with titles, URLs, and snippets for citations.",
  schema: WebSearchArgs,
  argsExample: { query: "latest Node.js LTS version", topK: 5 },

  run: async (args): Promise<ToolResult> => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        content: "Missing TAVILY_API_KEY in environment.",
        citations: [],
      };
    }

    const client = tavily({ apiKey });

    try {
      // Minimal Tavily search call
      const resp = await client.search(args.query, {
        max_results: args.topK,
      });

      const results = Array.isArray((resp as any).results) ? (resp as any).results : [];

      // Build a compact text block the LLM can read
      const lines: string[] = [];
      lines.push(`Tavily search query: ${args.query}`);

      if (!results.length) {
        lines.push("No results returned.");
      } else {
        lines.push("Top results:");
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          lines.push(
            `${i + 1}. ${r.title ?? "Untitled"}\n` +
              `   ${r.url ?? ""}\n` +
              `   ${(r.content ?? r.snippet ?? "").toString().slice(0, 280)}`
          );
        }
      }

      // Convert results into citations for your final answer
      const citations = results
        .filter((r: any) => r?.url)
        .map((r: any) => ({
          id: uuidv4(),
          sourceType: "web" as const,
          title: r.title ?? r.url,
          url: r.url,
          snippet: (r.content ?? r.snippet ?? "").toString().slice(0, 240),
        }));

      return {
        ok: true,
        content: lines.join("\n"),
        citations,
        raw: resp, // keep for debugging
      };
    } catch (e: any) {
      return {
        ok: false,
        content: `Tavily search failed: ${String(e?.message ?? e)}`,
        citations: [],
        raw: { error: String(e?.message ?? e) },
      };
    }
  },
};