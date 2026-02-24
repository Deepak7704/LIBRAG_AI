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
