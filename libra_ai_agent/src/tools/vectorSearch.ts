import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { ToolDef } from "./index";
import type { ToolResult, ToolContext } from "../agent/types";
import { embedText } from "../utils/embeddings";
import { queryVectors, fetchNeighborChunks } from "../utils/pinecone";

const VectorSearchArgs = z.object({
    query: z.string().min(3),
    topK: z.number().int().min(1).max(20).default(5),
});

export const vectorSearchTool: ToolDef<typeof VectorSearchArgs> = {
    name: "vector_search",
    description:
        "Search over the user's ingested Google Drive documents using semantic similarity. Returns the most relevant text chunks with surrounding context.",
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

            const MIN_SCORE = 0.5;
            const relevant = matches.filter((m) => (m.score ?? 0) >= MIN_SCORE);

            if (!relevant.length) {
                return {
                    ok: true,
                    content:
                        "No matching documents found. The user may not have ingested any Drive files yet, or the query is not related to ingested content.",
                    citations: [],
                };
            }

            const lines: string[] = [];
            const citations: ToolResult["citations"] = [];
            const fetchedNeighbors = new Map<string, { prev: string | null; next: string | null }>();

            for (let i = 0; i < relevant.length; i++) {
                const m = relevant[i]!;
                const meta = (m.metadata ?? {}) as Record<string, any>;
                const text = String(meta.text ?? "");
                const fileName = String(meta.fileName ?? "Unknown");
                const driveFileId = String(meta.driveFileId ?? "");
                const section = String(meta.section ?? "");
                const chunkIndex = Number(meta.chunkIndex ?? 0);
                const totalChunks = Number(meta.totalChunks ?? 1);
                const score = m.score ?? 0;

                const neighborKey = `${driveFileId}-${chunkIndex}`;
                let neighbors = fetchedNeighbors.get(neighborKey);
                if (!neighbors) {
                    try {
                        neighbors = await fetchNeighborChunks(
                            ctx.userId,
                            driveFileId,
                            chunkIndex,
                            embedding
                        );
                        fetchedNeighbors.set(neighborKey, neighbors);
                    } catch {
                        neighbors = { prev: null, next: null };
                    }
                }

                const parts: string[] = [];
                if (neighbors.prev) {
                    parts.push(`[preceding context] ...${neighbors.prev.slice(-500)}`);
                }
                parts.push(text);
                if (neighbors.next) {
                    parts.push(`[following context] ${neighbors.next.slice(0, 500)}...`);
                }

                const sectionLabel = section ? ` | Section: ${section}` : "";
                const chunkLabel = totalChunks > 1 ? ` | Chunk ${chunkIndex + 1}/${totalChunks}` : "";

                lines.push(
                    `[${i + 1}] ${fileName} (score: ${score.toFixed(3)}${sectionLabel}${chunkLabel})\n${parts.join("\n\n")}`
                );

                citations.push({
                    id: uuidv4(),
                    sourceType: "drive",
                    title: section ? `${fileName} - ${section}` : fileName,
                    url: driveFileId
                        ? `https://drive.google.com/file/d/${driveFileId}/view`
                        : undefined,
                    snippet: text.slice(0, 240),
                });
            }

            return {
                ok: true,
                content: lines.join("\n\n---\n\n"),
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
