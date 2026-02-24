import { useEffect, useMemo, useState } from "react";

type StatusResp =
  | { connected: false }
  | { connected: true; email: string | null };

function getOrCreateUserId() {
  const key = "libra_user_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

export function DriveConnect(props: {
  backendBase: string;
  onUserId: (id: string) => void;
  onStatus: (s: { connected: boolean; email: string }) => void;
}) {
  const { backendBase, onUserId, onStatus } = props;
  const userId = useMemo(() => getOrCreateUserId(), []);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function refreshStatus() {
    setLoading(true); setErr("");
    try {
      const url = new URL(`${backendBase}/auth/google/status`);
      url.searchParams.set("userId", userId);
      const res = await fetch(url.toString());
      const data = (await res.json()) as StatusResp;
      setStatus(data);
      const connected = !!(data as any)?.connected;
      const email = connected && (data as any)?.email ? String((data as any).email) : "";
      onStatus({ connected, email });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      onStatus({ connected: false, email: "" });
    } finally { setLoading(false); }
  }

  function connectDrive() {
    const url = new URL(`${backendBase}/auth/google/start`);
    url.searchParams.set("userId", userId);
    window.location.href = url.toString();
  }

  async function logout() {
    try {
      await fetch(`${backendBase}/auth/google/disconnect`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch { }
    window.location.reload();
  }

  useEffect(() => {
    onUserId(userId); refreshStatus();
    const url = new URL(window.location.href);
    if (url.searchParams.get("connected") === "1") {
      url.searchParams.delete("connected");
      window.history.replaceState({}, "", url.toString());
      refreshStatus();
    }
  }, []);

  const connected = !!status?.connected;
  const email = connected && status?.connected ? status.email ?? "" : "";

  return (
    <div className="border border-border rounded-xl p-4 bg-white">
      <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-3">Google Drive</div>
      <div className="flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-success" : "bg-text-muted"}`} />
        <span className="text-text-secondary">{loading ? "Checking..." : connected ? "Connected" : "Not connected"}</span>
      </div>
      {connected && email && <div className="text-[11px] text-text-muted mt-1 truncate">{email}</div>}
      {err && <div className="text-[11px] text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">{err}</div>}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {!connected && (
          <button onClick={connectDrive} disabled={loading} className="px-3.5 py-1.5 text-[11px] font-semibold rounded-lg btn-gradient text-white disabled:opacity-40 transition-all">
            Connect Drive
          </button>
        )}
        <button onClick={refreshStatus} disabled={loading} className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-text-secondary border border-border hover:bg-card disabled:opacity-40 transition-all">
          Refresh
        </button>
        {connected && (
          <button onClick={logout} className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-danger border border-red-200 hover:bg-red-50 transition-all">
            Disconnect
          </button>
        )}
        {connected && (
          <button
            onClick={() => { localStorage.removeItem("libra_user_id"); logout(); }}
            className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-text-muted border border-border hover:bg-card transition-all"
          >
            Switch Account
          </button>
        )}
      </div>
    </div>
  );
}