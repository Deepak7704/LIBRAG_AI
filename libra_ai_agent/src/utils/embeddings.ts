const API_KEY = process.env.GEMINI_API_KEY!;
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";

const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${API_KEY}`;
const BATCH_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${API_KEY}`;

export async function embedText(text: string): Promise<number[]> {
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
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const resp = await fetch(BATCH_EMBED_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            requests: texts.map((text) => ({
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
}

type HeadingChunk = {
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
    if (upper === trimmed && trimmed.length > 3 && /^[A-Z0-9\s:\-–—]+$/.test(trimmed)) {
        return { level: 1, text: trimmed };
    }

    return null;
}

export function chunkByHeadings(text: string, maxChars = 3000): string[] {
    const lines = text.split("\n");
    const headingStack: string[] = [];
    const chunks: HeadingChunk[] = [];
    let currentBody: string[] = [];

    function flushChunk() {
        const body = currentBody.join("\n").trim();
        if (!body) return;
        const heading = headingStack.join(" > ");
        chunks.push({ heading, content: body });
        currentBody = [];
    }

    for (const line of lines) {
        const h = detectHeadingLevel(line);
        if (h) {
            flushChunk();
            while (headingStack.length >= h.level) headingStack.pop();
            headingStack.push(h.text);
        } else {
            currentBody.push(line);
        }
    }

    flushChunk();

    if (chunks.length === 0 && text.trim().length > 0) {
        return splitBySize(text, maxChars);
    }

    const result: string[] = [];
    for (const chunk of chunks) {
        const full = chunk.heading
            ? `${chunk.heading}\n\n${chunk.content}`
            : chunk.content;

        if (full.length <= maxChars) {
            result.push(full);
        } else {
            const parts = splitBySize(chunk.content, maxChars - chunk.heading.length - 4);
            for (const part of parts) {
                result.push(chunk.heading ? `${chunk.heading}\n\n${part}` : part);
            }
        }
    }

    return result.filter((c) => c.trim().length > 0);
}

function splitBySize(text: string, maxChars: number): string[] {
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
        start = end;
    }
    return chunks;
}
