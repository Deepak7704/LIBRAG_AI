import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { ToolDef } from "./index";
import type { ToolResult } from "../agent/types";

const WebScrapeArgs = z.object({
  url: z.string().url(),
  maxChars: z.number().int().min(500).max(20000).default(8000),
});

export const webScrapeTool: ToolDef<typeof WebScrapeArgs> = {
  name: "web_scrape",
  description: "Fetch a URL and extract readable text. Use this after you have a good URL.",
  schema: WebScrapeArgs,
  argsExample: { url: "https://example.com", maxChars: 8000 },

  run: async (args): Promise<ToolResult> => {
    try {
      const res = await fetch(args.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0)",
        },
      });

      if (!res.ok) {
        return {
          ok: false,
          content: `Failed to fetch. HTTP ${res.status}`,
          citations: [{ id: uuidv4(), sourceType: "web", url: args.url, title: "Fetch failed" }],
          raw: { status: res.status },
        };
      }

      const html = await res.text();

      const text = html
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
        .replace(/<\/?[^>]+(>|$)/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, args.maxChars);

      return {
        ok: true,
        content: text.length ? text : "No readable text extracted.",
        citations: [
          {
            id: uuidv4(),
            sourceType: "web",
            url: args.url,
            title: args.url,
            snippet: text.slice(0, 240),
          },
        ],
        raw: { bytes: html.length },
      };
    } catch (e: any) {
      return {
        ok: false,
        content: `web_scrape failed: ${String(e?.message ?? e)}`,
        citations: [{ id: uuidv4(), sourceType: "web", url: args.url, title: "Scrape error" }],
        raw: { error: String(e?.message ?? e) },
      };
    }
  },
};