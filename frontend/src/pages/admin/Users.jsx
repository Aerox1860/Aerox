import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Ban, Check, Plus, Minus } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");

  const load = () => api.get(`/admin/users${q ? `?search=${encodeURIComponent(q)}` : ""}`).then(({ data }) => setUsers(data));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const doSearch = (e) => { e.preventDefault(); load(); };

  const block = async (u, block) => {
    try { await api.post("/admin/users/block", { user_id: u.id, block }); toast.success(block ? "Blocked" : "Unblocked"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const adjust = async () => {
    if (!selected || !delta) return;
    try {
      await api.post("/admin/users/adjust", { user_id: selected.id, delta: Number(delta), note });
      toast.success("Balance updated");
      setSelected(null); setDelta(""); setNote(""); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-5" data-testid="admin-users">
      <h1 className="font-heading text-3xl font-black">Users</h1>

      <form onSubmit={doSearch} className="card-surface p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-500 ml-2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or name"
          className="flex-1 bg-transparent outline-none py-2 text-sm" data-testid="user-search-input" />
        <button type="submit" className="btn-ghost px-4 py-2 rounded-lg text-sm">Search</button>
      </form>

      <div className="card-surface overflow-hidden">
        <div className="grid grid-cols-[1fr,140px,120px,140px] gap-3 px-4 py-3 text-[11px] uppercase tracking-widest text-slate-400 border-b border-white/5">
          <div>User</div><div>Balance</div><div>Status</div><div>Actions</div>
        </div>
        <div className="divide-y divide-white/5" data-testid="users-table">
          {users.map((u) => (
            <div key={u.id} className="grid grid-cols-[1fr,140px,120px,140px] gap-3 items-center px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{u.name} {u.role === "admin" && <span className="chip !text-cyan-300 !border-cyan-500/40 ml-2">admin</span>}</div>
                <div className="text-xs text-slate-500">{u.email}</div>
              </div>
              <div className="font-mono">₹ {Number(u.balance || 0).toFixed(2)}</div>
              <div>{u.is_blocked ? <span className="chip !text-red-300 !border-red-500/40">blocked</span> : <span className="chip !text-green-300 !border-green-500/40">active</span>}</div>
              <div className="flex gap-2">
                <button onClick={() => setSelected(u)} className="btn-ghost px-2 py-1 rounded text-xs" data-testid={`adjust-btn-${u.id}`}>Adjust</button>
                {u.role !== "admin" && (
                  u.is_blocked ?
                    <button onClick={() => block(u, false)} className="btn-ghost px-2 py-1 rounded text-xs flex items-center gap-1"><Check className="w-3 h-3" /> Unblock</button>
                    : <button onClick={() => block(u, true)} className="btn-danger px-2 py-1 rounded text-xs flex items-center gap-1"><Ban className="w-3 h-3" /> Block</button>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && <div className="p-6 text-sm text-slate-500">No users.</div>}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="card-surface p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="font-heading font-bold text-lg">Adjust balance</div>
            <div className="text-sm text-slate-400 mt-1">{selected.name} • {selected.email}</div>
            <div className="mt-4">
              <label className="text-[11px] uppercase tracking-widest text-slate-400">Amount (+ credit / - debit)</label>
              <div className="flex gap-2 mt-1">
                <button className="btn-ghost px-2 py-1 rounded" onClick={() => setDelta((d) => "-" + Math.abs(Number(d || 0)))}><Minus className="w-3 h-3" /></button>
                <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)}
                  className="flex-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2 font-mono outline-none focus:border-cyan-500"
                  data-testid="adjust-delta-input" />
                <button className="btn-ghost px-2 py-1 rounded" onClick={() => setDelta((d) => Math.abs(Number(d || 0)).toString())}><Plus className="w-3 h-3" /></button>
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[11px] uppercase tracking-widest text-slate-400">Note</label>
              <input value={note} onChange={(e) => setNote(e.target.value)}
                className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-cyan-500 text-sm" />
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button className="btn-ghost px-4 py-2 rounded-lg text-sm" onClick={() => setSelected(null)}>Cancel</button>
              <button className="btn-primary px-4 py-2 rounded-lg text-sm" onClick={adjust} data-testid="adjust-confirm-btn">Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
