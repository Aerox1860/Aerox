import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, CheckCircle2, XCircle, Clock, Loader2, Image as ImageIcon, Send, RefreshCw } from "lucide-react";
import { api, formatApiError, BACKEND_URL } from "@/lib/api";

const tabs = ["open", "in_progress", "resolved", "rejected"];
const statusStyle = {
  open: "border-yellow-500/40 text-yellow-300",
  in_progress: "border-cyan-500/40 text-cyan-300",
  resolved: "border-green-500/40 text-green-300",
  rejected: "border-red-500/40 text-red-300",
};
const statusIcon = { open: Clock, in_progress: Loader2, resolved: CheckCircle2, rejected: XCircle };

export default function AdminSupport() {
  const [tab, setTab] = useState("open");
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");
  const [newStatus, setNewStatus] = useState("resolved");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get(`/admin/support/tickets?status_filter=${tab}`);
      setRows(data);
    } catch {} finally { setRefreshing(false); }
  };
  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const t = setInterval(load, 12000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(t); };
  }, [tab]); // eslint-disable-line

  const openTicket = (t) => {
    setSelected(t);
    setReply(t.admin_reply || "");
    setNewStatus(t.status === "open" || t.status === "in_progress" ? "resolved" : t.status);
  };

  const save = async () => {
    try {
      await api.patch(`/admin/support/tickets/${selected.id}`, { status: newStatus, admin_reply: reply });
      toast.success("Ticket updated");
      setSelected(null); setReply("");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const token = localStorage.getItem("aerox_token");

  return (
    <div className="space-y-5" data-testid="admin-support">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-heading text-3xl font-black flex items-center gap-2"><LifeBuoy className="w-6 h-6 text-cyan-300" /> Support tickets <span className="text-sm text-slate-400 font-normal">({rows.length})</span></h1>
        <button onClick={load} disabled={refreshing} className="btn-ghost px-3 py-2 rounded-lg text-xs flex items-center gap-1" data-testid="refresh-tickets-btn">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="card-surface p-2 inline-flex gap-1 flex-wrap">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm capitalize ${tab === t ? "bg-[#1A2235] text-cyan-300" : "text-slate-400 hover:text-slate-100"}`}
            data-testid={`support-tab-${t}`}>
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="card-surface overflow-hidden">
        <div className="grid grid-cols-[1fr,180px,120px,160px] gap-3 px-4 py-3 text-[11px] uppercase tracking-widest text-slate-400 border-b border-white/5">
          <div>Ticket</div><div>User</div><div>Amount</div><div>Submitted</div>
        </div>
        <div className="divide-y divide-white/5" data-testid="tickets-table">
          {rows.length === 0 && <div className="p-6 text-sm text-slate-500">No {tab.replace("_", " ")} tickets.</div>}
          {rows.map((t) => (
            <button key={t.id} onClick={() => openTicket(t)}
              className="w-full text-left grid grid-cols-[1fr,180px,120px,160px] gap-3 items-center px-4 py-3 text-sm hover:bg-white/[0.02] transition-colors"
              data-testid={`ticket-row-${t.id}`}>
              <div className="min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {t.subject}
                  {t.screenshot_id && <ImageIcon className="w-3.5 h-3.5 text-cyan-300 flex-shrink-0" />}
                </div>
                <div className="text-xs text-slate-500 truncate">{t.message}</div>
              </div>
              <div>
                <div className="text-sm">{t.user_name}</div>
                <div className="text-xs text-slate-500 truncate">{t.user_email}</div>
              </div>
              <div className="font-mono">{t.amount != null ? `₹ ${t.amount}` : "-"}</div>
              <div className="text-xs text-slate-400">{new Date(t.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="card-surface p-5 w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()} data-testid="ticket-detail-modal">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-heading font-bold text-xl">{selected.subject}</div>
                <div className="text-sm text-slate-400 mt-0.5">{selected.user_name} • {selected.user_email}</div>
                <div className="text-xs text-slate-500 mt-0.5">{new Date(selected.created_at).toLocaleString()} {selected.amount != null && <>• ₹{selected.amount}</>}</div>
              </div>
              {(() => {
                const Icon = statusIcon[selected.status] || Clock;
                return <div className={`chip ${statusStyle[selected.status]}`}><Icon className="w-3 h-3" /> {selected.status.replace("_", " ")}</div>;
              })()}
            </div>

            <div className="mt-4 card-raised p-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-400">Message</div>
              <div className="text-sm mt-1 whitespace-pre-wrap break-words">{selected.message}</div>
            </div>

            {selected.screenshot_id && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Screenshot</div>
                <a href={`${BACKEND_URL}/api/support/files/${selected.screenshot_id}?auth=${token}`} target="_blank" rel="noreferrer">
                  <img src={`${BACKEND_URL}/api/support/files/${selected.screenshot_id}?auth=${token}`}
                    alt="screenshot" className="max-h-96 rounded-lg border border-white/10" data-testid="ticket-screenshot" />
                </a>
              </div>
            )}

            <div className="mt-4">
              <label className="text-[11px] uppercase tracking-widest text-slate-400">Reply (visible to user)</label>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3}
                className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-cyan-500"
                placeholder="Explain what you did / next steps..."
                data-testid="ticket-reply-input" />
            </div>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <div className="text-[11px] uppercase tracking-widest text-slate-400">Set status:</div>
              {tabs.map((s) => (
                <button key={s} onClick={() => setNewStatus(s)}
                  className={`chip capitalize ${newStatus === s ? "!border-cyan-500/60 !text-cyan-300 !bg-cyan-500/10" : ""}`}
                  data-testid={`set-status-${s}`}>
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost px-4 py-2 rounded-lg text-sm" onClick={() => setSelected(null)}>Close</button>
              <button className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-1" onClick={save} data-testid="ticket-save-btn">
                <Send className="w-3 h-3" /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
