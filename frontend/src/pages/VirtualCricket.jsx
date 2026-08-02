import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Timer, Trophy, X, ChevronRight, TrendingUp, ArrowLeft, Loader2, Zap, Coins } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError, wsUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const CHIPS = [10, 50, 100, 500, 1000];

/**
 * Virtual Cricket arena — lists live simulated matches, streams ball-by-ball
 * over WebSocket, and lets users place bets on match winner / toss / total runs
 * with dynamic odds that update each ball. Only match_winner supports mid-match
 * cashout (per product spec).
 */
export default function VirtualCricket() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openMatchId, setOpenMatchId] = useState(null);

  // Poll list every 4s (WebSocket is per-match; the lobby just needs occasional refresh)
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data } = await api.get("/virtual/matches");
        if (alive) setMatches(data.matches || []);
      } catch { /* ignore transient */ }
      finally { if (alive) setLoading(false); }
    };
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const openMatch = matches.find((m) => m.id === openMatchId) || null;

  return (
    <div className="space-y-5" data-testid="virtual-page">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/15 border border-yellow-400/40 grid place-items-center">
              <Trophy className="w-4 h-4 text-yellow-300" />
            </div>
            <h1 className="font-heading text-2xl md:text-3xl font-black">Virtual Cricket</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">Simulated T5 matches · Bet on winner, toss & total runs · Live odds every ball.</p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
          <Zap className="w-3.5 h-3.5 text-yellow-300" />
          {matches.length} live rooms
        </div>
      </div>

      {loading ? (
        <div className="card-surface p-10 text-center text-slate-400 inline-flex items-center gap-2 w-full justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Warming up the pitch…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4" data-testid="virtual-grid">
          <AnimatePresence mode="popLayout">
            {matches.map((m) => <MatchTile key={m.id} match={m} onOpen={() => setOpenMatchId(m.id)} />)}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {openMatch && (
          <MatchRoom
            key={openMatch.id}
            initial={openMatch}
            onClose={() => setOpenMatchId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────── Match tile (lobby card) ─────────────── */
function MatchTile({ match, onOpen }) {
  const [t1, t2] = match.teams;
  const s1 = match.scores[t1.short] || {};
  const s2 = match.scores[t2.short] || {};
  return (
    <motion.button
      layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      whileHover={{ y: -2 }}
      onClick={onOpen}
      data-testid={`virtual-tile-${match.id}`}
      className="card-surface p-4 text-left relative overflow-hidden group"
    >
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-2xl opacity-25 pointer-events-none"
           style={{ background: t1.color || "#22c55e" }} />
      <div className="flex items-center justify-between relative">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded border border-white/10">{match.format}</span>
          <span>Match #{match.match_no}</span>
        </div>
        <PhaseBadge phase={match.phase} />
      </div>

      <div className="mt-4 space-y-2.5 relative">
        <TeamRow team={t1} score={s1} batting={match.batting === t1.short} />
        <div className="text-center text-[10px] uppercase tracking-widest text-slate-500">vs</div>
        <TeamRow team={t2} score={s2} batting={match.batting === t2.short} />
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2 text-slate-400">
          <TrendingUp className="w-3 h-3" /> Odds live
        </div>
        <div className="inline-flex items-center gap-1 text-cyan-300 font-semibold">
          Enter room <ChevronRight className="w-3 h-3" />
        </div>
      </div>
    </motion.button>
  );
}

function TeamRow({ team, score, batting }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-lg leading-none">{team.flag}</div>
      <div className="flex-1 min-w-0">
        <div className="font-heading font-bold text-sm truncate flex items-center gap-1.5">
          {team.name}
          {batting && <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/15 border border-yellow-400/40 text-yellow-300 uppercase tracking-widest">Batting</span>}
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-widest">{team.short}</div>
      </div>
      <div className="text-right font-mono">
        <div className="text-lg font-bold text-slate-100 leading-none">
          {score?.runs ?? 0}<span className="text-slate-500 text-xs">/{score?.wickets ?? 0}</span>
        </div>
        <div className="text-[10px] text-slate-400">{score?.overs_str ?? "0.0"} ov</div>
      </div>
    </div>
  );
}

function PhaseBadge({ phase }) {
  const styles = {
    pre_toss:  { cls: "!bg-cyan-500/15 !border-cyan-400/50 !text-cyan-300",   label: "Pre-toss" },
    toss:      { cls: "!bg-purple-500/15 !border-purple-400/50 !text-purple-300", label: "Toss" },
    innings1:  { cls: "!bg-red-500/15 !border-red-400/50 !text-red-300",       label: "Innings 1" },
    break:     { cls: "!bg-yellow-500/15 !border-yellow-400/50 !text-yellow-300", label: "Break" },
    innings2:  { cls: "!bg-red-500/15 !border-red-400/50 !text-red-300",       label: "Innings 2" },
    completed: { cls: "!bg-slate-500/15 !border-slate-400/40 !text-slate-300",  label: "Finished" },
  };
  const s = styles[phase] || styles.pre_toss;
  const isLive = phase === "innings1" || phase === "innings2";
  return (
    <span className={`chip text-[10px] uppercase ${s.cls}`}>
      {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
      {s.label}
    </span>
  );
}

/* ─────────────── Match room (details + betting) ─────────────── */
function MatchRoom({ initial, onClose }) {
  const { refresh } = useAuth();
  const [match, setMatch] = useState(initial);
  const [myBets, setMyBets] = useState([]);
  const wsRef = useRef(null);

  const refreshMyBets = async () => {
    try {
      const { data } = await api.get("/virtual/my-bets?limit=40");
      setMyBets(data.filter((b) => b.match_id === initial.id));
    } catch {}
  };

  useEffect(() => {
    refreshMyBets();
    let stopped = false;
    let backoff = 500;
    const connect = () => {
      // wsUrl() returns .../api/ws — swap suffix for our per-match room
      const raw = wsUrl();
      const base = raw.replace(/\/api\/ws$/, "");
      const ws = new WebSocket(`${base}/api/virtual/ws/${initial.id}`);
      wsRef.current = ws;
      ws.onopen = () => { backoff = 500; };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "state" && msg.data)    setMatch(msg.data);
          if (msg.type === "ball"  && msg.data?.match) setMatch(msg.data.match);
        } catch {}
      };
      ws.onclose = () => {
        if (stopped) return;
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 4000);
      };
    };
    connect();
    return () => { stopped = true; try { wsRef.current?.close(); } catch {} };
  }, [initial.id]);

  const settle = () => refreshMyBets();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur overflow-y-auto"
      data-testid="virtual-room"
    >
      <div className="min-h-full py-6 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button onClick={onClose} className="btn-ghost px-3 py-2 rounded-lg text-xs inline-flex items-center gap-1"
                    data-testid="virtual-room-close">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <PhaseBadge phase={match.phase} />
          </div>

          <div className="grid lg:grid-cols-[1fr,340px] gap-4">
            {/* Scoreboard + commentary */}
            <div className="space-y-4">
              <Scoreboard match={match} />
              <Commentary match={match} onSettle={settle} onRefresh={refresh} />
            </div>

            {/* Betting sidebar */}
            <BetSidebar
              match={match}
              myBets={myBets}
              refreshMyBets={refreshMyBets}
              refreshBalance={refresh}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Scoreboard({ match }) {
  const [t1, t2] = match.teams;
  const s1 = match.scores[t1.short] || {};
  const s2 = match.scores[t2.short] || {};
  return (
    <div className="card-surface p-5">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 flex items-center gap-2">
        {match.format} · Match #{match.match_no} · {match.league}
      </div>
      <div className="mt-4 space-y-3">
        <TeamRow team={t1} score={s1} batting={match.batting === t1.short} />
        <TeamRow team={t2} score={s2} batting={match.batting === t2.short} />
      </div>
      <MatchStatusLine match={match} />
    </div>
  );
}

function MatchStatusLine({ match }) {
  const line = useMemo(() => {
    if (match.phase === "pre_toss") return "Toss coming up…";
    if (match.phase === "toss") return `${match.toss_winner} won the toss & chose to ${match.toss_choice}`;
    if (match.phase === "innings1") return `${match.batting} batting first`;
    if (match.phase === "break") return `Innings break — target ${match.target}`;
    if (match.phase === "innings2") {
      const sc = match.scores[match.batting] || {};
      const bl = 5 * 6 - (sc.balls || 0);
      const need = Math.max(0, (match.target || 0) - (sc.runs || 0));
      const rrr = bl > 0 ? ((need / bl) * 6).toFixed(2) : "—";
      return `${match.batting} need ${need} in ${bl} balls · RRR ${rrr}`;
    }
    if (match.phase === "completed") return match.winner === "TIE" ? "Match tied" : `${match.winner} wins the match!`;
    return "";
  }, [match]);
  return (
    <div className="mt-4 pt-4 border-t border-white/5 text-[13px] font-mono text-yellow-300">{line}</div>
  );
}

function Commentary({ match, onSettle, onRefresh }) {
  const prevPhase = useRef(match.phase);
  useEffect(() => {
    if (prevPhase.current !== match.phase) {
      // when phase transitions, wallet + my-bets may have updated (toss / final)
      if (["toss", "completed"].includes(match.phase)) {
        onSettle?.();
        onRefresh?.();
      }
      prevPhase.current = match.phase;
    }
  }, [match.phase, onSettle, onRefresh]);

  return (
    <div className="card-surface p-4">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Commentary</div>
      <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
        {(match.commentary || []).map((c, i) => (
          <div key={i} className="text-xs text-slate-300 flex items-start gap-2">
            <span className="text-[10px] font-mono text-slate-500 w-10 shrink-0">{c.over}</span>
            <span className="flex-1">{c.text}{c.team && c.score ? ` — ${c.team} ${c.score}` : ""}</span>
            {c.outcome && <OutcomeChip out={c.outcome} />}
          </div>
        ))}
        {(!match.commentary || match.commentary.length === 0) && (
          <div className="text-xs text-slate-500">Match hasn't started yet — get your bets in.</div>
        )}
      </div>
    </div>
  );
}

function OutcomeChip({ out }) {
  const map = {
    "0": "text-slate-400 border-white/10",
    "1": "text-slate-200 border-white/20",
    "2": "text-slate-200 border-white/20",
    "3": "text-slate-200 border-white/20",
    "4": "text-cyan-300 border-cyan-500/50",
    "6": "text-yellow-300 border-yellow-500/50",
    "W": "text-red-300 border-red-500/50",
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${map[out] || map["0"]}`}>{out}</span>;
}

/* ─────────────── Bet Sidebar ─────────────── */
function BetSidebar({ match, myBets, refreshMyBets, refreshBalance }) {
  const [amount, setAmount] = useState(50);
  const [placing, setPlacing] = useState(false);

  const place = async (market, selection) => {
    setPlacing(true);
    try {
      const { data } = await api.post("/virtual/bet", {
        match_id: match.id, market, selection, amount: Number(amount),
      });
      toast.success(`Bet placed @ ${data.odds}x`);
      refreshMyBets(); refreshBalance();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setPlacing(false); }
  };

  const cashout = async (bet_id) => {
    try {
      const { data } = await api.post("/virtual/cashout", { bet_id });
      toast.success(`Cashed out ₹${data.payout.toFixed(2)}`);
      refreshMyBets(); refreshBalance();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const [t1, t2] = match.teams;
  const mw = match.odds?.match_winner || {};
  const to = match.odds?.toss_winner  || {};
  const tr = match.odds?.total_runs   || { line: 0, over: 2, under: 2 };
  const canBetToss   = match.phase === "pre_toss";
  const canBetMW     = !["completed"].includes(match.phase);
  const canBetTotal  = !["completed"].includes(match.phase);

  return (
    <aside className="space-y-4">
      {/* Stake picker */}
      <div className="card-surface p-4">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Stake</div>
        <div className="flex items-center gap-2">
          <input
            type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            min={10} step={10}
            className="bg-[#06090F] border border-white/10 rounded-lg px-3 py-2 font-mono w-24 outline-none focus:border-cyan-500"
            data-testid="virtual-stake-input"
          />
          <div className="flex gap-1.5 flex-wrap">
            {CHIPS.map((c) => (
              <button key={c} onClick={() => setAmount(c)}
                      data-testid={`chip-${c}`}
                      className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                        Number(amount) === c ? "border-cyan-400/60 text-cyan-200 bg-cyan-500/10" : "border-white/10 text-slate-300 hover:border-white/20"
                      }`}>₹{c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Match Winner */}
      <MarketCard title="Match Winner" testid="mkt-mw" note="Cashout available before match ends">
        <SelBtn label={t1.short} odds={mw[t1.short]} disabled={!canBetMW || placing} onClick={() => place("match_winner", t1.short)} testid={`bet-mw-${t1.short}`} />
        <SelBtn label={t2.short} odds={mw[t2.short]} disabled={!canBetMW || placing} onClick={() => place("match_winner", t2.short)} testid={`bet-mw-${t2.short}`} />
      </MarketCard>

      {/* Toss */}
      <MarketCard title="Toss Winner" testid="mkt-toss" note={canBetToss ? "Locks at toss" : "Toss done"}>
        <SelBtn label={t1.short} odds={to[t1.short]} disabled={!canBetToss || placing} onClick={() => place("toss_winner", t1.short)} testid={`bet-toss-${t1.short}`} />
        <SelBtn label={t2.short} odds={to[t2.short]} disabled={!canBetToss || placing} onClick={() => place("toss_winner", t2.short)} testid={`bet-toss-${t2.short}`} />
      </MarketCard>

      {/* Total Runs */}
      <MarketCard title={`Match Total Runs (line ${tr.line})`} testid="mkt-tr" note="No cashout · Settles at end">
        <SelBtn label={`Over ${tr.line}`}  odds={tr.over}  disabled={!canBetTotal || placing} onClick={() => place("total_runs", "over")}  testid="bet-tr-over" />
        <SelBtn label={`Under ${tr.line}`} odds={tr.under} disabled={!canBetTotal || placing} onClick={() => place("total_runs", "under")} testid="bet-tr-under" />
      </MarketCard>

      {/* My bets */}
      <div className="card-surface p-4">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">My bets on this match</div>
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {myBets.length === 0 && <div className="text-xs text-slate-500">No bets yet.</div>}
          {myBets.map((b) => (
            <div key={b.id} className="text-xs flex items-center justify-between border border-white/5 rounded-lg p-2 bg-white/5">
              <div className="min-w-0">
                <div className="font-mono truncate">{b.market} · {b.selection} @ {b.odds_taken}x</div>
                <div className="text-[10px] text-slate-400">₹{b.amount} · payout ₹{b.potential_payout}</div>
              </div>
              <div className="text-right">
                {b.status === "pending" && b.market === "match_winner" && match.phase !== "completed" ? (
                  <button
                    onClick={() => cashout(b.id)}
                    data-testid={`cashout-${b.id}`}
                    className="btn-primary px-2.5 py-1 rounded text-[10px]">Cash out</button>
                ) : (
                  <span className={`text-[10px] uppercase tracking-widest ${
                    b.status === "won" ? "text-green-300"
                    : b.status === "cashed_out" ? "text-cyan-300"
                    : b.status === "lost" ? "text-red-300"
                    : "text-slate-400"
                  }`}>{b.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-[11px] text-slate-500 inline-flex items-center gap-1">
        <Coins className="w-3 h-3" /> Odds move every ball · Cashout only on match winner
      </div>
    </aside>
  );
}

function MarketCard({ title, note, children, testid }) {
  return (
    <div className="card-surface p-4" data-testid={testid}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold">{title}</div>
        {note && <div className="text-[10px] text-slate-500">{note}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function SelBtn({ label, odds, disabled, onClick, testid }) {
  const hasOdds = typeof odds === "number" && odds > 1.0;
  return (
    <button
      onClick={onClick}
      disabled={disabled || !hasOdds}
      data-testid={testid}
      className={`rounded-lg px-3 py-3 border text-left transition ${
        disabled || !hasOdds
          ? "border-white/5 bg-white/5 text-slate-500 cursor-not-allowed"
          : "border-cyan-400/40 bg-cyan-500/10 text-slate-100 hover:border-cyan-400/70 hover:bg-cyan-500/15"
      }`}
    >
      <div className="text-xs font-bold">{label}</div>
      <div className="mt-1 font-mono text-lg font-black text-cyan-300">
        {hasOdds ? `${odds}x` : "—"}
      </div>
    </button>
  );
}
