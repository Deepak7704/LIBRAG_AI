import { getDriveClient } from "./driveClient";
import { embedTexts } from "../utils/embeddings";
import { chunkDocument } from "../utils/embeddings";
import { upsertVectors } from "../utils/pinecone";
import { prisma } from "../../lib/prisma";
import { createHash } from "crypto";
import { PDFParse } from "pdf-parse";

type IngestResult = {
    fileId: string;
    fileName: string;
    chunks: number;
    status: "ok" | "skipped" | "error";
    error?: string;
};

async function exportText(
    drive: Awaited<ReturnType<typeof getDriveClient>>,
    fileId: string,
    mimeType: string
): Promise<string> {
    if (mimeType === "application/vnd.google-apps.document") {
        const res = await drive.files.export({ fileId, mimeType: "text/plain" });
        return String(res.data ?? "");
    }

    if (mimeType === "application/vnd.google-apps.spreadsheet") {
        const res = await drive.files.export({ fileId, mimeType: "text/csv" });
        return String(res.data ?? "");
    }

    if (mimeType === "application/vnd.google-apps.presentation") {
        const res = await drive.files.export({ fileId, mimeType: "text/plain" });
        return String(res.data ?? "");
    }

    if (mimeType === "application/pdf") {
        const res = await drive.files.get(
            { fileId, alt: "media" },
            { responseType: "arraybuffer" }
        );
        const buf = Buffer.from(res.data as ArrayBuffer);
        try {
            const parser = new PDFParse({ data: new Uint8Array(buf) });
            const textResult = await parser.getText();
            await parser.destroy();
            return textResult.text ?? "";
        } catch (e) {
            console.error("[ingest] pdf-parse failed, falling back to raw decode:", e);
            return buf.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
        }
    }

    const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "text" }
    );
    return String(res.data ?? "");
}

function hashContent(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

async function ingestSingleFile(
    drive: Awaited<ReturnType<typeof getDriveClient>>,
    userId: string,
    file: { id: string; name: string; mimeType: string }
): Promise<IngestResult> {
    try {
        const text = await exportText(drive, file.id, file.mimeType);
        if (!text.trim()) {
            return { fileId: file.id, fileName: file.name, chunks: 0, status: "skipped" };
        }

        const hash = hashContent(text);

        const existing = await prisma.driveFile.findUnique({
            where: { userId_driveFileId: { userId, driveFileId: file.id } },
        });

        if (existing?.contentHash === hash) {
            return { fileId: file.id, fileName: file.name, chunks: 0, status: "skipped" };
        }

        const richChunks = chunkDocument(text, 2500, 200);
        const chunkTexts = richChunks.map((c) => c.text);

        const batchSize = 100;
        const allEmbeddings: number[][] = [];
        for (let i = 0; i < chunkTexts.length; i += batchSize) {
            const batch = chunkTexts.slice(i, i + batchSize);
            const embeddings = await embedTexts(batch);
            allEmbeddings.push(...embeddings);
        }

        const vectors = richChunks.map((chunk, i) => ({
            id: `${userId}-${file.id}-${i}`,
            values: allEmbeddings[i]!,
            metadata: {
                userId,
                driveFileId: file.id,
                fileName: file.name,
                chunkIndex: chunk.chunkIndex,
                totalChunks: chunk.totalChunks,
                section: chunk.section,
                text: chunk.text.slice(0, 3000),
            },
        }));

        await upsertVectors(vectors);

        await prisma.driveFile.upsert({
            where: { userId_driveFileId: { userId, driveFileId: file.id } },
            create: {
                userId,
                driveFileId: file.id,
                name: file.name,
                mimeType: file.mimeType,
                contentHash: hash,
                lastSyncedAt: new Date(),
            },
            update: {
                name: file.name,
                contentHash: hash,
                lastSyncedAt: new Date(),
            },
        });

        return { fileId: file.id, fileName: file.name, chunks: richChunks.length, status: "ok" };
    } catch (e: any) {
        return {
            fileId: file.id,
            fileName: file.name,
            chunks: 0,
            status: "error",
            error: String(e?.message ?? e),
        };
    }
}

async function runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    limit: number
): Promise<T[]> {
    const results: T[] = [];
    let index = 0;

    async function worker() {
        while (index < tasks.length) {
            const current = index++;
            results[current] = await tasks[current]!();
        }
    }

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

export async function ingestDriveFiles(
    userId: string,
    fileIds?: string[]
): Promise<IngestResult[]> {
    const drive = await getDriveClient(userId);

    let filesToProcess: { id: string; name: string; mimeType: string }[] = [];

    if (fileIds && fileIds.length > 0) {
        for (const fid of fileIds) {
            const meta = await drive.files.get({ fileId: fid, fields: "id,name,mimeType" });
            filesToProcess.push({
                id: meta.data.id ?? fid,
                name: meta.data.name ?? fid,
                mimeType: meta.data.mimeType ?? "",
            });
        }
    } else {
        const resp = await drive.files.list({
            pageSize: 100,
            q: "trashed=false and (mimeType='application/vnd.google-apps.document' or mimeType='application/pdf' or mimeType='text/plain' or mimeType='application/vnd.google-apps.spreadsheet' or mimeType='application/vnd.google-apps.presentation')",
            fields: "files(id,name,mimeType)",
            orderBy: "modifiedTime desc",
        });
        filesToProcess = (resp.data.files ?? []).map((f) => ({
            id: f.id ?? "",
            name: f.name ?? "",
            mimeType: f.mimeType ?? "",
        }));
    }

    const tasks = filesToProcess.map(
        (file) => () => ingestSingleFile(drive, userId, file)
    );

    return runWithConcurrency(tasks, 3);
}
