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
