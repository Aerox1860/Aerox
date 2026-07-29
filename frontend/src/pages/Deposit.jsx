import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, CheckCircle2, Clock, XCircle } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

const statusStyle = {
  pending: "border-yellow-500/40 text-yellow-300",
  approved: "border-green-500/40 text-green-300",
  rejected: "border-red-500/40 text-red-300",
};
const statusIcon = { pending: Clock, approved: CheckCircle2, rejected: XCircle };

export default function Deposit() {
  const [upis, setUpis] = useState([]);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);

  const loadAll = () => {
    api.get("/upi").then(({ data }) => { setUpis(data); if (!selected && data[0]) setSelected(data[0]); }).catch(() => {});
    api.get("/deposits/mine").then(({ data }) => setHistory(data)).catch(() => {});
  };
  useEffect(loadAll, []); // eslint-disable-line

  const submit = async (e) => {
    e.preventDefault();
    if (!selected) return toast.error("Select a UPI");
    if (!amount || Number(amount) < 100) return toast.error("Minimum deposit ₹100");
    if (!utr || utr.length < 6) return toast.error("Enter valid UTR");
    setSubmitting(true);
    try {
      await api.post("/deposits", {
        amount: Number(amount),
        utr: utr.trim().toUpperCase(),
        upi_id: selected.upi_id,
      });
      toast.success("Deposit request submitted. Awaiting approval.");
      setAmount(""); setUtr("");
      loadAll();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    toast.success("Copied");
  };

  return (
    <div className="space-y-5" data-testid="deposit-page">
      <div>
        <h1 className="font-heading text-2xl md:text-3xl font-black">Deposit funds</h1>
        <p className="text-slate-400 text-sm mt-1">Pay via UPI, then submit your unique UTR (Transaction Reference). Admin verifies UTR and credits your wallet.</p>
      </div>

      <div className="card-surface p-5">
        <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-3">Choose an admin UPI</div>
        {upis.length === 0 && <div className="text-sm text-slate-500">No UPI configured yet. Contact support.</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          {upis.map((u) => (
            <button key={u.id} onClick={() => setSelected(u)}
              className={`text-left p-4 rounded-xl border transition-colors ${selected?.id === u.id ? "border-cyan-500/70 bg-cyan-500/5" : "border-white/10 bg-[#06090F] hover:border-white/20"}`}
              data-testid={`upi-option-${u.id}`}>
              <div className="flex items-center justify-between">
                <div className="font-semibold">{u.label}</div>
                {selected?.id === u.id && <span className="chip !border-cyan-500/40 !text-cyan-300">selected</span>}
              </div>
              <div className="mt-1 font-mono text-cyan-300 text-sm">{u.upi_id}</div>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={(e) => { e.stopPropagation(); copy(u.upi_id); }} className="btn-ghost px-2 py-1 rounded text-xs flex items-center gap-1">
                  <Copy className="w-3 h-3" /> Copy UPI
                </button>
                {u.qr_url && <a href={u.qr_url} target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1 rounded text-xs">View QR</a>}
              </div>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="card-surface p-5 space-y-4" data-testid="deposit-form">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">Amount (₹)</label>
            <input type="number" min={100} step={10} value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none font-mono focus:border-cyan-500"
              placeholder="100" data-testid="deposit-amount-input" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">UTR / Reference No</label>
            <input value={utr} onChange={(e) => setUtr(e.target.value.toUpperCase())}
              className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none font-mono focus:border-cyan-500"
              placeholder="12-digit UPI txn ID" data-testid="deposit-utr-input" />
            <div className="text-[11px] text-slate-500 mt-1">Must be unique. Duplicate UTRs are auto-rejected.</div>
          </div>
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full py-3 rounded-xl" data-testid="deposit-submit-btn">
          {submitting ? "Submitting..." : "Submit deposit request"}
        </button>
      </form>

      <div className="card-surface p-5">
        <h2 className="font-heading font-bold mb-3">Your deposit requests</h2>
        <div className="divide-y divide-white/5" data-testid="deposit-history-list">
          {history.length === 0 && <div className="text-sm text-slate-500 py-2">No deposit requests yet</div>}
          {history.map((d) => {
            const Icon = statusIcon[d.status];
            return (
              <div key={d.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-mono">₹{d.amount}</div>
                  <div className="text-xs text-slate-500 font-mono">UTR: {d.utr}</div>
                </div>
                <div className={`chip ${statusStyle[d.status]}`}>
                  <Icon className="w-3 h-3" /> {d.status}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
