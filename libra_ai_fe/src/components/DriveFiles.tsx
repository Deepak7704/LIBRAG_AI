import { useEffect, useState } from "react";
import type { DriveFile, IngestResult } from "../types";

type IngestPhase =
  | { state: "idle" }
  | { state: "ingesting"; message: string }
  | { state: "done"; results: IngestResult[] }
  | { state: "error"; message: string };

export function DriveFiles(props: { backendBase: string; enabled: boolean }) {
  const { backendBase, enabled } = props;
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState("");
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [ingest, setIngest] = useState<IngestPhase>({ state: "idle" });
  const [ingestedIds, setIngestedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDriveFiles([]); setSelectedIds({}); setFilesError(""); setIngest({ state: "idle" }); setIngestedIds(new Set());
  }, [enabled]);

  async function fetchIngestedIds() {
    try {
      const resp = await fetch(`${backendBase}/drive/ingest/status`, { credentials: "include" });
      const data = await resp.json();
      const ids = new Set<string>((data.files ?? []).filter((f: any) => f.lastSyncedAt).map((f: any) => f.driveFileId));
      setIngestedIds(ids);
    } catch (e) { console.error("[drive] fetchIngestedIds failed:", e); }
  }

  async function loadDriveFiles() {
    if (!enabled) return;
    setFilesLoading(true); setFilesError("");
    try {
      const resp = await fetch(`${backendBase}/drive/list`, { credentials: "include" });
      const data = await resp.json();
      if (!resp.ok) { setFilesError(data.error || "Failed"); return; }
      setDriveFiles(Array.isArray(data.files) ? data.files : []);
      await fetchIngestedIds();
    } catch (e: any) { setFilesError(String(e?.message ?? e)); }
    finally { setFilesLoading(false); }
  }

  function toggleFile(id: string) {
    if (ingestedIds.has(id)) return;
    setSelectedIds((p) => { const n = { ...p }; n[id] = !n[id]; if (!n[id]) delete n[id]; return n; });
  }

  async function ingestSelected() {
    const fileIds = Object.keys(selectedIds);
    if (!fileIds.length) return;
    setIngest({ state: "ingesting", message: `Indexing ${fileIds.length} file${fileIds.length > 1 ? "s" : ""}...` });
    try {
      const resp = await fetch(`${backendBase}/drive/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fileIds }),
      });
      const data = await resp.json();
      if (!resp.ok) { setIngest({ state: "error", message: data.error || "Failed" }); return; }
      setIngest({ state: "done", results: data.results ?? [] });
      setSelectedIds({});
      await fetchIngestedIds();
    } catch (e: any) { setIngest({ state: "error", message: String(e?.message ?? e) }); }
  }

  async function resyncAll() {
    const indexedFileIds = driveFiles.filter((f) => ingestedIds.has(f.id)).map((f) => f.id);
    if (!indexedFileIds.length) return;
    setIngest({ state: "ingesting", message: `Re-syncing ${indexedFileIds.length} file${indexedFileIds.length > 1 ? "s" : ""}...` });
    try {
      const resp = await fetch(`${backendBase}/drive/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fileIds: indexedFileIds }),
      });
      const data = await resp.json();
      if (!resp.ok) { setIngest({ state: "error", message: data.error || "Failed" }); return; }
      setIngest({ state: "done", results: data.results ?? [] });
      await fetchIngestedIds();
    } catch (e: any) { setIngest({ state: "error", message: String(e?.message ?? e) }); }
  }

  const uningested = driveFiles.filter((f) => !ingestedIds.has(f.id));
  const indexedCount = driveFiles.filter((f) => ingestedIds.has(f.id)).length;
  const selectedCount = Object.keys(selectedIds).length;
  const hasFiles = driveFiles.length > 0;
  const busy = ingest.state === "ingesting";

  return (
    <div className="border border-border rounded-xl p-4 bg-surface">
      <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-3">Drive Files</div>

      {ingest.state === "ingesting" && (
        <div className="flex items-center gap-2.5 p-3 mb-3 rounded-lg bg-primary-soft border border-border text-primary text-sm">
          <div className="w-4 h-4 border-2 border-sky-800/40 border-t-primary rounded-full animate-spin shrink-0" />
          <div>
            <div className="font-semibold">{ingest.message}</div>
            <div className="text-[11px] text-text-muted mt-0.5">Embedding and uploading vectors</div>
          </div>
        </div>
      )}

      {ingest.state === "done" && (
        <div className="mb-3 p-3 rounded-lg bg-card border border-border">
          <div className="text-xs font-semibold text-success mb-1">Indexing complete</div>
          {ingest.results.map((r) => (
            <div key={r.fileId} className="text-[11px] py-0.5">
              {r.status === "ok" && <span className="text-success">{r.fileName} — {r.chunks} chunks</span>}
              {r.status === "skipped" && <span className="text-text-muted">{r.fileName} — skipped</span>}
              {r.status === "error" && <span className="text-danger">{r.fileName} — {r.error}</span>}
            </div>
          ))}
          <button onClick={() => setIngest({ state: "idle" })} className="mt-2 px-2.5 py-1 text-[11px] font-medium rounded-md text-text-secondary border border-border hover:bg-card transition-all">Dismiss</button>
        </div>
      )}

      {ingest.state === "error" && (
        <div className="mb-3">
          <div className="text-[11px] text-danger bg-card border border-border rounded-lg px-3 py-2">{ingest.message}</div>
          <button onClick={() => setIngest({ state: "idle" })} className="mt-2 px-2.5 py-1 text-[11px] font-medium rounded-md text-text-secondary border border-border hover:bg-card transition-all">Dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button onClick={loadDriveFiles} disabled={!enabled || filesLoading || busy} className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-text-secondary border border-border hover:bg-card disabled:opacity-40 transition-all">
          {filesLoading ? "Loading..." : "Load Files"}
        </button>
        {indexedCount > 0 && (
          <button onClick={resyncAll} disabled={busy} className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-primary border border-primary/30 hover:bg-primary-soft disabled:opacity-40 transition-all">
            ↻ Re-sync ({indexedCount})
          </button>
        )}
        {uningested.length > 0 && (
          <>
            <button onClick={() => { const n: Record<string, boolean> = {}; uningested.forEach((f) => n[f.id] = true); setSelectedIds(n); }} disabled={busy} className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-text-secondary border border-border hover:bg-card disabled:opacity-40 transition-all">All</button>
            <button onClick={() => setSelectedIds({})} disabled={busy} className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-text-secondary border border-border hover:bg-card disabled:opacity-40 transition-all">None</button>
            <button onClick={ingestSelected} disabled={!selectedCount || busy} className="px-3 py-1.5 text-[11px] font-semibold rounded-lg btn-gradient text-white disabled:opacity-40 transition-all">
              Ingest ({selectedCount})
            </button>
          </>
        )}
      </div>

      {filesError && <div className="text-[11px] text-danger bg-card border border-border rounded-lg px-3 py-2 mt-2">{filesError}</div>}

      {enabled && hasFiles && !busy && (
        <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto mt-3">
          {driveFiles.map((f) => {
            const ingested = ingestedIds.has(f.id);
            return (
              <label key={f.id} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors ${ingested ? "opacity-50 cursor-default" : "cursor-pointer hover:bg-card"}`}>
                <input
                  type="checkbox"
                  checked={!!selectedIds[f.id]}
                  onChange={() => toggleFile(f.id)}
                  disabled={ingested}
                  className="accent-primary w-3.5 h-3.5 cursor-pointer disabled:cursor-default"
                />
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-medium truncate ${ingested ? "line-through text-text-muted" : "text-text"}`}>{f.name}</div>
                  <div className="text-[10px] text-text-muted truncate">
                    {ingested && <span className="text-success font-semibold mr-1">indexed</span>}
                    {f.mimeType?.split(".").pop()?.replace("document", "doc") ?? ""}
                    {f.modifiedTime ? ` · ${new Date(f.modifiedTime).toLocaleDateString()}` : ""}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {enabled && !hasFiles && !filesLoading && <div className="mt-2 text-[11px] text-text-muted">Click "Load Files" to browse.</div>}
      {!enabled && <div className="text-[11px] text-text-muted">Connect Google Drive first.</div>}
    </div>
  );
}