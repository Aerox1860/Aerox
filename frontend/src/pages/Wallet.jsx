import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, ArrowUpFromLine, History, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const typeColor = {
  deposit: "text-green-400",
  cashout: "text-green-400",
  bonus: "text-cyan-400",
  referral: "text-cyan-400",
  adjust: "text-yellow-300",
  bet: "text-red-400",
  withdraw: "text-red-400",
};

export default function Wallet() {
  const { user } = useAuth();
  const [txns, setTxns] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const { data } = await api.get("/wallet/transactions?limit=100");
      setTxns(data);
    } catch {} finally { setRefreshing(false); }
  };
  useEffect(() => {
    load();
    const onFocus = () => load();
    const onVis = () => { if (!document.hidden) load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(load, 10000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-5" data-testid="wallet-page">
      <div className="card-surface p-6 relative overflow-hidden">
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="text-[11px] uppercase tracking-[0.25em] text-slate-400">Available balance</div>
        <div className="mt-2 flex items-end gap-2">
          <div className="font-mono font-black text-5xl md:text-6xl neon-cyan" data-testid="wallet-balance">₹ {user?.balance?.toFixed(2)}</div>
        </div>
        <div className="mt-5 flex gap-3">
          <Link to="/deposit" className="btn-primary px-5 py-3 rounded-xl flex items-center gap-2" data-testid="wallet-deposit-btn"><ArrowDownToLine className="w-4 h-4" /> Deposit</Link>
          <Link to="/withdraw" className="btn-ghost px-5 py-3 rounded-xl flex items-center gap-2" data-testid="wallet-withdraw-btn"><ArrowUpFromLine className="w-4 h-4" /> Withdraw</Link>
        </div>
      </div>

      <div className="card-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-300" />
            <h2 className="font-heading font-bold">Transactions</h2>
          </div>
          <button onClick={load} disabled={refreshing} className="btn-ghost px-3 py-1.5 rounded-lg text-xs flex items-center gap-1" data-testid="refresh-txns-btn">
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <div className="divide-y divide-white/5" data-testid="transactions-list">
          {txns.length === 0 && <div className="text-sm text-slate-500 py-3">No transactions yet</div>}
          {txns.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <div className="capitalize font-medium">{t.type}</div>
                <div className="text-xs text-slate-500">{t.note}</div>
              </div>
              <div className="text-right">
                <div className={`font-mono font-bold ${typeColor[t.type] || "text-slate-200"}`}>
                  {t.amount >= 0 ? "+" : ""}{t.amount.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500">{new Date(t.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
