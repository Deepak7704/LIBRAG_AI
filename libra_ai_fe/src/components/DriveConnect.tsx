import { useEffect, useState, useRef } from "react";

type StatusResp =
  | { connected: false }
  | { connected: true; email: string | null };

export function DriveConnect(props: {
  backendBase: string;
  onStatus: (s: { connected: boolean; email: string }) => void;
  hidden?: boolean;
}) {
  const { backendBase, onStatus, hidden } = props;
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const initializedRef = useRef(false);

  async function refreshStatus() {
    setLoading(true);
    setErr("");
    try {
      const resp = await fetch(`${backendBase}/auth/google/status`, { credentials: "include" });
      const data = await resp.json();
      setStatus(data);
      const connected = !!data?.connected;
      const email = connected && data?.email ? String(data.email) : "";
      onStatus({ connected, email });
    } catch (e: any) {
      console.error("[drive] status check failed:", e);
      setErr(String(e?.message ?? e));
      onStatus({ connected: false, email: "" });
    } finally {
      setLoading(false);
    }
  }

  function connectDrive() {
    window.location.href = `${backendBase}/auth/google/start`;
  }

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const url = new URL(window.location.href);
    const connected = url.searchParams.get("connected");

    if (connected === "1") {
      url.searchParams.delete("connected");
      window.history.replaceState({}, "", url.toString());
    }

    refreshStatus();
  }, []);

  const connected = !!status?.connected;

  if (hidden) return null;

  return (
    <div className="border border-border rounded-xl p-4 bg-surface">
      <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-3">Google Drive</div>
      <div className="flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-success" : "bg-text-muted"}`} />
        <span className="text-text-secondary">{loading ? "Checking..." : connected ? "Connected" : "Not connected"}</span>
      </div>
      {err && <div className="text-[11px] text-danger bg-card border border-border rounded-lg px-3 py-2 mt-2">{err}</div>}
      {!connected && (
        <div className="mt-3">
          <button onClick={connectDrive} disabled={loading} className="px-3.5 py-1.5 text-[11px] font-semibold rounded-lg btn-gradient text-white disabled:opacity-40 transition-all">
            Connect Drive
          </button>
        </div>
      )}
    </div>
  );
}