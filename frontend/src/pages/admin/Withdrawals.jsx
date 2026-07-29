import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

const tabs = ["pending", "paid", "rejected"];

export default function AdminWithdrawals() {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);

  const load = () => api.get(`/admin/withdrawals?status_filter=${tab}`).then(({ data }) => setRows(data));
  useEffect(() => { load(); }, [tab]); // eslint-disable-line

  const act = async (id, action) => {
    try { await api.post(`/admin/withdrawals/${id}/${action}`); toast.success(action === "approve" ? "Marked as paid" : "Rejected & refunded"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-5" data-testid="admin-withdrawals">
      <h1 className="font-heading text-3xl font-black">Withdrawals</h1>

      <div className="card-surface p-2 inline-flex gap-1">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm capitalize ${tab === t ? "bg-[#1A2235] text-cyan-300" : "text-slate-400 hover:text-slate-100"}`} data-testid={`withdrawals-tab-${t}`}>{t}</button>
        ))}
      </div>

      <div className="card-surface overflow-hidden">
        <div className="grid grid-cols-[1fr,120px,1fr,140px,180px] gap-3 px-4 py-3 text-[11px] uppercase tracking-widest text-slate-400 border-b border-white/5">
          <div>User</div><div>Amount</div><div>Payout details</div><div>Requested</div><div>Actions</div>
        </div>
        <div className="divide-y divide-white/5" data-testid="withdrawals-table">
          {rows.length === 0 && <div className="p-6 text-sm text-slate-500">No {tab} withdrawals.</div>}
          {rows.map((w) => (
            <div key={w.id} className="grid grid-cols-[1fr,120px,1fr,140px,180px] gap-3 items-center px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{w.user_name}</div>
                <div className="text-xs text-slate-500">{w.user_email}</div>
              </div>
              <div className="font-mono font-bold">₹ {w.amount}</div>
              <div className="text-xs">
                {w.method === "upi" ? (
                  <div className="font-mono">UPI: {w.upi_id}</div>
                ) : (
                  <>
                    <div className="font-mono">A/c: {w.account_number}</div>
                    <div className="text-slate-500">{w.holder_name} • {w.bank_name} • {w.ifsc}</div>
                  </>
                )}
              </div>
              <div className="text-xs text-slate-400">{new Date(w.created_at).toLocaleString()}</div>
              <div className="flex gap-2">
                {w.status === "pending" ? (
                  <>
                    <button onClick={() => act(w.id, "approve")} className="btn-primary px-3 py-1.5 rounded text-xs flex items-center gap-1" data-testid={`approve-w-${w.id}`}><Check className="w-3 h-3" /> Mark paid</button>
                    <button onClick={() => act(w.id, "reject")} className="btn-danger px-3 py-1.5 rounded text-xs flex items-center gap-1" data-testid={`reject-w-${w.id}`}><X className="w-3 h-3" /> Reject</button>
                  </>
                ) : (
                  <span className={`chip ${w.status === "paid" ? "!border-green-500/40 !text-green-300" : "!border-red-500/40 !text-red-300"}`}>{w.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
