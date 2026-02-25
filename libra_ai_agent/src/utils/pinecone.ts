import { Pinecone } from "@pinecone-database/pinecone";

const client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

function getIndex() {
    const indexName = process.env.PINECONE_INDEX ?? "libra-ai";
    return client.index(indexName);
}

export type VectorRecord = {
    id: string;
    values: number[];
    metadata: Record<string, string | number | boolean | string[]>;
};

export async function upsertVectors(vectors: VectorRecord[]) {
    const index = getIndex();
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await index.upsert({ records: batch });
    }
}

export async function deleteByFilter(filter: Record<string, unknown>) {
    const index = getIndex();
    await index.deleteMany({ filter });
}

export async function queryVectors(
    embedding: number[],
    filter: Record<string, unknown>,
    topK = 5
) {
    const index = getIndex();
    const result = await index.query({
        vector: embedding,
        topK,
        filter,
        includeMetadata: true,
    });
    return result.matches ?? [];
}

export async function fetchNeighborChunks(
    userId: string,
    driveFileId: string,
    chunkIndex: number,
    embedding: number[]
): Promise<{ prev: string | null; next: string | null }> {
    const index = getIndex();

    const neighborIndices = [chunkIndex - 1, chunkIndex + 1].filter((i) => i >= 0);
    if (neighborIndices.length === 0) return { prev: null, next: null };

    let prev: string | null = null;
    let next: string | null = null;

    for (const idx of neighborIndices) {
        try {
            const result = await index.query({
                vector: embedding,
                topK: 1,
                filter: {
                    userId: { $eq: userId },
                    driveFileId: { $eq: driveFileId },
                    chunkIndex: { $eq: idx },
                },
                includeMetadata: true,
            });

            const match = result.matches?.[0];
            if (match?.metadata) {
                const text = String((match.metadata as any).text ?? "");
                if (idx === chunkIndex - 1) prev = text;
                if (idx === chunkIndex + 1) next = text;
            }
        } catch (e) {
            console.error("[pinecone] neighbor chunk fetch failed:", e);
        }
    }

    return { prev, next };
}
