import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X, Clock } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

const tabs = ["pending", "approved", "rejected"];

export default function AdminDeposits() {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);

  const load = () => api.get(`/admin/deposits?status_filter=${tab}`).then(({ data }) => setRows(data));
  useEffect(load, [tab]); // eslint-disable-line

  const act = async (id, action) => {
    try { await api.post(`/admin/deposits/${id}/${action}`); toast.success(action === "approve" ? "Approved & credited" : "Rejected"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-5" data-testid="admin-deposits">
      <h1 className="font-heading text-3xl font-black">Deposits</h1>

      <div className="card-surface p-2 inline-flex gap-1">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm capitalize ${tab === t ? "bg-[#1A2235] text-cyan-300" : "text-slate-400 hover:text-slate-100"}`} data-testid={`deposits-tab-${t}`}>{t}</button>
        ))}
      </div>

      <div className="card-surface overflow-hidden">
        <div className="grid grid-cols-[1fr,120px,180px,140px,140px] gap-3 px-4 py-3 text-[11px] uppercase tracking-widest text-slate-400 border-b border-white/5">
          <div>User</div><div>Amount</div><div>UTR / UPI</div><div>Requested</div><div>Actions</div>
        </div>
        <div className="divide-y divide-white/5" data-testid="deposits-table">
          {rows.length === 0 && <div className="p-6 text-sm text-slate-500">No {tab} deposits.</div>}
          {rows.map((d) => (
            <div key={d.id} className="grid grid-cols-[1fr,120px,180px,140px,140px] gap-3 items-center px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{d.user_name}</div>
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
    </div>
  );
}
