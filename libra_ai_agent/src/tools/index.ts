import { z } from "zod";
import type { AgentState, ToolContext, ToolResult } from "../agent/types";

export type ToolDef<A extends z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: A;
  argsExample: unknown;
  run: (args: z.infer<A>, ctx: ToolContext, state: AgentState) => Promise<ToolResult>;
};

export function createToolRegistry() {
  const tools = new Map<string, ToolDef<any>>();

  return {
    register<A extends z.ZodTypeAny>(tool: ToolDef<A>) {
      tools.set(tool.name, tool);
      return this;
    },

    unregister(name: string) {
      tools.delete(name);
      return this;
    },

    has(name: string) {
      return tools.has(name);
    },

    listForPrompt() {
      return Array.from(tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        argsExample: t.argsExample,
      }));
    },

    get(name: string) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      return tool;
    },

    tryGet(name: string) {
      return tools.get(name) ?? null;
    },
  };
}