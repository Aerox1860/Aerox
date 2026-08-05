import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

/**
 * Compact govinda365-style In-Play table.
 *
 * Layout per row (mobile-optimised, dense):
 *   [LIVE tag]  [time]  [Team1 / Team2 stacked]  [MO BM F tags]  [MO back][MO lay]  [BM back][BM lay]  [F back][F lay]
 *
 * Odds jitter every 2 seconds ±0.05 with a tiny random-walk on the volume so
 * the whole table feels "live". Missing odds show as a light "-" cell.
 * Rows scroll horizontally on tiny screens so the odds columns stay tappable.
 */

const JITTER_MAX = 0.06;

function jitter(v) {
  if (v == null) return null;
  const d = (Math.random() - 0.5) * 2 * JITTER_MAX;
  return Math.max(1.01, +(v + d).toFixed(2));
}

function pseudoVol(seed, tick) {
  // deterministic-ish volume — small drift over ticks
  const base = ((seed * 9301 + tick * 49297) % 20000) + 500;
  return base;
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
    const p = setInterval(load, 20000);
    const j = setInterval(() => setTick((n) => n + 1), 2000);
    return () => { alive = false; clearInterval(p); clearInterval(j); };
  }, []);

  return (
    <div className="bg-white text-slate-900 min-h-screen w-full" data-testid="inplay-white">
      {/* Sport tab strip (govinda-style — Home / Cricket / Sportsbook / Casino) */}
      <div className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-3 py-2 flex gap-1.5 overflow-x-auto no-scrollbar">
          <TopTab label="Home"        icon="🏠" to="/" />
          <TopTab label="Cricket"     icon="🏏" active />
          <TopTab label="Sportsbook"  icon="🏆" to="/games" />
          <TopTab label="Casino"      icon="🎰" to="/games" />
          <TopTab label="Aviator"     icon="✈️" to="/aviator" />
        </div>
      </div>

      {/* Column headers (sticky under sport tabs on scroll) */}
      <div className="max-w-6xl mx-auto px-2 pt-2">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center justify-end gap-0.5 pr-1">
          <ColHeader label="MO" tone="bg-emerald-100 text-emerald-700" />
          <ColHeader label="BM" tone="bg-sky-100 text-sky-700" />
          <ColHeader label="F"  tone="bg-orange-100 text-orange-700" />
        </div>
      </div>

      {/* Matches list */}
      <div className="max-w-6xl mx-auto pb-8">
        {loading ? (
          <div className="py-10 text-center text-slate-400 text-sm">Loading matches…</div>
        ) : matches.length === 0 ? (
          <div className="py-10 mx-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-slate-400 text-sm" data-testid="inplay-empty">
            No live matches right now. Push one from the admin panel.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border-t border-b border-slate-100 bg-white">
            {matches.map((m, i) => <MatchTableRow key={m.id} match={m} tick={tick} seed={i + 1} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────── */

function TopTab({ label, icon, to, active }) {
  const cls = `shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${
    active
      ? "bg-slate-900 text-white border-slate-900"
      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
  }`;
  const inner = <><span>{icon}</span><span>{label}</span></>;
  return to && !active ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

function ColHeader({ label, tone }) {
  return (
    <div className={`w-[68px] sm:w-[92px] text-center py-1 rounded-md text-[10px] font-bold ${tone}`}>{label}</div>
  );
}

/** One dense match row. */
function MatchTableRow({ match, tick, seed }) {
  const odds = useMemo(() => ({
    // MO = Match Odds (use team1 as one side of MO)
    mo_back: jitter(match.odds_team1_back),
    mo_lay:  jitter(match.odds_team1_lay),
    // BM = Bookmaker (use team2 odds as bookmaker cell to fill the reference layout)
    bm_back: jitter(match.odds_team2_back),
    bm_lay:  jitter(match.odds_team2_lay),
    // F = Fancy (single-value cell — use draw if present, else null)
    f_back:  jitter(match.odds_draw),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tick, match.id]);

  const time = match.match_time ? new Date(match.match_time) : null;
  const day  = time ? time.toLocaleDateString(undefined, { weekday: "short" }) : "Today";
  const hh   = time ? time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";

  // Show status: RAIN if admin-flagged, LIVE only when start-time passed, else TODAY.
  const now = Date.now();
  const started = !time || time.getTime() <= now;
  const status = match.rain_delay ? "rain" : started ? "live" : "today";
  const badge =
    status === "rain" ? { label: "Rain Delay", tone: "bg-sky-500 text-white animate-pulse" } :
    status === "live" ? { label: "Live",       tone: "bg-red-500 text-white" } :
                        { label: "Today",      tone: "bg-amber-500 text-white" };

  return (
    <Link
      to={`/in-play`}
      data-testid={`row-${match.id}`}
      className="grid grid-cols-[54px_1fr_auto] items-center gap-2 px-2 py-2 hover:bg-slate-50 active:bg-slate-100"
    >
      {/* Column 1: time + status */}
      <div className="text-[11px] text-slate-700 leading-tight">
        <div className="inline-flex items-center gap-1">
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-widest ${badge.tone}`}>{badge.label}</span>
        </div>
        <div className="mt-0.5 text-[11px] font-semibold text-slate-500">{day}</div>
        <div className="text-[11px] font-bold text-slate-900">{hh}</div>
      </div>

      {/* Column 2: match name + tags */}
      <div className="min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <TinyTag label="MO" tone="bg-emerald-500 text-white" />
          <TinyTag label="BM" tone="bg-sky-500 text-white" />
          <TinyTag label="F"  tone="bg-orange-500 text-white" />
          <TinyTag label="▶" tone="bg-slate-900 text-white text-[9px]" />
        </div>
        <div className="text-[12.5px] font-semibold text-slate-900 leading-tight mt-0.5 truncate">
          {match.team1_name}
        </div>
        <div className="text-[12.5px] font-semibold text-slate-900 leading-tight truncate">
          {match.team2_name}
        </div>
        {match.tournament && (
          <div className="text-[10px] text-slate-500 truncate">{match.tournament}</div>
        )}
      </div>

      {/* Column 3: odds cells (MO / BM / F) */}
      <div className="flex items-center gap-0.5">
        <OddsPair back={odds.mo_back} lay={odds.mo_lay} vol={pseudoVol(seed * 3,     tick)} />
        <OddsPair back={odds.bm_back} lay={odds.bm_lay} vol={pseudoVol(seed * 3 + 1, tick)} />
        <OddsPair back={odds.f_back}  lay={null}         vol={pseudoVol(seed * 3 + 2, tick)} single />
      </div>
    </Link>
  );
}

function TinyTag({ label, tone }) {
  return (
    <span className={`inline-block px-1 py-[1px] rounded text-[8.5px] font-bold uppercase tracking-widest ${tone}`}>
      {label}
    </span>
  );
}

function OddsPair({ back, lay, vol, single }) {
  return (
    <div className="flex gap-[1px]">
      <OddsCell value={back} tone="blue" vol={vol} />
      {!single && <OddsCell value={lay} tone="pink" vol={vol + 250} />}
      {single && <OddsCell value={null} tone="blue" vol={null} placeholder />}
    </div>
  );
}

function OddsCell({ value, tone, vol, placeholder }) {
  const [prev, setPrev] = useState(value);
  const [flash, setFlash] = useState(null);
  useEffect(() => {
    if (prev == null || value == null) { setPrev(value); return; }
    if (value !== prev) {
      setFlash(value > prev ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 900);
      setPrev(value);
      return () => clearTimeout(t);
    }
  }, [value, prev]);

  const empty = value == null;
  const bg = empty
    ? "bg-slate-100 text-slate-400 border-slate-200"
    : tone === "blue"
    ? "bg-blue-100 text-blue-800 border-blue-200"
    : "bg-pink-100 text-pink-800 border-pink-200";
  const flashCls = flash === "up"   ? "ring-2 ring-emerald-400"
                 : flash === "down" ? "ring-2 ring-red-400"
                 : "";
  return (
    <div className={`w-[32px] sm:w-[44px] h-[42px] rounded border ${bg} ${flashCls} px-0.5 py-0.5 flex flex-col items-center justify-center transition-shadow`}>
      <div className={`text-[11px] font-bold leading-none ${empty ? "opacity-70" : ""}`}>
        {empty ? "-" : value.toFixed(2)}
      </div>
      {!empty && vol != null && (
        <div className="text-[8.5px] mt-0.5 leading-none opacity-70 font-mono">
          {formatVol(vol)}
        </div>
      )}
      {placeholder && <div className="text-[8.5px] opacity-0">-</div>}
    </div>
  );
}

function formatVol(v) {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
  return String(v);
}
