import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Timer, Trophy, X, ChevronRight, TrendingUp, ArrowLeft, Loader2, Zap, Coins, Globe2, MapPin, Coins as CoinIcon } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError, wsUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// Fixed stake chips per product spec: 100, 500, 1000, 5000, 10000
const CHIPS = [100, 500, 1000, 5000, 10000];

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
  const [tour, setTour] = useState("international"); // international | domestic

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

  const filteredMatches = useMemo(
    () => matches.filter((m) => (m.tour_type || "international") === tour),
    [matches, tour],
  );

  const openMatch = matches.find((m) => m.id === openMatchId) || null;
  const intlCount     = matches.filter((m) => (m.tour_type || "international") === "international").length;
  const domesticCount = matches.filter((m) => m.tour_type === "domestic").length;

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
          <p className="text-slate-400 text-sm mt-1">T20 matches · Bet on winner, toss & total runs · Live odds every ball · Cashout on match winner.</p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
          <Zap className="w-3.5 h-3.5 text-yellow-300" />
          {matches.length} live rooms
        </div>
      </div>

      {/* International / Domestic segmented control */}
      <div className="flex gap-2" role="tablist">
        <TourTab active={tour === "international"} onClick={() => setTour("international")}
                 icon={Globe2} label="International" count={intlCount} testid="tour-international" />
        <TourTab active={tour === "domestic"} onClick={() => setTour("domestic")}
                 icon={MapPin} label="Domestic" count={domesticCount} testid="tour-domestic" />
      </div>

      {loading ? (
        <div className="card-surface p-10 text-center text-slate-400 inline-flex items-center gap-2 w-full justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Warming up the pitch…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4" data-testid="virtual-grid">
          <AnimatePresence mode="popLayout">
            {filteredMatches.map((m) => <MatchTile key={m.id} match={m} onOpen={() => setOpenMatchId(m.id)} />)}
          </AnimatePresence>
          {filteredMatches.length === 0 && (
            <div className="col-span-full card-surface p-8 text-center text-slate-400">
              No {tour} matches in this rotation — try the other tab.
            </div>
          )}
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

function TourTab({ active, onClick, icon: Icon, label, count, testid }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`px-4 py-2 rounded-full text-xs font-semibold inline-flex items-center gap-2 transition
        ${active ? "bg-yellow-500/15 border border-yellow-400/60 text-yellow-200" : "border border-white/10 text-slate-300 hover:border-white/20"}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label} <span className="opacity-60">({count})</span>
    </button>
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
          <span className="truncate max-w-[180px]">{match.league}</span>
        </div>
        <PhaseBadge phase={match.phase} />
      </div>

      <div className="mt-4 space-y-2.5 relative">
        <TeamRow team={t1} score={s1} batting={match.batting === t1.short} phase={match.phase} />
        <div className="text-center text-[10px] uppercase tracking-widest text-slate-500">vs</div>
        <TeamRow team={t2} score={s2} batting={match.batting === t2.short} phase={match.phase} />
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2 text-slate-400">
          {match.phase === "pre_match" ? <TileCountdown iso={match.toss_at} label="Toss in" testid="tile-toss-in" />
           : match.phase === "lineup" ? <TileCountdown iso={match.play_at} label="Play in" testid="tile-play-in" />
           : <><TrendingUp className="w-3 h-3" /> Odds live</>}
        </div>
        <div className="inline-flex items-center gap-1 text-cyan-300 font-semibold">
          Enter room <ChevronRight className="w-3 h-3" />
        </div>
      </div>
    </motion.button>
  );
}

function TileCountdown({ iso, label, testid }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const target = iso ? new Date(iso).getTime() : 0;
  const remaining = Math.max(0, Math.round((target - now) / 1000));
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  return (
    <span className="inline-flex items-center gap-1 font-mono" data-testid={testid}>
      <Timer className="w-3 h-3" /> {label} {mm.toString().padStart(2,"0")}:{ss.toString().padStart(2,"0")}
    </span>
  );
}

function TeamRow({ team, score, batting, phase }) {
  const preLive = ["pre_match", "toss", "lineup"].includes(phase);
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
      {preLive ? (
        <div className="text-[10px] text-slate-500">Yet to bat</div>
      ) : (
        <div className="text-right font-mono">
          <div className="text-lg font-bold text-slate-100 leading-none">
            {score?.runs ?? 0}<span className="text-slate-500 text-xs">/{score?.wickets ?? 0}</span>
          </div>
          <div className="text-[10px] text-slate-400">{score?.overs_str ?? "0.0"} ov</div>
        </div>
      )}
    </div>
  );
}

function PhaseBadge({ phase }) {
  const styles = {
    pre_match: { cls: "!bg-cyan-500/15 !border-cyan-400/50 !text-cyan-300",     label: "Betting open" },
    toss:      { cls: "!bg-purple-500/15 !border-purple-400/50 !text-purple-300", label: "Toss" },
    lineup:    { cls: "!bg-blue-500/15 !border-blue-400/50 !text-blue-300",     label: "Line-up" },
    innings1:  { cls: "!bg-red-500/15 !border-red-400/50 !text-red-300",         label: "1st innings" },
    break:     { cls: "!bg-yellow-500/15 !border-yellow-400/50 !text-yellow-300", label: "Break" },
    innings2:  { cls: "!bg-red-500/15 !border-red-400/50 !text-red-300",         label: "2nd innings" },
    completed: { cls: "!bg-slate-500/15 !border-slate-400/40 !text-slate-300",    label: "Finished" },
  };
  const s = styles[phase] || styles.pre_match;
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
    return () => {
      stopped = true;
      try {
        const ws = wsRef.current;
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          ws.close();
        }
      } catch {}
    };
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
        {match.format} · {match.league}
      </div>
      <div className="mt-4 space-y-3">
        <TeamRow team={t1} score={s1} batting={match.batting === t1.short} phase={match.phase} />
        <TeamRow team={t2} score={s2} batting={match.batting === t2.short} phase={match.phase} />
      </div>
      <MatchStatusLine match={match} />
      {["pre_match", "toss", "lineup"].includes(match.phase) && (
        <TossStage match={match} />
      )}
    </div>
  );
}

function MatchStatusLine({ match }) {
  const line = useMemo(() => {
    if (match.phase === "pre_match") {
      const t = match.toss_at ? new Date(match.toss_at) : null;
      const timeStr = t ? t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
      return `Toss scheduled at ${timeStr} · Bets are open`;
    }
    if (match.phase === "toss")   return `${match.toss_winner} won the toss & chose to ${match.toss_choice}`;
    if (match.phase === "lineup") {
      const t = match.play_at ? new Date(match.play_at) : null;
      const timeStr = t ? t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
      return `Teams line-up · Play starts at ${timeStr}`;
    }
    if (match.phase === "innings1") return `${match.batting} batting first`;
    if (match.phase === "break") return `Innings break — target ${match.target}`;
    if (match.phase === "innings2") {
      const sc = match.scores[match.batting] || {};
      const bl = 20 * 6 - (sc.balls || 0);
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

/** Umpire + coin flip animation shown during pre_match → toss → lineup phases. */
function TossStage({ match }) {
  const flipping = match.phase === "pre_match" || match.phase === "toss";
  const done = match.phase === "lineup" || (match.phase === "toss" && match.toss_winner);
  return (
    <div className="mt-5 rounded-xl border border-white/5 bg-gradient-to-br from-emerald-950/40 to-slate-900/30 p-4">
      <div className="flex items-center gap-4">
        {/* Umpire silhouette */}
        <div className="relative w-14 h-16 flex-shrink-0">
          <div className="absolute inset-x-3 top-0 w-8 h-8 rounded-full bg-slate-200/90 border border-slate-400" />
          <div className="absolute left-1 top-6 w-12 h-8 rounded-t-lg bg-white shadow-inner border border-slate-300" />
          <div className="absolute left-3 top-14 w-2 h-2 rounded-full bg-slate-800" />
          <div className="absolute left-9 top-14 w-2 h-2 rounded-full bg-slate-800" />
        </div>
        {/* Coin */}
        <div className="relative w-14 h-14">
          <motion.div
            initial={{ rotateY: 0 }}
            animate={flipping ? { rotateY: 1440 } : { rotateY: done ? 720 : 0 }}
            transition={{ duration: flipping ? 3 : 0.6, repeat: flipping ? Infinity : 0, ease: "linear" }}
            className="w-14 h-14 rounded-full grid place-items-center font-mono text-lg font-black shadow-lg"
            style={{
              background: "linear-gradient(135deg,#fde047,#f59e0b)",
              color: "#111",
              boxShadow: "0 6px 22px rgba(245,158,11,0.35)",
            }}
          >
            ₹
          </motion.div>
        </div>
        <div className="flex-1 text-xs text-slate-300">
          {match.phase === "pre_match" && "Umpire ready · Coin toss coming up"}
          {match.phase === "toss" && (match.toss_winner
            ? <>Umpire calls: <span className="font-bold text-yellow-300">{match.toss_winner}</span> chose to <span className="font-bold">{match.toss_choice}</span></>
            : "Coin in the air…")}
          {match.phase === "lineup" && <>{match.toss_winner} won the toss · Teams walking out</>}
        </div>
      </div>
    </div>
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
  const [amount, setAmount] = useState(100);
  const [placing, setPlacing] = useState(false);

  // Track previous match_winner odds so we can render ▲ / ▼ indicators when they change ball-by-ball.
  const prevMwRef = useRef({});
  const [mwMove, setMwMove] = useState({});
  useEffect(() => {
    const now = match.odds?.match_winner || {};
    const prev = prevMwRef.current;
    const next = {};
    for (const k of Object.keys(now)) {
      const a = Number(now[k] || 0);
      const b = Number(prev[k] || 0);
      if (b > 0 && a !== b) next[k] = a > b ? "up" : "down";
    }
    if (Object.keys(next).length) {
      setMwMove(next);
      // Clear indicator after 3s so it doesn't stick permanently
      const t = setTimeout(() => setMwMove({}), 3000);
      prevMwRef.current = now;
      return () => clearTimeout(t);
    }
    prevMwRef.current = now;
  }, [match.odds?.match_winner]);

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
  const canBetToss   = match.phase === "pre_match";
  const canBetMW     = !["completed"].includes(match.phase);
  const canBetTotal  = !["completed"].includes(match.phase);

  return (
    <aside className="space-y-4">
      {/* Stake picker — fixed chips 100 / 500 / 1000 / 5000 / 10000 */}
      <div className="card-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-slate-400">Stake</div>
          <div className="font-mono text-cyan-300 font-bold">₹{Number(amount).toLocaleString("en-IN")}</div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c} onClick={() => setAmount(c)}
              data-testid={`chip-${c}`}
              className={`py-2 rounded-lg text-[11px] font-bold border transition ${
                Number(amount) === c
                  ? "border-yellow-400/70 text-yellow-200 bg-yellow-500/15"
                  : "border-white/10 text-slate-300 hover:border-white/25"
              }`}
            >₹{c >= 1000 ? `${c / 1000}k` : c}</button>
          ))}
        </div>
      </div>

      {/* Match Winner */}
      <MarketCard title="Match Winner" testid="mkt-mw" note="Cashout available before match ends">
        <SelBtn label={t1.short} odds={mw[t1.short]} move={mwMove[t1.short]} disabled={!canBetMW || placing} onClick={() => place("match_winner", t1.short)} testid={`bet-mw-${t1.short}`} />
        <SelBtn label={t2.short} odds={mw[t2.short]} move={mwMove[t2.short]} disabled={!canBetMW || placing} onClick={() => place("match_winner", t2.short)} testid={`bet-mw-${t2.short}`} />
      </MarketCard>

      {/* Toss — only show while pre_match (removed after toss done) */}
      {canBetToss && (
        <MarketCard title="Toss Winner" testid="mkt-toss" note="Locks at toss">
          <SelBtn label={t1.short} odds={to[t1.short]} disabled={placing} onClick={() => place("toss_winner", t1.short)} testid={`bet-toss-${t1.short}`} />
          <SelBtn label={t2.short} odds={to[t2.short]} disabled={placing} onClick={() => place("toss_winner", t2.short)} testid={`bet-toss-${t2.short}`} />
        </MarketCard>
      )}

      {/* Total Runs (20-over T20 combined total) */}
      <MarketCard title={`20-Over Total Runs (line ${tr.line})`} testid="mkt-tr" note="No cashout · Settles at end">
        <SelBtn label={`Over ${tr.line}`}  odds={tr.over}  disabled={!canBetTotal || placing} onClick={() => place("total_runs", "over")}  testid="bet-tr-over" />
        <SelBtn label={`Under ${tr.line}`} odds={tr.under} disabled={!canBetTotal || placing} onClick={() => place("total_runs", "under")} testid="bet-tr-under" />
      </MarketCard>

      {/* Fancy: Next-ball outcome (only during innings) */}
      <NextBallMarket match={match} placing={placing} onPlace={(sel) => place("next_ball", sel)} />

      {/* Fancy: Over-total lines 6 / 10 / 15 for both innings */}
      <OverRunsMarket match={match} placing={placing} onPlace={(sel) => place("over_runs", sel)} />

      {/* My bets */}
      <div className="card-surface p-4">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">My bets on this match</div>
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {myBets.length === 0 && <div className="text-xs text-slate-500">No bets yet.</div>}
          {myBets.map((b) => (
            <BetRow key={b.id} bet={b} match={match} onCashout={cashout} />
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

function SelBtn({ label, odds, disabled, onClick, testid, move }) {
  const hasOdds = typeof odds === "number" && odds > 1.0;
  return (
    <button
      onClick={onClick}
      disabled={disabled || !hasOdds}
      data-testid={testid}
      className={`rounded-lg px-3 py-3 border text-left transition relative overflow-hidden ${
        disabled || !hasOdds
          ? "border-white/5 bg-white/5 text-slate-500 cursor-not-allowed"
          : "border-cyan-400/40 bg-cyan-500/10 text-slate-100 hover:border-cyan-400/70 hover:bg-cyan-500/15"
      }`}
    >
      <div className="text-xs font-bold flex items-center justify-between">
        <span>{label}</span>
        {move === "up"   && <span data-testid={`odds-up-${testid}`}   className="text-[10px] text-green-400 font-mono">▲</span>}
        {move === "down" && <span data-testid={`odds-down-${testid}`} className="text-[10px] text-red-400 font-mono">▼</span>}
      </div>
      <div className="mt-1 font-mono text-lg font-black text-cyan-300">
        {hasOdds ? `${odds}x` : "—"}
      </div>
    </button>
  );
}


/* ─── Fancy: Next-ball outcome market with 6-sec countdown ring ─── */
const BALL_TICK_SECS = 6;
function NextBallMarket({ match, placing, onPlace }) {
  const open  = match.phase === "innings1" || match.phase === "innings2";
  const odds  = match.odds?.next_ball || {};
  const items = ["0", "1", "2", "3", "4", "6", "W"];

  // Ball timer resets on any score change (indicates a new ball just landed → new ball window opens).
  const battingKey = `${match.batting}-${match.scores?.[match.batting]?.balls || 0}-${match.phase}`;
  const [tick, setTick] = useState(BALL_TICK_SECS);
  useEffect(() => {
    if (!open) return;
    setTick(BALL_TICK_SECS);
    const id = setInterval(() => setTick((t) => (t > 0.1 ? t - 0.1 : 0)), 100);
    return () => clearInterval(id);
  }, [battingKey, open]);

  const pct = open ? Math.max(0, Math.min(1, tick / BALL_TICK_SECS)) : 0;

  return (
    <div className="card-surface p-4" data-testid="mkt-next-ball">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold">Next Ball Outcome</div>
          {open && <CountdownDot pct={pct} secondsLeft={tick} />}
        </div>
        <div className="text-[10px] text-slate-500">{open ? "Locks on next ball · No cashout" : "Open in innings only"}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.map((o) => (
          <NextBallBtn
            key={o}
            label={o === "W" ? "OUT" : `${o} run${o === "1" ? "" : "s"}`}
            odds={odds[o]}
            pct={pct}
            disabled={!open || placing || tick < 0.4}
            onClick={() => onPlace(o)}
            testid={`bet-nb-${o}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Small pill showing remaining seconds until next ball */
function CountdownDot({ pct, secondsLeft }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-yellow-300">
      <span className="relative w-3 h-3">
        <span className="absolute inset-0 rounded-full border border-yellow-500/30" />
        <span className="absolute inset-0 rounded-full border-2 border-yellow-400"
              style={{ clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.sin(2 * Math.PI * pct)}% ${50 - 50 * Math.cos(2 * Math.PI * pct)}%, 50% 50%)` }} />
      </span>
      {secondsLeft.toFixed(1)}s
    </span>
  );
}

/** Full-button variant with a countdown ring drawn on top */
function NextBallBtn({ label, odds, pct, disabled, onClick, testid }) {
  const hasOdds = typeof odds === "number" && odds > 1.0;
  const dashArray = 2 * Math.PI * 18;   // circumference for r=18
  const dashOffset = dashArray * (1 - pct);
  return (
    <button
      onClick={onClick}
      disabled={disabled || !hasOdds}
      data-testid={testid}
      className={`relative rounded-lg px-3 py-3 border text-left transition overflow-hidden ${
        disabled || !hasOdds
          ? "border-white/5 bg-white/5 text-slate-500 cursor-not-allowed"
          : "border-fuchsia-400/40 bg-fuchsia-500/10 text-slate-100 hover:border-fuchsia-400/70"
      }`}
    >
      {/* countdown ring in the top-right corner */}
      {!disabled && hasOdds && (
        <svg viewBox="0 0 40 40" className="absolute top-1.5 right-1.5 w-5 h-5">
          <circle cx="20" cy="20" r="18" stroke="rgba(255,255,255,0.15)" strokeWidth="3" fill="none" />
          <circle
            cx="20" cy="20" r="18"
            stroke={pct > 0.35 ? "#f0abfc" : "#fb7185"}
            strokeWidth="3" fill="none"
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 20 20)"
            style={{ transition: "stroke-dashoffset 100ms linear" }}
          />
        </svg>
      )}
      <div className="text-xs font-bold">{label}</div>
      <div className={`mt-1 font-mono text-lg font-black ${disabled || !hasOdds ? "text-slate-500" : "text-fuchsia-300"}`}>
        {hasOdds ? `${odds}x` : "—"}
      </div>
    </button>
  );
}

/* ─── Fancy: 6 / 10 / 15-over runs lines per innings ─── */
function OverRunsMarket({ match, placing, onPlace }) {
  const groups = match.odds?.over_runs || {};
  const bat = match.batting;
  const innsIdx = match.innings || 0;

  // Filter innings to those with any open cell (user requirement: hide overs already finished)
  const inningsRows = [1, 2].map((inn) => {
    const opens = [6, 10, 15]
      .map((ov) => ({ ov, info: groups[`inn${inn}_o${ov}`] || {} }))
      .filter((c) => !(c.info.closed || c.info.line == null));
    return { inn, opens };
  }).filter((r) => r.opens.length > 0);

  if (inningsRows.length === 0) return null;

  return (
    <div className="card-surface p-4" data-testid="mkt-over-runs">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold">Over-Runs Fancy</div>
        <div className="text-[10px] text-slate-500">Settles when the over ends · No cashout</div>
      </div>
      <div className="space-y-3">
        {inningsRows.map(({ inn, opens }) => (
          <div key={inn}>
            <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">
              Innings {inn}
              {innsIdx === inn && bat && <span className="ml-1 text-yellow-300">· {bat}</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {opens.map(({ ov, info }) => (
                <div key={ov} className="rounded-lg border p-2 text-xs border-white/10">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">O{ov}</div>
                    <div className="font-mono text-yellow-300">{info.line}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => onPlace(`inn${inn}_o${ov}_over`)}
                      disabled={placing}
                      data-testid={`bet-or-inn${inn}-o${ov}-over`}
                      className="py-1.5 rounded text-[10px] font-bold border transition border-cyan-400/40 text-cyan-200 bg-cyan-500/10 hover:border-cyan-400/70"
                    >
                      Over · {info.over}x
                    </button>
                    <button
                      onClick={() => onPlace(`inn${inn}_o${ov}_under`)}
                      disabled={placing}
                      data-testid={`bet-or-inn${inn}-o${ov}-under`}
                      className="py-1.5 rounded text-[10px] font-bold border transition border-fuchsia-400/40 text-fuchsia-200 bg-fuchsia-500/10 hover:border-fuchsia-400/70"
                    >
                      Under · {info.under}x
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Bet row with live cashout preview + expandable details on tap ─── */
function BetRow({ bet, match, onCashout }) {
  const [open, setOpen] = useState(false);
  const isPending = bet.status === "pending";
  const isMW      = bet.market === "match_winner";
  const canCashout = isPending && isMW && match.phase !== "completed";

  // Live odds/line lookups so the user sees CURRENT vs bet-time values
  const currentMwOdds  = isMW ? Number(match.odds?.match_winner?.[bet.selection] || 0) : 0;
  const currentTr      = match.odds?.total_runs || {};
  const currentOr      = bet.market === "over_runs"
    ? (match.odds?.over_runs?.[`inn${bet.innings_target}_o${bet.over_target}`] || {})
    : {};
  const currentNb      = bet.market === "next_ball" ? Number(match.odds?.next_ball?.[bet.selection] || 0) : 0;

  let cashoutValue = null;
  let inProfit = null;
  if (canCashout && currentMwOdds > 1.0) {
    cashoutValue = Number(bet.amount) * Number(bet.odds_taken) / currentMwOdds;
    inProfit = cashoutValue > Number(bet.amount);
  }

  const statusLabel = { won: "WON", lost: "LOST", cashed_out: "CASHED OUT", pending: "PENDING" }[bet.status] || bet.status;
  const statusCls   = { won: "text-green-300", lost: "text-red-300", cashed_out: "text-cyan-300", pending: "text-slate-400" }[bet.status] || "text-slate-400";

  const marketPretty = {
    match_winner: "Match Winner",
    toss_winner:  "Toss Winner",
    total_runs:   "20-Over Total Runs",
    over_runs:    `Over ${bet.over_target}-run (Inn ${bet.innings_target})`,
    next_ball:    "Next Ball",
  }[bet.market] || bet.market;

  const selectionPretty = bet.market === "over_runs"
    ? `${bet.ou?.toUpperCase()} ${bet.line}`
    : bet.market === "total_runs"
      ? `${bet.selection?.toUpperCase()} ${bet.line}`
      : bet.market === "next_ball"
        ? (bet.selection === "W" ? "OUT / Wicket" : `${bet.selection} run${bet.selection === "1" ? "" : "s"}`)
        : bet.selection;

  return (
    <div
      className={`text-xs border border-white/5 rounded-lg bg-white/5 ${isPending ? "cursor-pointer hover:border-white/15" : ""}`}
      data-testid={`bet-row-${bet.id}`}
      onClick={() => isPending && setOpen((v) => !v)}
    >
      <div className="p-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono truncate">
            {marketPretty} · <span className="text-yellow-300">{selectionPretty}</span> @ {bet.odds_taken}x
          </div>
          <div className="text-[10px] text-slate-400">Stake ₹{bet.amount} · Potential ₹{bet.potential_payout}</div>
        </div>
        <div className="text-right shrink-0" onClick={(e) => e.stopPropagation()}>
          {canCashout && cashoutValue !== null ? (
            <button
              onClick={() => onCashout(bet.id)}
              data-testid={`cashout-${bet.id}`}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition
                ${inProfit
                  ? "border-green-400/60 bg-green-500/15 text-green-200 hover:bg-green-500/25"
                  : "border-red-400/60 bg-red-500/15 text-red-200 hover:bg-red-500/25"}`}
              title={inProfit ? "In profit — take the win" : "Loss — cash out to reduce risk"}
            >
              <div className="text-[9px] uppercase tracking-widest opacity-80">
                {inProfit ? "Profit · cash out" : "Loss · cash out"}
              </div>
              <div className="font-mono">₹{cashoutValue.toFixed(2)}</div>
            </button>
          ) : (
            <span className={`text-[10px] uppercase tracking-widest font-bold ${statusCls}`}>
              {statusLabel}
              {bet.status === "won"        && bet.payout != null && ` +₹${Number(bet.payout).toFixed(2)}`}
              {bet.status === "cashed_out" && bet.payout != null && ` ₹${Number(bet.payout).toFixed(2)}`}
              {bet.status === "lost"       && ` -₹${Number(bet.amount).toFixed(2)}`}
            </span>
          )}
        </div>
      </div>

      {/* Expanded details for pending bets — user requested visibility of captured odds/line vs live */}
      {open && isPending && (
        <div className="border-t border-white/10 px-3 py-2 space-y-1.5" data-testid={`bet-detail-${bet.id}`}>
          <DetailRow k="Market" v={marketPretty} />
          <DetailRow k="Selection" v={selectionPretty} />
          {bet.line != null && <DetailRow k="Line at bet" v={String(bet.line)} highlight />}
          <DetailRow k="Odds at bet" v={`${bet.odds_taken}x`} highlight />
          {isMW && currentMwOdds > 0 && (
            <DetailRow
              k="Live odds now"
              v={`${currentMwOdds.toFixed(2)}x`}
              trend={currentMwOdds < bet.odds_taken ? "up" : currentMwOdds > bet.odds_taken ? "down" : null}
              hint={currentMwOdds < bet.odds_taken ? "Your side stronger" : currentMwOdds > bet.odds_taken ? "Your side weaker" : null}
            />
          )}
          {bet.market === "over_runs" && currentOr.line != null && (
            <DetailRow k="Live line now" v={String(currentOr.line)}
              trend={
                bet.ou === "over"
                  ? (currentOr.line < bet.line ? "up" : currentOr.line > bet.line ? "down" : null)
                  : (currentOr.line > bet.line ? "up" : currentOr.line < bet.line ? "down" : null)
              } />
          )}
          {bet.market === "total_runs" && currentTr.line != null && (
            <DetailRow k="Live match line" v={String(currentTr.line)} />
          )}
          {bet.market === "next_ball" && currentNb > 0 && (
            <DetailRow k="Live odds now" v={`${currentNb.toFixed(2)}x`} />
          )}
          <DetailRow k="Placed" v={new Date(bet.created_at).toLocaleTimeString()} />
          <div className="text-[10px] text-slate-500 pt-1">
            Tip: green ↑ means your position improved · red ↓ means it's slipping
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ k, v, highlight, trend, hint }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-400">{k}</span>
      <span className={`font-mono ${highlight ? "text-yellow-300 font-bold" : "text-slate-100"} flex items-center gap-1`}>
        {v}
        {trend === "up"   && <span className="text-green-400">↑</span>}
        {trend === "down" && <span className="text-red-400">↓</span>}
        {hint && <span className="text-[9px] uppercase tracking-widest text-slate-500 ml-1">{hint}</span>}
      </span>
    </div>
  );
}
