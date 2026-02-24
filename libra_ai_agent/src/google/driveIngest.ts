import { getDriveClient } from "./driveClient";
import { embedText } from "../utils/embeddings";
import { chunkByHeadings } from "../utils/embeddings";
import { upsertVectors } from "../utils/pinecone";
import { prisma } from "../../lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

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

    const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "text" }
    );
    return String(res.data ?? "");
}

function hashContent(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

export async function ingestDriveFiles(
    userId: string,
    fileIds?: string[]
): Promise<IngestResult[]> {
    const drive = await getDriveClient(userId);
    const results: IngestResult[] = [];

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

    for (const file of filesToProcess) {
        try {
            const text = await exportText(drive, file.id, file.mimeType);
            if (!text.trim()) {
                results.push({ fileId: file.id, fileName: file.name, chunks: 0, status: "skipped" });
                continue;
            }

            const hash = hashContent(text);

            const existing = await prisma.driveFile.findUnique({
                where: { userId_driveFileId: { userId, driveFileId: file.id } },
            });

            if (existing?.contentHash === hash) {
                results.push({ fileId: file.id, fileName: file.name, chunks: 0, status: "skipped" });
                continue;
            }

            const chunks = chunkByHeadings(text, 2500);
            const vectors = [];

            for (let i = 0; i < chunks.length; i++) {
                const embedding = await embedText(chunks[i]!);
                vectors.push({
                    id: `${userId}-${file.id}-${i}`,
                    values: embedding,
                    metadata: {
                        userId,
                        driveFileId: file.id,
                        fileName: file.name,
                        chunkIndex: i,
                        text: chunks[i]!.slice(0, 3000),
                    },
                });
            }

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

            results.push({ fileId: file.id, fileName: file.name, chunks: chunks.length, status: "ok" });
        } catch (e: any) {
            results.push({
                fileId: file.id,
                fileName: file.name,
                chunks: 0,
                status: "error",
                error: String(e?.message ?? e),
            });
        }
    }

    return results;
}
