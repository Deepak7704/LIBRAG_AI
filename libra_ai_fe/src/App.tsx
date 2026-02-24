import "./index.css";
import { useEffect, useRef, useState } from "react";

type Citation = {
  id: string;
  sourceType: "web" | "drive";
  title?: string;
  url?: string;
  snippet?: string;
};

type FinalEvent = {
  summary: string;
  result: any;
  citations: Citation[];
  stepsTaken: number;
  stoppedReason: "finished" | "stopped" | "step_limit" | "error";
};

function pickAnswer(final: FinalEvent | null) {
  if (!final) return "";
  if (typeof final.result?.explanation === "string") return final.result.explanation;
  if (typeof final.summary === "string") return final.summary;
  if (typeof final.result === "string") return final.result;
  return "";
}

export function App() {
  const [text, setText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [final, setFinal] = useState<FinalEvent | null>(null);
  const [error, setError] = useState("");

  const esRef = useRef<EventSource | null>(null);

  function closeStream() {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }

  useEffect(() => () => closeStream(), []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const task = text.trim();
    if (!task || isRunning) return;

    setIsRunning(true);
    setFinal(null);
    setError("");
    setStatusText("Thinking...");

    closeStream();

    const url = new URL("http://localhost:3000/agent/run");
    url.searchParams.set("task", task);
    url.searchParams.set("maxSteps", "6");

    const es = new EventSource(url.toString());
    esRef.current = es;

    es.addEventListener("step", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(String(ev.data)) as { type: string; tool?: string };

        if (data.type === "thinking") setStatusText("Thinking...");
        if (data.type === "tool_call") {
          if (data.tool === "web_search") setStatusText("Searching the web...");
          else if (data.tool === "web_scrape") setStatusText("Reading sources...");
          else setStatusText("Running tool...");
        }
        if (data.type === "tool_result") setStatusText("Thinking...");
      } catch {}
    });

    es.addEventListener("final", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(String(ev.data)) as FinalEvent;
        setFinal(data);
        setStatusText(data.stoppedReason === "error" ? "Error" : "Finished");
      } catch {
        setError("Failed to parse final response");
        setStatusText("Error");
      }
      closeStream();
      setIsRunning(false);
      setText("");
    });

    es.onerror = () => {
      closeStream();
      setIsRunning(false);
      setError("SSE connection failed");
      setStatusText("Error");
    };
  }

  const answerText = pickAnswer(final);

  return (
    <main className="page">
      <form className="composer" onSubmit={onSubmit}>
        <input
          className="composerInput"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a task..."
          aria-label="Task"
        />
        <button className="composerButton" type="submit" disabled={!text.trim() || isRunning}>
          {isRunning ? "Working..." : "Run"}
        </button>
      </form>

      {statusText ? <div className="response">Status: {statusText}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {final ? (
        <div className="response" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Answer</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{answerText}</div>

          {final.citations?.length ? (
            <>
              <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 8 }}>Sources</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {final.citations.map((c) => (
                  <li key={c.id}>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer">
                        {c.title ?? c.url}
                      </a>
                    ) : (
                      <span>{c.title ?? c.id}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

export default App;