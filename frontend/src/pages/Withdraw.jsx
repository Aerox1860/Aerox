import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, CheckCircle2, XCircle, IndianRupee } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const statusStyle = {
  pending: "border-yellow-500/40 text-yellow-300",
  paid: "border-green-500/40 text-green-300",
  rejected: "border-red-500/40 text-red-300",
};
const statusIcon = { pending: Clock, paid: CheckCircle2, rejected: XCircle };

export default function Withdraw() {
  const { user, refresh } = useAuth();
  const [method, setMethod] = useState("upi");
  const [amount, setAmount] = useState("");
  const [upiId, setUpiId] = useState("");
  const [bankName, setBankName] = useState("");
  const [accNo, setAccNo] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [holder, setHolder] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);

  const load = () => api.get("/withdrawals/mine").then(({ data }) => setHistory(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) < 100) return toast.error("Minimum withdrawal ₹100");
    if (Number(amount) > user.balance) return toast.error("Insufficient balance");
    setSubmitting(true);
    try {
      const body = { amount: Number(amount), method };
      if (method === "upi") body.upi_id = upiId;
      else { body.bank_name = bankName; body.account_number = accNo; body.ifsc = ifsc.toUpperCase(); body.holder_name = holder; }
      await api.post("/withdrawals", body);
      toast.success("Withdrawal requested. Amount held pending admin approval.");
      setAmount(""); setUpiId(""); setBankName(""); setAccNo(""); setIfsc(""); setHolder("");
      load(); refresh();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5" data-testid="withdraw-page">
      <div>
        <h1 className="font-heading text-2xl md:text-3xl font-black">Withdraw funds</h1>
        <p className="text-slate-400 text-sm mt-1">Requested amount is held from your balance and paid manually by admin.</p>
      </div>

      <div className="card-surface p-6 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400">Available</div>
          <div className="font-mono font-bold text-3xl neon-cyan mt-1">₹ {user?.balance?.toFixed(2)}</div>
        </div>
        <IndianRupee className="w-10 h-10 text-cyan-300 opacity-60" />
      </div>

      <form onSubmit={submit} className="card-surface p-5 space-y-4" data-testid="withdraw-form">
        <div>
          <label className="text-[11px] uppercase tracking-widest text-slate-400">Method</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMethod("upi")} className={`py-2 rounded-lg border ${method === "upi" ? "border-cyan-500/70 bg-cyan-500/5 text-cyan-300" : "border-white/10 text-slate-300"}`} data-testid="withdraw-method-upi">UPI</button>
            <button type="button" onClick={() => setMethod("bank")} className={`py-2 rounded-lg border ${method === "bank" ? "border-cyan-500/70 bg-cyan-500/5 text-cyan-300" : "border-white/10 text-slate-300"}`} data-testid="withdraw-method-bank">Bank</button>
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest text-slate-400">Amount (₹)</label>
          <input type="number" min={100} step={10} value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none font-mono focus:border-cyan-500"
            data-testid="withdraw-amount-input" />
        </div>

        {method === "upi" ? (
          <div>
            <label className="text-[11px] uppercase tracking-widest text-slate-400">Your UPI ID</label>
            <input value={upiId} onChange={(e) => setUpiId(e.target.value)} required
              className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none font-mono focus:border-cyan-500"
              placeholder="name@bank" data-testid="withdraw-upi-input" />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Account holder name" required
              className="bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500"
              data-testid="withdraw-holder-input" />
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank name"
              className="bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-cyan-500"
              data-testid="withdraw-bank-input" />
            <input value={accNo} onChange={(e) => setAccNo(e.target.value)} placeholder="Account number" required
              className="bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none font-mono focus:border-cyan-500"
              data-testid="withdraw-account-input" />
            <input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="IFSC" required
              className="bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none font-mono focus:border-cyan-500"
              data-testid="withdraw-ifsc-input" />
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3 rounded-xl" data-testid="withdraw-submit-btn">
          {submitting ? "Submitting..." : "Request withdrawal"}
        </button>
      </form>

      <div className="card-surface p-5">
        <h2 className="font-heading font-bold mb-3">Your withdrawals</h2>
        <div className="divide-y divide-white/5" data-testid="withdraw-history-list">
          {history.length === 0 && <div className="text-sm text-slate-500 py-2">No withdrawals yet</div>}
          {history.map((w) => {
            const Icon = statusIcon[w.status];
            return (
              <div key={w.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-mono">₹{w.amount}</div>
                  <div className="text-xs text-slate-500">{w.method === "upi" ? w.upi_id : `${w.bank_name || ""} • ${w.account_number}`}</div>
                </div>
                <div className={`chip ${statusStyle[w.status]}`}>
                  <Icon className="w-3 h-3" /> {w.status}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
