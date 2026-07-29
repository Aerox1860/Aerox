import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Ban, Check, Plus, Minus, KeyRound, Copy, X as XIcon, RefreshCw } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [adjustFor, setAdjustFor] = useState(null);
  const [pwFor, setPwFor] = useState(null);       // user for whom to reset password
  const [tempReveal, setTempReveal] = useState(null); // { user_email, temp_password, expires_at }
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
    if (!adjustFor || !delta) return;
    try {
      await api.post("/admin/users/adjust", { user_id: adjustFor.id, delta: Number(delta), note });
      toast.success("Balance updated");
      setAdjustFor(null); setDelta(""); setNote(""); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const generateTemp = async (u) => {
    try {
      const { data } = await api.post("/admin/users/temp-password", { user_id: u.id });
      setTempReveal(data);
      setPwFor(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const copyTemp = (text) => {
    navigator.clipboard?.writeText(text);
    toast.success("Copied to clipboard");
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
        <div className="grid grid-cols-[1fr,140px,140px,220px] gap-3 px-4 py-3 text-[11px] uppercase tracking-widest text-slate-400 border-b border-white/5">
          <div>User</div><div>Balance</div><div>Status</div><div>Actions</div>
        </div>
        <div className="divide-y divide-white/5" data-testid="users-table">
          {users.map((u) => (
            <div key={u.id} className="grid grid-cols-[1fr,140px,140px,220px] gap-3 items-center px-4 py-3 text-sm">
              <div>
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {u.name}
                  {u.role === "admin" && <span className="chip !text-cyan-300 !border-cyan-500/40">admin</span>}
                  {(u.has_temp_password || u.must_change_password) && <span className="chip !text-yellow-300 !border-yellow-500/40">temp pw</span>}
                  {u.policy_agreed && (
                    <span className="chip !text-green-300 !border-green-500/40" title={u.policy_agreed_at ? `Agreed on ${new Date(u.policy_agreed_at).toLocaleString()}` : "Policy agreed"}>
                      policy ✓
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{u.email}</div>
                {u.policy_agreed_at && (
                  <div className="text-[10px] text-slate-600 mt-0.5">Agreed {new Date(u.policy_agreed_at).toLocaleDateString()}</div>
                )}
              </div>
              <div className="font-mono">₹ {Number(u.balance || 0).toFixed(2)}</div>
              <div>{u.is_blocked ? <span className="chip !text-red-300 !border-red-500/40">blocked</span> : <span className="chip !text-green-300 !border-green-500/40">active</span>}</div>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setAdjustFor(u)} className="btn-ghost px-2 py-1 rounded text-xs" data-testid={`adjust-btn-${u.id}`}>Adjust</button>
                {u.role !== "admin" && (
                  <button onClick={() => setPwFor(u)} className="btn-ghost px-2 py-1 rounded text-xs flex items-center gap-1" data-testid={`temp-pw-btn-${u.id}`}>
                    <KeyRound className="w-3 h-3" /> {u.has_temp_password || u.must_change_password ? "New temp" : "Reset pw"}
                  </button>
                )}
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

      {adjustFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setAdjustFor(null)}>
          <div className="card-surface p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="font-heading font-bold text-lg">Adjust balance</div>
            <div className="text-sm text-slate-400 mt-1">{adjustFor.name} • {adjustFor.email}</div>
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
              <button className="btn-ghost px-4 py-2 rounded-lg text-sm" onClick={() => setAdjustFor(null)}>Cancel</button>
              <button className="btn-primary px-4 py-2 rounded-lg text-sm" onClick={adjust} data-testid="adjust-confirm-btn">Apply</button>
            </div>
          </div>
        </div>
      )}

      {pwFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setPwFor(null)}>
          <div className="card-surface p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()} data-testid="temp-pw-confirm-modal">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-5 h-5 text-cyan-300" />
              <div className="font-heading font-bold text-lg">Generate temporary password</div>
            </div>
            <div className="text-sm text-slate-400">
              This creates a one-time temporary password for <span className="text-slate-200">{pwFor.name}</span> ({pwFor.email}).
              Share it with the user privately — they'll be forced to set a new password on their next login. Any existing password stays valid until they use the temp password.
            </div>
            <div className="mt-3 chip !border-yellow-500/40 !text-yellow-300 !py-1.5">
              Temp password expires in 48 hours.
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button className="btn-ghost px-4 py-2 rounded-lg text-sm" onClick={() => setPwFor(null)}>Cancel</button>
              <button className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-1" onClick={() => generateTemp(pwFor)} data-testid="temp-pw-generate-btn">
                <RefreshCw className="w-3 h-3" /> Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {tempReveal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" data-testid="temp-pw-reveal-modal">
          <div className="card-surface p-6 w-full max-w-md relative">
            <button onClick={() => setTempReveal(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-100" data-testid="temp-pw-close-btn"><XIcon className="w-4 h-4" /></button>
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-5 h-5 text-green-400" />
              <div className="font-heading font-bold text-lg">Temporary password generated</div>
            </div>
            <div className="text-sm text-slate-400">Share this with <span className="text-slate-200">{tempReveal.user_email}</span> privately. This is the ONLY time it will be shown.</div>

            <div className="mt-4 card-raised p-4 flex items-center justify-between">
              <div className="font-mono text-2xl font-black neon-green tracking-wider" data-testid="temp-pw-value">{tempReveal.temp_password}</div>
              <button onClick={() => copyTemp(tempReveal.temp_password)} className="btn-cyan px-3 py-2 rounded-lg flex items-center gap-1 text-sm" data-testid="temp-pw-copy-btn">
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Expires: {new Date(tempReveal.expires_at).toLocaleString()}
            </div>
            <div className="mt-4 text-xs text-slate-400 space-y-1">
              <div>• User can still log in with their old password until they use this temp one.</div>
              <div>• When they use this temp password, they'll be forced to set a new password immediately.</div>
              <div>• Generate a fresh one anytime if they forget again.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
