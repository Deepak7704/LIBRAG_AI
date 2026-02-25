import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { ToolDef } from "./index";
import type { ToolResult, ToolContext } from "../agent/types";
import { getDriveClient } from "../drive/driveClient";

const DriveRetrieveArgs = z.object({
    fileId: z.string().min(1),
    maxChars: z.number().int().min(500).max(30000).default(10000),
});

async function exportFileContent(
    drive: Awaited<ReturnType<typeof getDriveClient>>,
    fileId: string,
    mimeType: string,
    maxChars: number
): Promise<{ text: string; name: string }> {
    const meta = await drive.files.get({
        fileId,
        fields: "id,name,mimeType",
    });
    const name = meta.data.name ?? fileId;
    const fileMime = meta.data.mimeType ?? mimeType;

    let text = "";

    if (fileMime === "application/vnd.google-apps.document") {
        const res = await drive.files.export({ fileId, mimeType: "text/plain" });
        text = String(res.data ?? "");
    } else if (fileMime === "application/pdf") {
        const res = await drive.files.get(
            { fileId, alt: "media" },
            { responseType: "arraybuffer" }
        );
        const buf = Buffer.from(res.data as ArrayBuffer);
        text = buf.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
    } else {
        const res = await drive.files.get(
            { fileId, alt: "media" },
            { responseType: "text" }
        );
        text = String(res.data ?? "");
    }

    return { text: text.slice(0, maxChars), name };
}

export const driveRetrieveTool: ToolDef<typeof DriveRetrieveArgs> = {
    name: "drive_retrieve",
    description:
        "Retrieve the text content of a single Google Drive file by its file ID. Works for Docs, PDFs, and text files.",
    schema: DriveRetrieveArgs,
    argsExample: { fileId: "1aBcDeFgHiJkLmNoPqRsT", maxChars: 10000 },

    run: async (args, ctx): Promise<ToolResult> => {
        if (!ctx.userId) {
            return {
                ok: false,
                content: "No userId provided. Google Drive is not connected.",
                citations: [],
            };
        }

        try {
            const drive = await getDriveClient(ctx.userId);
            const { text, name } = await exportFileContent(
                drive,
                args.fileId,
                "",
                args.maxChars
            );

            if (!text.trim()) {
                return {
                    ok: true,
                    content: `File "${name}" returned empty content.`,
                    citations: [
                        {
                            id: uuidv4(),
                            sourceType: "drive",
                            title: name,
                            url: `https://drive.google.com/file/d/${args.fileId}/view`,
                        },
                    ],
                };
            }

            return {
                ok: true,
                content: text,
                citations: [
                    {
                        id: uuidv4(),
                        sourceType: "drive",
                        title: name,
                        url: `https://drive.google.com/file/d/${args.fileId}/view`,
                        snippet: text.slice(0, 240),
                    },
                ],
            };
        } catch (e: any) {
            return {
                ok: false,
                content: `drive_retrieve failed: ${String(e?.message ?? e)}`,
                citations: [],
            };
        }
    },
};
