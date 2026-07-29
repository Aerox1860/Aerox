import { useEffect, useState } from "react";
import { Trophy, Medal } from "lucide-react";
import { api } from "@/lib/api";

const tabs = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "all", label: "All-time" },
];

export default function Leaderboard() {
  const [active, setActive] = useState("daily");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.get(`/leaderboard?period=${active}`).then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, [active]);

  return (
    <div className="space-y-5" data-testid="leaderboard-page">
      <div>
        <h1 className="font-heading text-2xl md:text-3xl font-black flex items-center gap-2"><Trophy className="w-6 h-6 text-yellow-300" /> Leaderboard</h1>
        <p className="text-slate-400 text-sm mt-1">Top pilots ranked by profit.</p>
      </div>

      <div className="card-surface p-2 inline-flex gap-1" data-testid="leaderboard-tabs">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActive(t.key)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${active === t.key ? "bg-[#1A2235] text-cyan-300" : "text-slate-400 hover:text-slate-100"}`}
            data-testid={`leaderboard-tab-${t.key}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card-surface p-2">
        <div className="divide-y divide-white/5" data-testid="leaderboard-rows">
          {rows.length === 0 && <div className="text-sm text-slate-500 p-4">No entries yet for this period.</div>}
          {rows.map((r, i) => (
            <div key={r.user_id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg grid place-items-center font-bold ${
                  i === 0 ? "bg-yellow-500/20 text-yellow-300" :
                  i === 1 ? "bg-slate-500/30 text-slate-200" :
                  i === 2 ? "bg-orange-500/20 text-orange-300" : "bg-[#06090F] text-slate-400 border border-white/10"
                }`}>
                  {i < 3 ? <Medal className="w-4 h-4" /> : i + 1}
                </div>
                <div>
                  <div className="font-medium">{r.user_name || "Player"}</div>
                  <div className="text-xs text-slate-500">{r.bets} bets</div>
                </div>
              </div>
              <div className={`font-mono font-bold ${r.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                {r.profit >= 0 ? "+" : ""}₹{r.profit.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
