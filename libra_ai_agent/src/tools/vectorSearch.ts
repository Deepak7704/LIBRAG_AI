import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { ToolDef } from "./index";
import type { ToolResult, ToolContext } from "../agent/types";
import { embedText } from "../utils/embeddings";
import { queryVectors } from "../utils/pinecone";

const VectorSearchArgs = z.object({
    query: z.string().min(3),
    topK: z.number().int().min(1).max(20).default(5),
});

export const vectorSearchTool: ToolDef<typeof VectorSearchArgs> = {
    name: "vector_search",
    description:
        "Search over the user's ingested Google Drive documents using semantic similarity. Returns the most relevant text chunks.",
    schema: VectorSearchArgs,
    argsExample: { query: "quarterly revenue report", topK: 5 },

    run: async (args, ctx): Promise<ToolResult> => {
        if (!ctx.userId) {
            return {
                ok: false,
                content: "No userId provided. Cannot search Drive documents.",
                citations: [],
            };
        }

        try {
            const embedding = await embedText(args.query);
            if (!embedding.length) {
                return {
                    ok: false,
                    content: "Failed to generate embedding for the query.",
                    citations: [],
                };
            }

            const matches = await queryVectors(
                embedding,
                { userId: ctx.userId },
                args.topK
            );

            if (!matches.length) {
                return {
                    ok: true,
                    content:
                        "No matching documents found. The user may not have ingested any Drive files yet.",
                    citations: [],
                };
            }

            const lines: string[] = [];
            const citations: ToolResult["citations"] = [];

            for (let i = 0; i < matches.length; i++) {
                const m = matches[i]!;
                const meta = (m.metadata ?? {}) as Record<string, any>;
                const text = String(meta.text ?? "");
                const fileName = String(meta.fileName ?? "Unknown");
                const driveFileId = String(meta.driveFileId ?? "");
                const score = m.score ?? 0;

                lines.push(
                    `[${i + 1}] ${fileName} (score: ${score.toFixed(3)})\n${text}`
                );

                citations.push({
                    id: uuidv4(),
                    sourceType: "drive",
                    title: fileName,
                    url: driveFileId
                        ? `https://drive.google.com/file/d/${driveFileId}/view`
                        : undefined,
                    snippet: text.slice(0, 240),
                });
            }

            return {
                ok: true,
                content: lines.join("\n\n"),
                citations,
            };
        } catch (e: any) {
            return {
                ok: false,
                content: `vector_search failed: ${String(e?.message ?? e)}`,
                citations: [],
            };
        }
    },
};
