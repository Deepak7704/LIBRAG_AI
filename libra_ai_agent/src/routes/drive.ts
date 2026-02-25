import { Router } from "express";
import { getDriveClient } from "../google/driveClient";
import { ingestDriveFiles } from "../google/driveIngest";
import { prisma } from "../../lib/prisma";

export const driveRouter = Router();

function qv(v: unknown) {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

driveRouter.get("/list", async (req, res) => {
  const userId = qv((req as any).query?.userId);
  const pageToken = qv((req as any).query?.pageToken);
  const search = qv((req as any).query?.search);

  if (!userId) {
    res.status(400).json({ error: "userId (string) is required" });
    return;
  }

  try {
    const drive = await getDriveClient(userId);

    const qParts = ["trashed=false"];
    if (search) {
      const escaped = search.replace(/'/g, "\\'");
      qParts.push(`name contains '${escaped}'`);
    }

    const resp = await drive.files.list({
      pageSize: 50,
      pageToken: pageToken || undefined,
      q: qParts.join(" and "),
      fields: "nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink)",
      orderBy: "modifiedTime desc",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = (resp.data.files ?? []).map((f) => ({
      id: f.id ?? "",
      name: f.name ?? "",
      mimeType: f.mimeType ?? "",
      modifiedTime: f.modifiedTime ?? null,
      size: f.size ?? null,
      webViewLink: (f as any).webViewLink ?? null,
    }));

    res.json({ files, nextPageToken: resp.data.nextPageToken ?? null });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const isNotConnected = msg.toLowerCase().includes("not connected");
    res.status(isNotConnected ? 401 : 500).json({ error: msg });
  }
});

driveRouter.post("/ingest", async (req, res) => {
  const { userId, fileIds } = req.body ?? {};

  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId (string) is required" });
    return;
  }

  if (fileIds !== undefined) {
    if (!Array.isArray(fileIds) || !fileIds.every((id: unknown) => typeof id === "string" && id.length > 0)) {
      res.status(400).json({ error: "fileIds must be an array of non-empty strings" });
      return;
    }
  }

  try {
    const results = await ingestDriveFiles(userId, fileIds);
    res.json({ ok: true, results });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

driveRouter.get("/ingest/status", async (req, res) => {
  const userId = qv((req as any).query?.userId);

  if (!userId) {
    res.status(400).json({ error: "userId (string) is required" });
    return;
  }

  const files = await prisma.driveFile.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      driveFileId: true,
      name: true,
      lastSyncedAt: true,
      contentHash: true,
    },
  });

  res.json({
    totalFiles: files.length,
    syncedFiles: files.filter((f) => f.lastSyncedAt).length,
    files,
  });
});