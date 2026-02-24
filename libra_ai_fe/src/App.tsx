import "./index.css";
import { useState, useEffect } from "react";
import { DriveConnect } from "./components/DriveConnect";
import { DriveFiles } from "./components/DriveFiles";
import { AgentRunner } from "./components/AgentRunner";
import { ConversationHistory } from "./components/ConversationHistory";
import type { FinalEvent } from "./types";

const API_BASE = "http://localhost:3000";

type HistoryEntry = { id: string; title: string; createdAt: string };

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
      // Auto-select the most recent conversation on initial load
      if (autoSelect && convs.length > 0 && !currentConvId && !selectedConv) {
        viewConversation(convs[0].id);
      }
    } catch { }
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
    } catch { }
  }

  function startNewChat() {
    setSelectedConv(null);
    setCurrentConvId(undefined);
    setSidebarOpen(false);
  }

  // Load history only when authenticated (Drive connected)
  useEffect(() => {
    if (userId && driveConnected) {
      loadHistory(true);
    } else {
      // Clear history when not authenticated (guest mode)
      setHistory([]);
      setSelectedConv(null);
      setCurrentConvId(undefined);
    }
  }, [userId, driveConnected]);

  return (
    <div className="flex min-h-screen">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-lg bg-white border border-border shadow-sm flex items-center justify-center text-text-secondary hover:text-primary transition-colors"
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>

      {sidebarOpen && <div className="md:hidden fixed inset-0 z-30 bg-black/20" onClick={() => setSidebarOpen(false)} />}

      <aside className={`w-80 bg-surface border-r border-border flex flex-col overflow-y-auto shrink-0 fixed md:static inset-y-0 left-0 z-40 transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white text-xs font-bold">L</span>
          </div>
          <span className="text-base font-bold text-text">Libra <span className="text-primary">AI</span></span>
        </div>

        <div className="p-4 flex flex-col gap-3 flex-1">
          <DriveConnect backendBase={API_BASE} onUserId={setUserId} onStatus={(s) => { setDriveConnected(s.connected); setDriveEmail(s.email); }} />
          <DriveFiles backendBase={API_BASE} userId={userId} enabled={driveConnected} />
          {driveConnected && <ConversationHistory history={history} onSelect={viewConversation} onNewChat={startNewChat} />}
        </div>
      </aside>

      <main className="flex flex-col flex-1 min-w-0 h-screen bg-white">
        <div className="px-4 md:px-7 py-3 border-b border-border flex items-center gap-3">
          <div className="md:hidden w-10" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${driveConnected ? "bg-success" : "bg-text-muted"}`} />
            <h2 className="text-xs font-medium text-text-secondary truncate">
              {driveConnected ? driveEmail || "Google Drive Connected" : "Connect Google Drive to search documents"}
            </h2>
          </div>
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