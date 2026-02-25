import "./index.css";
import { useState, useEffect, useRef } from "react";
import { DriveConnect } from "./components/DriveConnect";
import { DriveFiles } from "./components/DriveFiles";
import { AgentRunner } from "./components/AgentRunner";
import { ConversationHistory } from "./components/ConversationHistory";
import type { FinalEvent } from "./types";

/* ── SVG icons ── */
function CloudLogo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}



const API_BASE = "http://localhost:3000";

type HistoryEntry = { id: string; title: string; createdAt: string };

function AvatarDropdown(props: { email: string; onDisconnect: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initial = (props.email?.[0] ?? "U").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full btn-gradient flex items-center justify-center text-white text-sm font-bold hover:opacity-90 transition-opacity"
        title={props.email}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-56 bg-surface border border-border rounded-xl shadow-lg py-2 z-50 animate-fadein">
          <div className="px-4 py-2 border-b border-border">
            <div className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Account</div>
            <div className="text-sm text-text font-medium truncate mt-1">{props.email}</div>
          </div>
          <button
            onClick={() => { setOpen(false); props.onDisconnect(); }}
            className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-card transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [userId, setUserId] = useState("");
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | undefined>();
  const [selectedConv, setSelectedConv] = useState<{ id: string; messages: { role: string; content: string }[] } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function loadHistory(autoSelect = false) {
    if (!userId || !driveConnected) return;
    try {
      const url = new URL(`${API_BASE}/agent/conversations`);
      url.searchParams.set("userId", userId);
      const resp = await fetch(url.toString());
      const data = await resp.json();
      const convs = data.conversations ?? [];
      setHistory(convs);
      if (autoSelect && convs.length > 0 && !currentConvId && !selectedConv) {
        viewConversation(convs[0].id);
      }
    } catch (e) { console.error("[app] loadHistory failed:", e); }
  }

  async function viewConversation(id: string) {
    try {
      const url = new URL(`${API_BASE}/agent/conversations/${id}`);
      url.searchParams.set("userId", userId);
      const resp = await fetch(url.toString());
      const data = await resp.json();
      setSelectedConv({ id, messages: data.conversation?.messages ?? [] });
      setCurrentConvId(id);
      setSidebarOpen(false);
    } catch (e) { console.error("[app] viewConversation failed:", e); }
  }

  function startNewChat() {
    setSelectedConv(null);
    setCurrentConvId(undefined);
    setSidebarOpen(false);
  }

  async function handleDisconnect() {
    try {
      await fetch(`${API_BASE}/auth/google/disconnect`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch (e) { console.error("[app] disconnect failed:", e); }
    window.location.reload();
  }

  useEffect(() => {
    if (userId && driveConnected) {
      loadHistory(true);
    } else {
      setHistory([]);
      setSelectedConv(null);
      setCurrentConvId(undefined);
    }
  }, [userId, driveConnected]);

  return (
    <div className="flex h-screen overflow-hidden">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-lg bg-surface border border-border shadow-sm flex items-center justify-center text-text-secondary hover:text-primary transition-colors"
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>

      {sidebarOpen && <div className="md:hidden fixed inset-0 z-30 bg-black/20" onClick={() => setSidebarOpen(false)} />}

      <aside className={`w-80 bg-surface border-r border-border flex flex-col shrink-0 fixed md:static inset-y-0 left-0 z-40 transition-transform duration-200 h-screen ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="h-14 px-5 border-b border-border flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg btn-gradient flex items-center justify-center">
            <CloudLogo className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold text-text">Libra <span className="text-gradient">AI</span></span>
        </div>

        <div className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
          <DriveConnect backendBase={API_BASE} onUserId={setUserId} onStatus={(s) => { setDriveConnected(s.connected); setDriveEmail(s.email); }} />
          <DriveFiles backendBase={API_BASE} userId={userId} enabled={driveConnected} />
          {driveConnected && <ConversationHistory history={history} onSelect={viewConversation} onNewChat={startNewChat} />}
        </div>
      </aside>

      <main className="flex flex-col flex-1 min-w-0 h-screen bg-bg">
        <div className="h-14 px-4 md:px-7 border-b border-border flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden w-9 h-9 max-w-9 max-h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-primary transition-colors shrink-0 overflow-hidden"
          >
            <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex-1" />
          {driveConnected && driveEmail && (
            <AvatarDropdown email={driveEmail} onDisconnect={handleDisconnect} />
          )}
        </div>

        <AgentRunner
          backendBase={API_BASE}
          userId={userId}
          disabled={!userId}
          conversationId={driveConnected ? currentConvId : undefined}
          onConversationId={driveConnected ? setCurrentConvId : () => { }}
          selectedConversation={driveConnected ? selectedConv : null}
          onConversationSaved={driveConnected ? loadHistory : () => { }}
        />
      </main>
    </div>
  );
}

export default App;