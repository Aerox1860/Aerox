import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Radio, Clock, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";

/**
 * White-themed In-Play page. Lists all admin-pushed live matches with cards
 * showing dynamic (jittering) odds — the numbers tick every 2 seconds ±0.05
 * to give the "live exchange" feel real bettors expect.
 */

const JITTER_PAISA_MAX = 0.06;          // ± ₹0.06 per tick

function jitter(base) {
  if (base == null) return null;
  const delta = (Math.random() - 0.5) * 2 * JITTER_PAISA_MAX;
  return Math.max(1.01, +(base + delta).toFixed(2));
}

export default function InPlay() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data } = await api.get("/featured/matches");
        if (alive) setMatches(Array.isArray(data) ? data : []);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 20000);           // fresh admin data every 20s
    const j = setInterval(() => setTick((n) => n + 1), 2000);  // odds jitter every 2s
    return () => { alive = false; clearInterval(t); clearInterval(j); };
  }, []);

  return (
    <div className="bg-white text-slate-900 min-h-screen w-full" data-testid="inplay-white">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-heading font-black text-2xl">In-Play · Live matches</h1>
            <p className="text-xs text-slate-500 mt-0.5">Odds update every 2 seconds — click to place a bet.</p>
          </div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-emerald-600 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </header>

        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-400">Loading matches…</div>
        ) : matches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-slate-400 text-sm" data-testid="inplay-empty">
            No live matches right now. <Link to="/virtual" className="text-cyan-600 underline">Play Virtual Cricket</Link> instead.
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => <LiveMatchCard key={m.id} match={m} tick={tick} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Single live match card with jittering odds. */
function LiveMatchCard({ match, tick }) {
  // Freshly jittered odds every render (parent re-renders every 2s via `tick`).
  const odds = useMemo(() => ({
    t1_back: jitter(match.odds_team1_back),
    t1_lay:  jitter(match.odds_team1_lay),
    t2_back: jitter(match.odds_team2_back),
    t2_lay:  jitter(match.odds_team2_lay),
    draw:    jitter(match.odds_draw),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tick, match.id]);

  const time = match.match_time ? new Date(match.match_time) : null;
  const timeStr = time ? time.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "TBA";

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3" data-testid={`live-card-${match.id}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {match.tournament && <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{match.tournament}</span>}
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <div className="font-heading font-black text-lg text-slate-900 truncate">
            {match.team1_name} <span className="text-slate-400 font-normal">vs</span> {match.team2_name}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {timeStr}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
          MO · BM · F
        </div>
      </div>

      {/* Team 1 odds row */}
      <OddsRow label={match.team1_name} back={odds.t1_back} lay={odds.t1_lay} />
      {/* Team 2 odds row */}
      <OddsRow label={match.team2_name} back={odds.t2_back} lay={odds.t2_lay} />
      {/* Draw / Fancy — if provided */}
      {match.odds_draw != null && (
        <OddsRow label="The Draw" back={odds.draw} single />
      )}

      {/* Players preview */}
      {(match.team1_players?.length > 0 || match.team2_players?.length > 0) && (
        <details className="pt-2 border-t border-slate-100" data-testid="players-details">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-900">
            Show playing squads
          </summary>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            {[[match.team1_name, match.team1_players], [match.team2_name, match.team2_players]].map(([tn, plrs]) => (
              <div key={tn} className="rounded-lg bg-slate-50 p-3">
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-1.5">{tn}</div>
                <div className="text-xs text-slate-700 space-y-0.5">
                  {(plrs || []).map((p, i) => <div key={i}>· {p}</div>)}
                  {(!plrs || plrs.length === 0) && <div className="text-slate-400">Squad not published yet</div>}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function OddsRow({ label, back, lay, single }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
      <div className="min-w-0 text-sm font-semibold text-slate-800 truncate">{label}</div>
      <div className="flex items-center gap-1.5">
        {back != null ? <OddsCell value={back} tone="blue" /> : <OddsPlaceholder />}
        {!single && (lay != null ? <OddsCell value={lay} tone="pink" /> : <OddsPlaceholder />)}
      </div>
    </div>
  );
}

/** Jittering odds cell with up/down arrow that flashes on change. */
function OddsCell({ value, tone }) {
  const [prev, setPrev] = useState(value);
  const [flash, setFlash] = useState(null);   // "up" | "down" | null

  useEffect(() => {
    if (prev == null || value == null) { setPrev(value); return; }
    if (value !== prev) {
      setFlash(value > prev ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 1200);
      setPrev(value);
      return () => clearTimeout(t);
    }
  }, [value, prev]);

  const base = tone === "blue" ? "bg-blue-500" : "bg-pink-500";
  const flashCls = flash === "up"   ? "ring-2 ring-emerald-400"
                 : flash === "down" ? "ring-2 ring-red-400"
                 : "";
  return (
    <div className={`relative w-14 h-10 rounded ${base} text-white grid place-items-center text-[12px] font-bold transition-shadow ${flashCls}`}
         data-testid={`odds-${tone}`}>
      <span>{value != null ? value.toFixed(2) : "-"}</span>
      {flash && (
        <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full grid place-items-center text-[9px] shadow-sm ${flash === "up" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
          {flash === "up" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
        </span>
      )}
    </div>
  );
}

function OddsPlaceholder() {
  return <div className="w-14 h-10 rounded bg-slate-100 grid place-items-center text-slate-400 text-xs">-</div>;
}
