import { Router } from "express";
import { getDriveClient } from "../drive/driveClient";
import { ingestDriveFiles } from "../drive/driveIngest";
import { prisma } from "../../lib/prisma";

export const driveRouter = Router();

driveRouter.get("/list", async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const drive = await getDriveClient(req.userId);
    const pageToken = req.query.pageToken as string | undefined;
    const search = req.query.search as string | undefined;

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
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { fileIds } = req.body ?? {};

  if (fileIds !== undefined) {
    if (!Array.isArray(fileIds) || !fileIds.every((id: unknown) => typeof id === "string" && id.length > 0)) {
      res.status(400).json({ error: "fileIds must be an array of non-empty strings" });
      return;
    }
  }

  try {
    const results = await ingestDriveFiles(req.userId, fileIds);
    res.json({ ok: true, results });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

driveRouter.get("/ingest/status", async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const files = await prisma.driveFile.findMany({
    where: { userId: req.userId },
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