import { useEffect, useState, useRef } from "react";

type StatusResp =
  | { connected: false }
  | { connected: true; email: string | null; canonicalUserId: string };

function getOrCreateUserId() {
  const key = "libra_user_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

function setStoredUserId(id: string) {
  localStorage.setItem("libra_user_id", id);
}

export function DriveConnect(props: {
  backendBase: string;
  onUserId: (id: string) => void;
  onStatus: (s: { connected: boolean; email: string }) => void;
}) {
  const { backendBase, onUserId, onStatus } = props;
  const [userId, setUserId] = useState(() => getOrCreateUserId());
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const initializedRef = useRef(false);

  async function refreshStatus(currentId: string) {
    setLoading(true); setErr("");
    try {
      const url = new URL(`${backendBase}/auth/google/status`);
      url.searchParams.set("userId", currentId);
      const res = await fetch(url.toString());
      const data = (await res.json()) as any;
      setStatus(data);
      const connected = !!data?.connected;
      const email = connected && data?.email ? String(data.email) : "";

      if (connected && data.canonicalUserId && data.canonicalUserId !== currentId) {
        setStoredUserId(data.canonicalUserId);
        setUserId(data.canonicalUserId);
        onUserId(data.canonicalUserId);
      } else {
        onUserId(currentId);
      }

      onStatus({ connected, email });
    } catch (e: any) {
      console.error("[drive] status check failed:", e);
      setErr(String(e?.message ?? e));
      onStatus({ connected: false, email: "" });
    } finally { setLoading(false); }
  }

  function connectDrive() {
    const url = new URL(`${backendBase}/auth/google/start`);
    url.searchParams.set("userId", userId);
    window.location.href = url.toString();
  }

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const url = new URL(window.location.href);
    const returnedUserId = url.searchParams.get("userId");
    const connected = url.searchParams.get("connected");

    let activeId = userId;

    if (connected === "1" && returnedUserId) {
      setStoredUserId(returnedUserId);
      setUserId(returnedUserId);
      activeId = returnedUserId;
      url.searchParams.delete("connected");
      url.searchParams.delete("userId");
      window.history.replaceState({}, "", url.toString());
    } else if (connected === "1") {
      url.searchParams.delete("connected");
      window.history.replaceState({}, "", url.toString());
    }

    onUserId(activeId);
    refreshStatus(activeId);
  }, []);

  const connected = !!status?.connected;

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