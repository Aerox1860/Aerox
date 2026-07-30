import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Timer, Coins, X, TrendingUp, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CHIP_VALUES, BET_LABELS, colorOf } from "@/lib/roulette";
import { rouletteTables } from "@/pages/RouletteLobby";
import RouletteWheel from "@/components/RouletteWheel";
import RouletteTableGrid from "@/components/RouletteTableGrid";

const POLL_MS = 700;

export default function RouletteGame() {
  const { tableId } = useParams();
  const table = rouletteTables.find((t) => t.id === tableId);
  const { user, refresh } = useAuth();

  const [state, setState] = useState(null);          // {phase, phase_end, result_number, history, ...}
  const [now, setNow] = useState(Date.now());        // ticks each 200ms for the timer
  const [bets, setBets] = useState({});              // roundId -> {betKey: amount}
  const [chip, setChip] = useState(50);
  const [placing, setPlacing] = useState(false);
  const [showResult, setShowResult] = useState(null); // {number, netProfit}
  const [myBets, setMyBets] = useState([]);           // current round bets from server
  const myBetsRef = useRef([]);
  const lastResultRoundRef = useRef(null);
  const lastPhaseRef = useRef(null);
  useEffect(() => { myBetsRef.current = myBets; }, [myBets]);

  // ---- Poll engine state ----
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { data } = await api.get("/roulette/state");
        if (alive) setState(data);
      } catch { /* ignore transient */ }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ---- Local timer ticker ----
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  // ---- Fetch my bets for current round ----
  const loadMyBets = useCallback(async () => {
    try {
      const { data } = await api.get("/roulette/my-bets");
      setMyBets(data.current || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!state?.round_id) return;
    loadMyBets();
  }, [state?.round_id, loadMyBets]);

  // ---- Detect round transitions: reset local bets on new betting phase, show popup on result ----
  useEffect(() => {
    if (!state) return;
    const prev = lastPhaseRef.current;
    lastPhaseRef.current = state.phase;

    if (state.phase === "betting" && prev !== "betting") {
      // new round started — clear local bets
      setBets({});
      setMyBets([]);
    }

    if (state.phase === "result" && state.result_number != null &&
        lastResultRoundRef.current !== state.round_id) {
      lastResultRoundRef.current = state.round_id;
      const num = state.result_number;
      const roundBets = myBetsRef.current;
      let net = 0;
      roundBets.forEach((b) => {
        const won = isWinnerClient(b.bet_type, num);
        const mult = profitMultClient(b.bet_type);
        net += won ? b.amount * mult : -b.amount;
      });
      setShowResult({ number: num, netProfit: net, hasBets: roundBets.length > 0 });
      refresh?.();
      // auto-close after 1s (result phase is 1s)
      setTimeout(() => setShowResult(null), 1000);
    }
  }, [state, refresh]);

  if (!table) return <Navigate to="/games/roulette" replace />;

  const phase = state?.phase || "betting";
  const secondsLeft = state?.phase_end
    ? Math.max(0, Math.ceil((new Date(state.phase_end).getTime() - now) / 1000))
    : 0;
  const isBetting = phase === "betting";
  const totalStake = Object.values(bets).reduce((s, v) => s + v, 0);
  const balance = user?.balance ?? 0;

  const placeBet = async (betKey) => {
    if (!isBetting || placing) return;
    if (chip <= 0) return;
    if (chip > balance) {
      toast.error("Insufficient balance");
      return;
    }
    setPlacing(true);
    try {
      await api.post("/roulette/bet", { bet_type: betKey, amount: chip });
      setBets((prev) => ({ ...prev, [betKey]: (prev[betKey] || 0) + chip }));
      refresh?.();
      loadMyBets();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setPlacing(false);
    }
  };

  const clearLocalOnly = () => {
    // (bets already placed on server can't be undone — this just resets the chip stack UI)
    setBets({});
  };

  return (
    <div className="space-y-4" data-testid={`roulette-game-${table.id}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/games/roulette"
          data-testid="back-to-roulette-lobby"
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Lobby
        </Link>
        <div className="text-center">
          <div className="font-heading text-lg md:text-xl font-black leading-tight">{table.name}</div>
          <div className={`text-[10px] uppercase ${table.accent}`}>{table.tagline}</div>
        </div>
        <div className="text-right text-[11px]">
          <div className="text-slate-400">Balance</div>
          <div className="font-mono font-bold text-cyan-300" data-testid="game-balance">₹{balance.toFixed(2)}</div>
        </div>
      </div>

      {/* Timer + phase status (top-left of table area) */}
      <div className="flex items-center justify-between gap-2">
        <PhaseTimer phase={phase} seconds={secondsLeft} />
        <RecentResults history={state?.history || []} />
      </div>

      {/* Wheel + betting stake */}
      <div className="grid md:grid-cols-[auto_1fr] gap-4 items-start">
        <div className="card-surface p-3 md:p-4 flex flex-col items-center gap-2">
          <RouletteWheel
            resultNumber={phase === "betting" ? null : state?.result_number}
            spinning={phase === "spinning"}
          />
          <div className="mt-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Round Stake</div>
            <div className="font-mono font-bold text-lg" data-testid="round-stake">₹{totalStake.toFixed(2)}</div>
          </div>
        </div>

        <div className="space-y-3">
          <RouletteTableGrid
            bets={bets}
            onPlace={placeBet}
            disabled={!isBetting || placing}
            resultNumber={phase === "result" ? state?.result_number : null}
          />

          {/* Chip selector */}
          <div className="card-surface p-3 md:p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Chip Size</div>
              <button
                onClick={clearLocalOnly}
                disabled={!isBetting || totalStake === 0}
                data-testid="clear-chips-btn"
                className="chip !text-slate-300 hover:!text-white text-[10px] disabled:opacity-40"
              >
                <RotateCcw className="w-3 h-3" /> Clear view
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {CHIP_VALUES.map((v) => (
                <button
                  key={v}
                  onClick={() => setChip(v)}
                  data-testid={`chip-${v}`}
                  className={`px-3 py-2 rounded-full font-heading font-bold text-xs md:text-sm border-2 transition-all ${
                    chip === v
                      ? "bg-yellow-400 text-black border-yellow-200 shadow-[0_0_15px_rgba(250,204,21,0.5)]"
                      : "bg-black/40 text-slate-200 border-white/15 hover:border-yellow-400/50"
                  }`}
                >
                  ₹{v}
                </button>
              ))}
              {!isBetting && (
                <div className="chip !bg-red-500/10 !border-red-400/40 !text-red-300 text-[10px] uppercase ml-auto">
                  Betting Closed
                </div>
              )}
              {isBetting && (
                <div className="chip !bg-green-500/10 !border-green-400/40 !text-green-300 text-[10px] uppercase ml-auto">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Place Bets
                </div>
              )}
            </div>
          </div>

          {/* My bets summary */}
          <MyBetsSummary bets={myBets} />
        </div>
      </div>

      {/* Result popup */}
      <AnimatePresence>
        {showResult && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="roulette-result-popup"
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="card-surface p-6 md:p-8 max-w-sm w-full text-center relative"
            >
              <button
                onClick={() => setShowResult(null)}
                data-testid="close-result-popup"
                className="absolute top-2 right-2 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="text-[10px] uppercase tracking-widest text-slate-400">Result</div>
              <div
                className={`mx-auto my-4 w-20 h-20 rounded-full grid place-items-center font-heading text-4xl font-black text-white ${
                  colorOf(showResult.number) === "green"
                    ? "bg-emerald-600"
                    : colorOf(showResult.number) === "red"
                    ? "bg-red-600"
                    : "bg-black border border-white/40"
                }`}
                style={{ boxShadow: "0 0 30px rgba(0,0,0,0.6)" }}
              >
                {showResult.number}
              </div>
              <div className="font-heading text-lg font-bold capitalize">
                {colorOf(showResult.number)} · {showResult.number === 0
                  ? "Zero"
                  : showResult.number % 2 === 0 ? "Even" : "Odd"}
              </div>
              {showResult.hasBets ? (
                <div
                  className={`mt-3 font-mono font-black text-2xl ${
                    showResult.netProfit > 0
                      ? "text-green-400"
                      : showResult.netProfit < 0
                      ? "text-red-400"
                      : "text-slate-300"
                  }`}
                  data-testid="result-net"
                >
                  {showResult.netProfit > 0 ? "+" : ""}₹{showResult.netProfit.toFixed(2)}
                </div>
              ) : (
                <div className="mt-3 text-slate-400 text-sm">You didn&apos;t bet this round.</div>
              )}
              <div className="mt-3 text-[10px] text-slate-500">Next round starting…</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PhaseTimer({ phase, seconds }) {
  // If betting timer has hit 0 but server hasn't reported "spinning" yet, show a transitional label
  const effectivePhase = phase === "betting" && seconds === 0 ? "spinning" : phase;
  const label = effectivePhase === "betting" ? "Place Bets" : effectivePhase === "spinning" ? "Spinning…" : "Result";
  const color =
    effectivePhase === "betting"
      ? "text-green-300 border-green-400/50 bg-green-500/10"
      : effectivePhase === "spinning"
      ? "text-yellow-300 border-yellow-400/50 bg-yellow-500/10"
      : "text-red-300 border-red-400/50 bg-red-500/10";
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${color}`}
      data-testid="phase-timer"
    >
      <Timer className="w-4 h-4" />
      <div>
        <div className="text-[9px] uppercase tracking-widest leading-none opacity-80">{label}</div>
        {effectivePhase === "spinning" ? (
          <div className="font-mono font-black text-lg leading-tight flex items-center gap-1" data-testid="phase-seconds">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse" />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse" style={{ animationDelay: "0.2s" }} />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
        ) : (
          <div className="font-mono font-black text-lg leading-tight" data-testid="phase-seconds">
            {String(seconds).padStart(2, "0")}s
          </div>
        )}
      </div>
    </div>
  );
}

function RecentResults({ history }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto max-w-full" data-testid="recent-results">
      <History className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      {history.slice(0, 12).map((h, i) => (
        <div
          key={`${h.round_id}-${i}`}
          className={`w-7 h-7 rounded-full grid place-items-center font-mono font-bold text-[11px] shrink-0 ${
            h.color === "green"
              ? "bg-emerald-600 text-white"
              : h.color === "red"
              ? "bg-red-600 text-white"
              : "bg-black text-white border border-white/30"
          }`}
        >
          {h.number}
        </div>
      ))}
      {history.length === 0 && <span className="text-[10px] text-slate-500">No history yet</span>}
    </div>
  );
}

function MyBetsSummary({ bets }) {
  const total = bets.reduce((s, b) => s + b.amount, 0);
  if (bets.length === 0) {
    return (
      <div className="card-surface p-3 text-center text-xs text-slate-500" data-testid="my-bets-empty">
        Place a bet to see it here.
      </div>
    );
  }
  return (
    <div className="card-surface p-3" data-testid="my-bets-list">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> Your Bets ({bets.length})
        </div>
        <div className="text-xs font-mono font-bold text-yellow-300">₹{total.toFixed(2)}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
        {bets.map((b) => (
          <div key={b.id} className="flex items-center justify-between text-[11px] bg-black/30 rounded px-2 py-1 border border-white/5">
            <span className="truncate">{labelForBet(b.bet_type)}</span>
            <span className="font-mono font-bold text-yellow-200">₹{b.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function labelForBet(bt) {
  if (bt.startsWith("straight_")) return `#${bt.split("_")[1]}`;
  return BET_LABELS[bt] || bt;
}

// Client-side mirror of backend rules (used to compute popup profit instantly).
function isWinnerClient(bt, num) {
  if (bt.startsWith("straight_")) return parseInt(bt.split("_")[1], 10) === num;
  if (num === 0) return false;
  if (bt === "red") return colorOf(num) === "red";
  if (bt === "black") return colorOf(num) === "black";
  if (bt === "even") return num % 2 === 0;
  if (bt === "odd") return num % 2 === 1;
  if (bt === "low") return num >= 1 && num <= 18;
  if (bt === "high") return num >= 19 && num <= 36;
  if (bt === "dozen_1") return num >= 1 && num <= 12;
  if (bt === "dozen_2") return num >= 13 && num <= 24;
  if (bt === "dozen_3") return num >= 25 && num <= 36;
  return false;
}

function profitMultClient(bt) {
  if (bt.startsWith("straight_")) return 35;
  if (bt.startsWith("dozen_")) return 3;
  return 1;
}
