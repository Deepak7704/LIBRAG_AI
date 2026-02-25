const API_KEY = process.env.GEMINI_API_KEY!;
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${API_KEY}`;
const BATCH_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${API_KEY}`;

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (e: any) {
            const msg = String(e?.message ?? "");
            if (msg.includes("429") && attempt < maxRetries - 1) {
                const delayMatch = msg.match(/retry in ([\d.]+)s/i);
                const waitSec = delayMatch ? parseFloat(delayMatch[1]!) : 10 * (attempt + 1);
                await new Promise((r) => setTimeout(r, waitSec * 1000));
                continue;
            }
            throw e;
        }
    }
    throw new Error("Max retries exceeded");
}

export async function embedText(text: string): Promise<number[]> {
    return withRetry(async () => {
        const resp = await fetch(EMBED_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: `models/${EMBED_MODEL}`,
                content: { parts: [{ text }] },
                outputDimensionality: 768,
            }),
        });
        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Embedding failed (${resp.status}): ${err}`);
        }
        const data = (await resp.json()) as any;
        return data.embedding?.values ?? [];
    });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const allEmbeddings: number[][] = [];
    const batchSize = 20;

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const embeddings = await withRetry(async () => {
            const resp = await fetch(BATCH_EMBED_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requests: batch.map((text) => ({
                        model: `models/${EMBED_MODEL}`,
                        content: { parts: [{ text }] },
                        outputDimensionality: 768,
                    })),
                }),
            });
            if (!resp.ok) {
                const err = await resp.text();
                throw new Error(`Batch embedding failed (${resp.status}): ${err}`);
            }
            const data = (await resp.json()) as any;
            return (data.embeddings as any[]).map((e) => e.values ?? []);
        });
        allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
}

export type DocumentChunk = {
    text: string;
    section: string;
    chunkIndex: number;
    totalChunks: number;
};

type SectionChunk = {
    heading: string;
    content: string;
};

function detectHeadingLevel(line: string): { level: number; text: string } | null {
    const mdMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (mdMatch) {
        return { level: mdMatch[1]!.length, text: mdMatch[2]!.trim() };
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 120) return null;

    const upper = trimmed.toUpperCase();
    if (upper === trimmed && trimmed.length > 3 && /^[A-Z0-9\s:\-\u2013\u2014]+$/.test(trimmed)) {
        return { level: 1, text: trimmed };
    }

    return null;
}

export function chunkDocument(
    text: string,
    maxChars = 2500,
    overlap = 200
): DocumentChunk[] {
    const lines = text.split("\n");
    const headingStack: string[] = [];
    const sections: SectionChunk[] = [];
    let currentBody: string[] = [];

    function flushChunk() {
        const body = currentBody.join("\n").trim();
        if (!body) return;
        const heading = headingStack.join(" > ");
        sections.push({ heading, content: body });
        currentBody = [];
    }

    for (const line of lines) {
        const heading = detectHeadingLevel(line);
        if (heading) {
            flushChunk();
            while (headingStack.length >= heading.level) headingStack.pop();
            headingStack.push(heading.text);
        } else {
            currentBody.push(line);
        }
    }

    flushChunk();

    if (sections.length === 0 && text.trim().length > 0) {
        const rawChunks = splitBySizeWithOverlap(text, maxChars, overlap);
        return rawChunks.map((t, i) => ({
            text: t,
            section: "",
            chunkIndex: i,
            totalChunks: rawChunks.length,
        }));
    }

    const expandedChunks: { text: string; section: string }[] = [];

    for (const chunk of sections) {
        const full = chunk.heading
            ? `${chunk.heading}\n\n${chunk.content}`
            : chunk.content;

        if (full.length <= maxChars) {
            expandedChunks.push({ text: full, section: chunk.heading });
        } else {
            const parts = splitBySizeWithOverlap(
                chunk.content,
                maxChars - chunk.heading.length - 4,
                overlap
            );
            for (const part of parts) {
                expandedChunks.push({
                    text: chunk.heading ? `${chunk.heading}\n\n${part}` : part,
                    section: chunk.heading,
                });
            }
        }
    }

    const filtered = expandedChunks.filter((c) => c.text.trim().length > 0);
    const withOverlap = applyOverlap(filtered, overlap);

    return withOverlap.map((c, i) => ({
        text: c.text,
        section: c.section,
        chunkIndex: i,
        totalChunks: withOverlap.length,
    }));
}

function applyOverlap(
    chunks: { text: string; section: string }[],
    overlap: number
): { text: string; section: string }[] {
    if (chunks.length <= 1 || overlap <= 0) return chunks;

    const result: { text: string; section: string }[] = [chunks[0]!];

    for (let i = 1; i < chunks.length; i++) {
        const prevText = chunks[i - 1]!.text;
        const current = chunks[i]!;

        const overlapStart = Math.max(0, prevText.length - overlap);
        let overlapText = prevText.slice(overlapStart);
        const firstSpace = overlapText.indexOf(" ");
        if (firstSpace > 0) overlapText = overlapText.slice(firstSpace + 1);

        result.push({
            text: `[...] ${overlapText}\n\n---\n\n${current.text}`,
            section: current.section,
        });
    }

    return result;
}

function splitBySizeWithOverlap(
    text: string,
    maxChars: number,
    overlap: number
): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        let end = Math.min(start + maxChars, text.length);

        if (end < text.length) {
            const lastBreak = text.lastIndexOf("\n", end);
            if (lastBreak > start + maxChars * 0.4) end = lastBreak + 1;
        }

        const chunk = text.slice(start, end).trim();
        if (chunk.length > 0) chunks.push(chunk);

        start = Math.max(start + 1, end - overlap);
    }

    return chunks;
}

export function chunkByHeadings(text: string, maxChars = 3000): string[] {
    return chunkDocument(text, maxChars, 200).map((c) => c.text);
}
