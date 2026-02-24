type HistoryEntry = { id: string; title: string; createdAt: string };

export function ConversationHistory(props: {
    history: HistoryEntry[];
    onSelect: (id: string) => void;
    onNewChat: () => void;
}) {
    const { history, onSelect, onNewChat } = props;

    return (
        <div className="border border-border rounded-xl p-4 bg-white">
            <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">History</div>
                <button onClick={onNewChat} className="text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors">+ New</button>
            </div>
            {!history.length && <div className="text-[11px] text-text-muted">No conversations yet.</div>}
            <div className="flex flex-col gap-0.5 max-h-44 overflow-y-auto">
                {history.map((h) => (
                    <button key={h.id} onClick={() => onSelect(h.id)} className="text-left px-2.5 py-2 rounded-lg hover:bg-card transition-colors group">
                        <div className="text-[12px] font-medium text-text-secondary group-hover:text-text truncate">{h.title}</div>
                        <div className="text-[10px] text-text-muted">{new Date(h.createdAt).toLocaleDateString()}</div>
                    </button>
                ))}
            </div>
        </div>
    );
}
