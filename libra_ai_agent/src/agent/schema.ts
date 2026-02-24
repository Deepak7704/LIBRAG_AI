import { z } from "zod";

export const PlanSchema = z.object({
  type: z.literal("plan"),
  plan: z.array(z.string()).min(1),
  reason: z.string().optional(),
});

export const ToolCallSchema = z.object({
  type: z.literal("tool_call"),
  tool: z.string(),
  args: z.record(z.string(), z.any()),
  reason: z.string().optional(),
});

export const FinalSchema = z.object({
  type: z.literal("final"),
  summary: z.string(),
  result: z.any(),
});

export const StopSchema = z.object({
  type: z.literal("stop"),
  reason: z.string(),
});

export const LlmActionSchema = z.union([PlanSchema, ToolCallSchema, FinalSchema, StopSchema]);
export type LlmAction = z.infer<typeof LlmActionSchema>;