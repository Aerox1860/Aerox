import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, ArrowUpFromLine, History, RefreshCw, Wallet as WalletIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * Wallet — white body, colourful action buttons.
 *  • Balance card: white card with soft cyan halo, big black amount.
 *  • Actions: bright green Deposit + red Withdraw (govinda365-style CTAs).
 *  • Txns list: light rows, coloured amounts by type.
 */

const typeTone = {
  deposit:  "text-emerald-600",
  cashout:  "text-emerald-600",
  bonus:    "text-cyan-600",
  referral: "text-cyan-600",
  adjust:   "text-amber-600",
  bet:      "text-rose-600",
  withdraw: "text-rose-600",
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
    <div className="bg-white text-slate-900 min-h-screen w-full" data-testid="wallet-page">
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Balance card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm p-6" data-testid="wallet-balance-card">
          <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-cyan-400/15 blur-3xl pointer-events-none" />
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-slate-500 font-semibold">
            <WalletIcon className="w-3.5 h-3.5 text-cyan-600" /> Available balance
          </div>
          <div className="mt-2 font-mono font-black text-4xl sm:text-5xl text-slate-900" data-testid="wallet-balance">
            ₹ {Number(user?.balance ?? 0).toFixed(2)}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/deposit"
              data-testid="wallet-deposit-btn"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-md hover:shadow-lg hover:brightness-105 active:scale-[0.99] transition"
            >
              <ArrowDownToLine className="w-4 h-4" /> Deposit
            </Link>
            <Link
              to="/withdraw"
              data-testid="wallet-withdraw-btn"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-rose-500 to-red-600 shadow-md hover:shadow-lg hover:brightness-105 active:scale-[0.99] transition"
            >
              <ArrowUpFromLine className="w-4 h-4" /> Withdraw
            </Link>
          </div>
        </div>

        {/* Quick chips */}
        <div className="grid grid-cols-3 gap-2" data-testid="wallet-quick-chips">
          <Link to="/deposit"     className="rounded-xl px-3 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold text-center hover:bg-emerald-100">Add money</Link>
          <Link to="/withdraw"    className="rounded-xl px-3 py-3 bg-rose-50    text-rose-700    border border-rose-200    text-xs font-bold text-center hover:bg-rose-100">Withdraw</Link>
          <Link to="/leaderboard" className="rounded-xl px-3 py-3 bg-amber-50   text-amber-700   border border-amber-200   text-xs font-bold text-center hover:bg-amber-100">Rank</Link>
        </div>

        {/* Transactions */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5" data-testid="wallet-txn-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-cyan-600" />
              <h2 className="font-heading font-bold text-slate-900">Transactions</h2>
            </div>
            <button
              onClick={load}
              disabled={refreshing}
              data-testid="refresh-txns-btn"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 inline-flex items-center gap-1 disabled:opacity-60"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
          <div className="divide-y divide-slate-100" data-testid="transactions-list">
            {txns.length === 0 && (
              <div className="text-sm text-slate-400 py-6 text-center">No transactions yet.</div>
            )}
            {txns.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="capitalize font-semibold text-slate-800">{t.type}</div>
                  <div className="text-xs text-slate-500 truncate">{t.note}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-mono font-bold ${typeTone[t.type] || "text-slate-800"}`}>
                    {t.amount >= 0 ? "+" : ""}{t.amount.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400">{new Date(t.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
