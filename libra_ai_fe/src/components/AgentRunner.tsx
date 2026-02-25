import { useEffect, useRef, useState } from "react";
import type { FinalEvent, StepEvent } from "../types";

const IconPlan = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="14" height="18" rx="2" />
    <path d="M7 7h6M7 11h6M7 15h4" />
  </svg>
);

const IconThinking = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </svg>
);

const IconTool = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

const IconCheck = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconError = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

type ChatMessage =
  | { role: "user"; text: string }
  | { role: "agent"; steps: StepEvent[]; final: FinalEvent | null; running: boolean };

function getToolLabel(tool: string): string {
  switch (tool) {
    case "web_search": return "Searching the web";
    case "web_scrape": return "Reading page";
    case "vector_search": return "Searching documents";
    case "drive_retrieve": return "Reading Drive file";
    default: return tool;
  }
}

function StepTimeline(props: { steps: StepEvent[]; running: boolean }) {
  return (
    <div className="flex flex-col gap-2 mb-4">
      {props.steps.map((s, i) => {
        if (s.type === "plan" && s.plan) {
          return (
            <div key={i} className="flex items-start gap-2.5 text-sm animate-fadein">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-primary-soft text-primary"><IconPlan /></div>
              <div className="pt-0.5">
                <span className="font-semibold text-text text-[13px]">Planning</span>
                <ol className="mt-1 pl-4 text-[11px] text-text-muted list-decimal space-y-0.5">
                  {s.plan.map((p, j) => <li key={j}>{p}</li>)}
                </ol>
              </div>
            </div>
          );
        }
        if (s.type === "thinking") {
          return (
            <div key={i} className="flex items-center gap-2.5 text-sm text-text-secondary animate-fadein">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-sky-950/30 text-primary"><IconThinking /></div>
              <span className="text-[13px]">Reasoning (step {s.step})...</span>
            </div>
          );
        }
        if (s.type === "tool_call") {
          return (
            <div key={i} className="flex items-start gap-2.5 text-sm animate-fadein">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-card text-warning"><IconTool /></div>
              <div className="pt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary-soft text-primary">{s.tool}</span>
                <span className="text-[13px] text-text-secondary">{getToolLabel(s.tool ?? "")}</span>
              </div>
            </div>
          );
        }
        if (s.type === "tool_result") {
          return (
            <div key={i} className="flex items-center gap-2.5 text-sm animate-fadein">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${s.ok ? "bg-primary-soft text-success" : "bg-card text-danger"}`}>
                {s.ok ? <IconCheck /> : <IconError />}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-950/30 text-primary">{s.tool}</span>
                <span className="text-[13px] text-text-secondary">{s.ok ? "completed" : "failed"}</span>
              </div>
            </div>
          );
        }
        if (s.type === "llm_error" || s.type === "tool_error") {
          const msg = (s.error ?? "").length > 200 ? (s.error ?? "").slice(0, 200) + "..." : (s.error ?? "");
          return (
            <div key={i} className="flex items-start gap-2.5 text-sm animate-fadein min-w-0">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-card text-danger"><IconError /></div>
              <span className="text-[13px] text-danger break-all">{msg}</span>
            </div>
          );
        }
        return null;
      })}
      {props.running && (
        <div className="flex items-center gap-2.5 animate-fadein">
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-sky-950/30">
            <div className="w-3 h-3 border-[1.5px] border-sky-800/40 border-t-primary rounded-full animate-spin" />
          </div>
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-dot-1" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-dot-2" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-dot-3" />
          </div>
        </div>
      )}
    </div>
  );
}

function pickAnswer(final: FinalEvent | null): string {
  if (!final) return "";
  if (typeof final.result?.explanation === "string") return final.result.explanation;
  if (typeof final.result?.answer === "string") return final.result.answer;
  if (typeof final.summary === "string") return final.summary;
  if (typeof final.result === "string") return final.result;
  return JSON.stringify(final.result, null, 2);
}

export function AgentRunner(props: {
  backendBase: string;
  disabled: boolean;
  conversationId?: string;
  onConversationId: (id: string) => void;
  selectedConversation: { id: string; messages: { role: string; content: string }[] } | null;
  onConversationSaved: () => void;
}) {
  const { backendBase, disabled, conversationId, onConversationId, selectedConversation, onConversationSaved } = props;

  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedConversation) {
      const restored: ChatMessage[] = [];
      for (const m of selectedConversation.messages) {
        if (m.role === "user") restored.push({ role: "user", text: m.content });
        else if (m.role === "assistant") {
          try { restored.push({ role: "agent", steps: [], final: JSON.parse(m.content) as FinalEvent, running: false }); }
          catch (e) { console.error("[agent] restore message parse failed:", e); restored.push({ role: "agent", steps: [], final: { summary: m.content, result: {}, citations: [], stepsTaken: 0, stoppedReason: "finished" }, running: false }); }
        }
      }
      setMessages(restored);
    }
  }, [selectedConversation]);

  useEffect(() => { if (!conversationId && !selectedConversation) setMessages([]); }, [conversationId]);

  function scrollToBottom() { setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50); }
  function closeStream() { if (esRef.current) { esRef.current.close(); esRef.current = null; } }
  useEffect(() => () => closeStream(), []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const task = text.trim();
    if (!task || isRunning || disabled) return;
    setMessages((prev) => [...prev, { role: "user", text: task }, { role: "agent", steps: [], final: null, running: true }]);
    setText(""); setIsRunning(true); scrollToBottom(); closeStream();

    const url = new URL(`${backendBase}/agent/run`);
    url.searchParams.set("task", task);
    url.searchParams.set("maxSteps", "10");
    if (conversationId) url.searchParams.set("conversationId", conversationId);

    const es = new EventSource(url.toString(), { withCredentials: true });
    esRef.current = es;

    es.addEventListener("step", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(String(ev.data)) as StepEvent;
        setMessages((prev) => { const c = [...prev]; const l = c[c.length - 1]; if (l && l.role === "agent") l.steps = [...l.steps, data]; return c; });
        scrollToBottom();
      } catch (e) { console.error("[agent] step event parse failed:", e); }
    });

    es.addEventListener("saved", (ev: MessageEvent) => {
      try { const d = JSON.parse(String(ev.data)); if (d.conversationId) onConversationId(d.conversationId); } catch (e) { console.error("[agent] saved event parse failed:", e); }
    });

    es.addEventListener("final", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(String(ev.data)) as FinalEvent;
        setMessages((prev) => { const c = [...prev]; const l = c[c.length - 1]; if (l && l.role === "agent") { l.final = data; l.running = false; } return c; });
        scrollToBottom();
      } catch (e) { console.error("[agent] final event parse failed:", e); }
      closeStream(); setIsRunning(false); onConversationSaved();
    });

    es.onerror = () => {
      closeStream(); setIsRunning(false);
      setMessages((prev) => { const c = [...prev]; const l = c[c.length - 1]; if (l && l.role === "agent") { l.running = false; if (!l.final) l.final = { summary: "Connection lost", result: {}, citations: [], stepsTaken: 0, stoppedReason: "error" }; } return c; });
    };
  }

  return (
    <>
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-5 md:px-4 relative overflow-hidden">
          <div className="hero-aurora" />
          <h3 style={{ fontFamily: "'Instrument Serif', serif" }} className="text-2xl sm:text-4xl md:text-6xl font-normal text-text text-center leading-tight relative z-10">
            You've Had the Answers.<br />
            <span className="italic text-gradient">Your Files</span> Just Couldn't <span className="italic">Talk.</span>
          </h3>
          <p className="text-sm sm:text-lg md:text-xl text-text-secondary text-center md:whitespace-nowrap tracking-wide leading-relaxed relative z-10">
            Connect your Google Drive.&nbsp;&nbsp;Ask anything.&nbsp;&nbsp;Get cited answers instantly.
          </p>
          <form className="flex gap-2 md:gap-2.5 w-full max-w-2xl mt-4 relative z-10" onSubmit={onSubmit}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask something..."
              disabled={isRunning}
              className="flex-1 px-3 md:px-4 py-2.5 md:py-3 rounded-xl border border-border bg-surface text-text text-sm font-sans outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-glow placeholder:text-text-muted"
            />
            <button type="submit" disabled={!text.trim() || isRunning || disabled} className="px-4 md:px-6 py-2.5 md:py-3 rounded-xl text-sm font-semibold btn-gradient text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0">
              {isRunning ? "Working..." : "Send"}
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 md:px-7 py-5 flex flex-col gap-4">
            {messages.map((msg, i) => {
              if (msg.role === "user") {
                return (
                  <div key={i} className="self-end max-w-[85%] md:max-w-xl btn-gradient text-white px-4 py-2.5 rounded-2xl rounded-br-sm text-sm font-medium shadow-sm">
                    {msg.text}
                  </div>
                );
              }
              const answer = pickAnswer(msg.final);
              return (
                <div key={i} className="self-start max-w-[90%] md:max-w-2xl w-full">
                  <div className="bg-surface border border-border rounded-2xl p-4 md:p-5 shadow-sm">
                    <StepTimeline steps={msg.steps} running={msg.running} />
                    {msg.final && (
                      <div className={msg.steps.length ? "border-t border-border pt-3.5" : ""}>
                        <h4 className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-2">
                          {msg.final.stoppedReason === "error" ? "Error" : "Answer"}
                        </h4>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-text">{answer}</div>
                        {msg.final.citations?.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <h5 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Sources</h5>
                            {msg.final.citations.map((c) =>
                              c.url ? (
                                <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="block text-xs text-primary hover:text-primary-hover py-0.5 transition-colors truncate">{c.title ?? c.url}</a>
                              ) : (
                                <span key={c.id} className="block text-xs text-text-secondary py-0.5">{c.title ?? c.id}</span>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          <div className="px-3 md:px-7 py-3 md:py-4 border-t border-border bg-bg">
            <form className="flex gap-2 md:gap-2.5 max-w-3xl mx-auto" onSubmit={onSubmit}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ask something..."
                disabled={isRunning}
                className="flex-1 px-3 md:px-4 py-2.5 md:py-3 rounded-xl border border-border bg-surface text-text text-sm font-sans outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-glow placeholder:text-text-muted"
              />
              <button type="submit" disabled={!text.trim() || isRunning || disabled} className="px-4 md:px-6 py-2.5 md:py-3 rounded-xl text-sm font-semibold btn-gradient text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0">
                {isRunning ? "Working..." : "Send"}
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}