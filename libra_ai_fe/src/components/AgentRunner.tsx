import { useEffect, useRef, useState } from "react";
import type { FinalEvent, StepEvent } from "../types";

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
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 bg-indigo-50 text-primary">P</div>
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
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] shrink-0 bg-indigo-50 text-primary">?</div>
              <span className="text-[13px]">Reasoning (step {s.step})...</span>
            </div>
          );
        }
        if (s.type === "tool_call") {
          return (
            <div key={i} className="flex items-start gap-2.5 text-sm animate-fadein">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 bg-amber-50 text-warning">T</div>
              <div className="pt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-primary">{s.tool}</span>
                <span className="text-[13px] text-text-secondary">{getToolLabel(s.tool ?? "")}</span>
              </div>
            </div>
          );
        }
        if (s.type === "tool_result") {
          return (
            <div key={i} className="flex items-center gap-2.5 text-sm animate-fadein">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${s.ok ? "bg-green-50 text-success" : "bg-red-50 text-danger"}`}>
                {s.ok ? "\u2713" : "!"}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-primary">{s.tool}</span>
                <span className="text-[13px] text-text-secondary">{s.ok ? "completed" : "failed"}</span>
              </div>
            </div>
          );
        }
        if (s.type === "llm_error" || s.type === "tool_error") {
          return (
            <div key={i} className="flex items-center gap-2.5 text-sm animate-fadein">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 bg-red-50 text-danger">!</div>
              <span className="text-[13px] text-danger">{s.error}</span>
            </div>
          );
        }
        return null;
      })}
      {props.running && (
        <div className="flex items-center gap-2.5 animate-fadein">
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-indigo-50">
            <div className="w-3 h-3 border-[1.5px] border-indigo-200 border-t-primary rounded-full animate-spin" />
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
  userId: string;
  disabled: boolean;
  conversationId?: string;
  onConversationId: (id: string) => void;
  selectedConversation: { id: string; messages: { role: string; content: string }[] } | null;
  onConversationSaved: () => void;
}) {
  const { backendBase, userId, disabled, conversationId, onConversationId, selectedConversation, onConversationSaved } = props;

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
          catch { restored.push({ role: "agent", steps: [], final: { summary: m.content, result: {}, citations: [], stepsTaken: 0, stoppedReason: "finished" }, running: false }); }
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
    if (!task || isRunning || disabled || !userId) return;
    setMessages((prev) => [...prev, { role: "user", text: task }, { role: "agent", steps: [], final: null, running: true }]);
    setText(""); setIsRunning(true); scrollToBottom(); closeStream();

    const url = new URL(`${backendBase}/agent/run`);
    url.searchParams.set("task", task);
    url.searchParams.set("maxSteps", "10");
    url.searchParams.set("userId", userId);
    if (conversationId) url.searchParams.set("conversationId", conversationId);

    const es = new EventSource(url.toString());
    esRef.current = es;

    es.addEventListener("step", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(String(ev.data)) as StepEvent;
        setMessages((prev) => { const c = [...prev]; const l = c[c.length - 1]; if (l && l.role === "agent") l.steps = [...l.steps, data]; return c; });
        scrollToBottom();
      } catch { }
    });

    es.addEventListener("saved", (ev: MessageEvent) => {
      try { const d = JSON.parse(String(ev.data)); if (d.conversationId) onConversationId(d.conversationId); } catch { }
    });

    es.addEventListener("final", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(String(ev.data)) as FinalEvent;
        setMessages((prev) => { const c = [...prev]; const l = c[c.length - 1]; if (l && l.role === "agent") { l.final = data; l.running = false; } return c; });
        scrollToBottom();
      } catch { }
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
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <h3 className="text-3xl md:text-4xl font-bold text-text text-center leading-tight">
            AI That Connects Your<br />
            <span className="italic text-primary">Knowledge</span> into <span className="italic">Clarity.</span>
          </h3>
          <p className="text-sm text-text-muted max-w-lg text-center">
            Libra AI connects all your tools, understands your data, and gets things done for you. Powered by Gemini AI.
          </p>
        </div>
      ) : (
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
      )}

      <div className="px-4 md:px-7 py-4 border-t border-border bg-white">
        <form className="flex gap-2.5 max-w-3xl mx-auto" onSubmit={onSubmit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask something..."
            disabled={isRunning}
            className="flex-1 px-4 py-3 rounded-xl border border-border bg-white text-text text-sm font-sans outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary-glow placeholder:text-text-muted"
          />
          <button type="submit" disabled={!text.trim() || isRunning || disabled} className="px-6 py-3 rounded-xl text-sm font-semibold btn-gradient text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            {isRunning ? "Working..." : "Generate"}
          </button>
        </form>
      </div>
    </>
  );
}