import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X, Plus, AlertTriangle, Zap } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

const tabs = ["pending", "approved", "rejected", "attempts"];

export default function AdminDeposits() {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [showManual, setShowManual] = useState(false);

  const load = async () => {
    if (tab === "attempts") {
      const { data } = await api.get("/admin/deposit-attempts");
      setAttempts(data);
      setRows([]);
    } else {
      const { data } = await api.get(`/admin/deposits?status_filter=${tab}`);
      setRows(data);
    }
  };
  useEffect(() => { load(); }, [tab]); // eslint-disable-line

  const act = async (id, action) => {
    try { await api.post(`/admin/deposits/${id}/${action}`); toast.success(action === "approve" ? "Approved & credited" : "Rejected"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-5" data-testid="admin-deposits">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-3xl font-black">Deposits</h1>
        <button onClick={() => setShowManual(true)} className="btn-cyan px-4 py-2 rounded-xl flex items-center gap-2 text-sm" data-testid="manual-credit-btn">
          <Zap className="w-4 h-4" /> Manual credit
        </button>
      </div>

      <div className="card-surface p-2 inline-flex gap-1 flex-wrap">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm capitalize flex items-center gap-1 ${tab === t ? "bg-[#1A2235] text-cyan-300" : "text-slate-400 hover:text-slate-100"}`}
            data-testid={`deposits-tab-${t}`}>
            {t === "attempts" && <AlertTriangle className="w-3.5 h-3.5" />}
            {t === "attempts" ? "Duplicate attempts" : t}
          </button>
        ))}
      </div>

      {tab !== "attempts" ? (
        <div className="card-surface overflow-hidden">
          <div className="grid grid-cols-[1fr,120px,180px,140px,140px] gap-3 px-4 py-3 text-[11px] uppercase tracking-widest text-slate-400 border-b border-white/5">
            <div>User</div><div>Amount</div><div>UTR / UPI</div><div>Requested</div><div>Actions</div>
          </div>
          <div className="divide-y divide-white/5" data-testid="deposits-table">
            {rows.length === 0 && <div className="p-6 text-sm text-slate-500">No {tab} deposits.</div>}
            {rows.map((d) => (
              <div key={d.id} className="grid grid-cols-[1fr,120px,180px,140px,140px] gap-3 items-center px-4 py-3 text-sm">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {d.user_name}
                    {d.manual && <span className="chip !border-cyan-500/40 !text-cyan-300">manual</span>}
                  </div>
                  <div className="text-xs text-slate-500">{d.user_email}</div>
                </div>
                <div className="font-mono font-bold">₹ {d.amount}</div>
                <div className="text-xs">
                  <div className="font-mono">{d.utr}</div>
                  <div className="text-slate-500">{d.upi_id}</div>
                </div>
                <div className="text-xs text-slate-400">{new Date(d.created_at).toLocaleString()}</div>
                <div className="flex gap-2">
                  {d.status === "pending" ? (
                    <>
                      <button onClick={() => act(d.id, "approve")} className="btn-primary px-3 py-1.5 rounded text-xs flex items-center gap-1" data-testid={`approve-dep-${d.id}`}><Check className="w-3 h-3" /> Approve</button>
                      <button onClick={() => act(d.id, "reject")} className="btn-danger px-3 py-1.5 rounded text-xs flex items-center gap-1" data-testid={`reject-dep-${d.id}`}><X className="w-3 h-3" /> Reject</button>
                    </>
                  ) : (
                    <span className={`chip ${d.status === "approved" ? "!border-green-500/40 !text-green-300" : "!border-red-500/40 !text-red-300"}`}>{d.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <AttemptsTable attempts={attempts} />
      )}

      {showManual && <ManualCreditModal onClose={() => setShowManual(false)} onDone={() => { setShowManual(false); load(); }} />}
    </div>
  );
}

function AttemptsTable({ attempts }) {
  return (
    <div className="card-surface overflow-hidden" data-testid="attempts-table">
      <div className="px-4 py-3 border-b border-white/5">
        <div className="text-sm text-slate-300">Users trying to submit UTRs that are already claimed. Watch for repeated attempts by the same account — may indicate fraud or a network-issue retry.</div>
      </div>
      <div className="grid grid-cols-[1fr,140px,1fr,140px] gap-3 px-4 py-3 text-[11px] uppercase tracking-widest text-slate-400 border-b border-white/5">
        <div>Attempting user</div><div>UTR</div><div>Originally submitted by</div><div>When</div>
      </div>
      <div className="divide-y divide-white/5">
        {attempts.length === 0 && <div className="p-6 text-sm text-slate-500">No duplicate UTR attempts recorded.</div>}
        {attempts.map((a) => (
          <div key={a.id} className="grid grid-cols-[1fr,140px,1fr,140px] gap-3 items-center px-4 py-3 text-sm">
            <div>
              <div className="font-medium">{a.user_name}</div>
              <div className="text-xs text-slate-500">{a.user_email} • tried ₹{a.amount}</div>
            </div>
            <div className="font-mono text-xs">{a.utr}</div>
            <div>
              <div className={`font-medium ${a.same_user ? "text-cyan-300" : "text-orange-300"}`}>
                {a.original_user_name} {a.same_user && <span className="chip !border-cyan-500/40 !text-cyan-300 ml-1">same user</span>}
              </div>
              <div className="text-xs text-slate-500">{a.original_user_email} • status: {a.original_status}</div>
            </div>
            <div className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManualCreditModal({ onClose, onDone }) {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !amount) return toast.error("Email and amount required");
    setBusy(true);
    try {
      await api.post("/admin/deposits/manual", { user_email: email.trim().toLowerCase(), amount: Number(amount), note });
      toast.success(`Credited ₹${amount} to ${email}`);
      onDone();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} className="card-surface p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()} data-testid="manual-credit-modal">
        <div>
          <div className="font-heading font-bold text-lg flex items-center gap-2"><Zap className="w-5 h-5 text-cyan-300" /> Manual credit</div>
          <div className="text-sm text-slate-400 mt-1">Instantly credit a user's wallet — use when a user paid but couldn't submit the UTR due to a network issue.</div>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-widest text-slate-400">User email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500"
            placeholder="user@example.com" data-testid="manual-email-input" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-widest text-slate-400">Amount (₹)</label>
          <input type="number" step="0.01" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required
            className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500 font-mono"
            data-testid="manual-amount-input" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-widest text-slate-400">Note (visible in user's transactions)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500 text-sm"
            placeholder="e.g. network retry - UTR 123456789012"
            data-testid="manual-note-input" />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" className="btn-ghost px-4 py-2 rounded-lg text-sm" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-1" data-testid="manual-submit-btn">
            <Plus className="w-3 h-3" /> {busy ? "Crediting..." : "Credit wallet"}
          </button>
        </div>
      </form>
    </div>
  );
}
