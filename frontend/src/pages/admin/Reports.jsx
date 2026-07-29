import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function AdminReports() {
  const [data, setData] = useState({ rounds: [], top_winners: [] });
  useEffect(() => { api.get("/admin/reports").then(({ data }) => setData(data)).catch(() => {}); }, []);

  return (
    <div className="space-y-6" data-testid="admin-reports">
      <h1 className="font-heading text-3xl font-black">Reports</h1>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card-surface p-5">
          <h2 className="font-heading font-bold mb-3">Top winners (all-time)</h2>
          <div className="divide-y divide-white/5">
            {data.top_winners.length === 0 && <div className="text-sm text-slate-500 py-2">No data.</div>}
            {data.top_winners.map((w, i) => (
              <div key={w.user_id} className="flex items-center justify-between py-2 text-sm">
                <div><span className="text-slate-500 font-mono mr-2">#{i + 1}</span>{w.user_name}</div>
                <div className="font-mono text-green-400">+₹{w.total.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-surface p-5">
          <h2 className="font-heading font-bold mb-3">Recent rounds</h2>
          <div className="max-h-96 overflow-y-auto divide-y divide-white/5" data-testid="rounds-list">
            {data.rounds.length === 0 && <div className="text-sm text-slate-500 py-2">No rounds yet.</div>}
            {data.rounds.map((r) => (
              <div key={r.round_id} className="flex items-center justify-between py-2 text-sm">
                <div className="font-mono text-xs text-slate-500">{r.round_id.slice(0, 8)}...</div>
                <div className={`font-mono font-bold ${r.crash_at >= 2 ? "text-green-400" : r.crash_at >= 1.5 ? "text-cyan-300" : "text-red-400"}`}>{r.crash_at.toFixed(2)}x</div>
                <div className="text-xs text-slate-500">{new Date(r.created_at).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
