import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Timer, X, TrendingUp, History, RotateCcw, Trophy, Undo2, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CHIP_VALUES, colorOf, isSplitAllowed, isCornerAllowed, profitMultClient, isWinnerClient, labelForBet } from "@/lib/roulette";
import { rouletteTables } from "@/pages/RouletteLobby";
import RouletteWheel from "@/components/RouletteWheel";
import RouletteTableGrid from "@/components/RouletteTableGrid";

const POLL_MS = 700;

export default function RouletteGame() {
  const { tableId } = useParams();
  const table = rouletteTables.find((t) => t.id === tableId);
  const { user, refresh } = useAuth();

  const [state, setState] = useState(null);          // {phase, phase_end, result_number, history, ...}
  const [bets, setBets] = useState({});              // roundId -> {betKey: amount}
  const [chip, setChip] = useState(50);
  const [showResult, setShowResult] = useState(null); // {number, netProfit}
  const [myBets, setMyBets] = useState([]);           // current round bets from server
  const [mode, setMode] = useState("straight");       // straight | split | corner
  const [selectedNums, setSelectedNums] = useState([]);
  const [showRules, setShowRules] = useState(false);
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
  const isBetting = phase === "betting";
  const totalStake = Object.values(bets).reduce((s, v) => s + v, 0);
  const balance = user?.balance ?? 0;

  const placeBet = async (betKey) => {
    if (!isBetting) return;
    if (chip <= 0) return;
    if (chip > balance) {
      toast.error("Insufficient balance");
      return;
    }
    // Do NOT set `placing` — allow spam-clicking multiple bets in quick succession.
    // Optimistically update local chip stack; server request runs in background.
    setBets((prev) => ({ ...prev, [betKey]: (prev[betKey] || 0) + chip }));
    try {
      await api.post("/roulette/bet", { bet_type: betKey, amount: chip });
      refresh?.();
      loadMyBets();
    } catch (e) {
      // Rollback optimistic stack on failure
      setBets((prev) => {
        const next = { ...prev };
        const back = (next[betKey] || 0) - chip;
        if (back > 0) next[betKey] = back;
        else delete next[betKey];
        return next;
      });
      toast.error(formatApiError(e));
    }
  };

  // In split/corner modes, collect numbers and place when the combo is valid.
  const handleNumberSelect = (n) => {
    if (!isBetting) return;
    if (mode === "split") {
      if (selectedNums.length === 0) {
        setSelectedNums([n]);
      } else {
        const first = selectedNums[0];
        if (first === n) {
          setSelectedNums([]);
          return;
        }
        if (!isSplitAllowed(first, n)) {
          toast.error("Split must be two ADJACENT numbers on the table");
          setSelectedNums([]);
          return;
        }
        const [a, b] = [first, n].sort((x, y) => x - y);
        placeBet(`split_${a}_${b}`);
        setSelectedNums([]);
      }
    } else if (mode === "corner") {
      const next = selectedNums.includes(n)
        ? selectedNums.filter((x) => x !== n)
        : [...selectedNums, n];
      if (next.length === 4) {
        if (!isCornerAllowed(next)) {
          toast.error("Corner must be four numbers forming a square (e.g. 1·2·4·5)");
          setSelectedNums([]);
          return;
        }
        const sorted = [...next].sort((a, b) => a - b);
        placeBet(`corner_${sorted.join("_")}`);
        setSelectedNums([]);
      } else {
        setSelectedNums(next);
      }
    }
  };

  // Undo the LAST placed bet in this round (LIFO stack — removes 10 → 9 → 8 → …).
  const undoLastBet = async () => {
    if (!isBetting) return;
    if (myBets.length === 0) {
      toast.info("No bets to undo");
      return;
    }
    // Newest bet = highest created_at
    const sorted = [...myBets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const last = sorted[0];
    try {
      await api.delete(`/roulette/bet/${last.id}`);
      // Decrement local chip stack for this bet_type by the exact amount
      setBets((prev) => {
        const next = { ...prev };
        const remaining = (next[last.bet_type] || 0) - last.amount;
        if (remaining > 0) next[last.bet_type] = remaining;
        else delete next[last.bet_type];
        return next;
      });
      refresh?.();
      loadMyBets();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  // Remove ALL bets on a given key during betting phase (called when user clicks a chip).
  const removeBetKey = async (betKey) => {
    if (!isBetting) return;
    const matching = myBets.filter((b) => b.bet_type === betKey);
    if (matching.length === 0) return;
    try {
      await Promise.all(matching.map((m) => api.delete(`/roulette/bet/${m.id}`)));
      setBets((prev) => {
        const next = { ...prev };
        delete next[betKey];
        return next;
      });
      refresh?.();
      loadMyBets();
      toast.success(`Removed ${matching.length > 1 ? matching.length + " bets" : "bet"}`);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const clearLocalOnly = () => {
    setSelectedNums([]);
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRules(true)}
            data-testid="open-rules-btn"
            title="Payout rules"
            className="chip !text-cyan-300 hover:!bg-cyan-500/20 !border-cyan-400/40 text-[11px]"
          >
            <HelpCircle className="w-3.5 h-3.5" /> Rules
          </button>
          <div className="text-right text-[11px]">
            <div className="text-slate-400">Balance</div>
            <div className="font-mono font-bold text-cyan-300" data-testid="game-balance">₹{balance.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Timer + phase status (top-left of table area) */}
      <div className="flex items-center justify-between gap-2">
        <PhaseTimer phase={phase} phaseEnd={state?.phase_end} />
        <RecentResults history={state?.history || []} />
      </div>

      {/* Live winners ticker (last round) */}
      <WinnersTicker winners={state?.winners || []} />

      {/* Wheel + betting stake. Layout swaps between compact (betting) and focused (spin/result). */}
      <div className={`grid gap-4 items-start ${isBetting ? "md:grid-cols-[auto_1fr]" : "grid-cols-1"}`}>
        <div className={`card-surface p-3 md:p-4 flex flex-col items-center gap-2 ${!isBetting ? "md:mx-auto" : ""}`}>
          <RouletteWheel
            resultNumber={phase === "betting" ? null : state?.result_number}
            spinning={phase === "spinning"}
            lastResultNumber={state?.history?.[0]?.number ?? null}
          />
          <div className="mt-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Round Stake</div>
            <div className="font-mono font-bold text-lg" data-testid="round-stake">₹{totalStake.toFixed(2)}</div>
          </div>
          {isBetting && (
            <button
              onClick={undoLastBet}
              disabled={myBets.length === 0}
              data-testid="undo-bet-btn-wheel"
              title={myBets.length === 0 ? "No bets to undo" : `Undo last bet — ${myBets.length} in stack`}
              className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-400 text-black font-heading font-bold text-xs border-2 border-yellow-200 shadow-[0_0_20px_rgba(250,204,21,0.45)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:bg-black/40 disabled:text-slate-400 disabled:border-white/15"
            >
              <Undo2 className="w-4 h-4" />
              <span>Undo last bet</span>
              {myBets.length > 0 && (
                <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-black text-yellow-300 text-[10px] font-black grid place-items-center border border-yellow-200">
                  {myBets.length}
                </span>
              )}
            </button>
          )}
          {!isBetting && (
            <div className="text-[10px] uppercase tracking-widest text-slate-400 mt-1" data-testid="minimized-note">
              Bets locked — table hidden. Reopens next round.
            </div>
          )}
        </div>

        {/* Betting UI — auto-minimized when bets are locked, expanded when betting is open */}
        <AnimatePresence initial={false}>
          {isBetting && (
            <motion.div
              key="betting-ui"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="space-y-3 overflow-hidden"
              data-testid="betting-ui-wrap"
            >
              <RouletteTableGrid
                bets={bets}
                onPlace={placeBet}
                onNumberSelect={handleNumberSelect}
                onRemoveBetKey={removeBetKey}
                disabled={!isBetting}
                resultNumber={phase === "result" ? state?.result_number : null}
                mode={mode}
                selectedNums={selectedNums}
              />

              {/* Bet mode selector */}
              <BetModeSelector
                mode={mode}
                onChange={(m) => { setMode(m); setSelectedNums([]); }}
                selectedNums={selectedNums}
                onCancelSelection={() => setSelectedNums([])}
              />

              {/* Chip selector + Undo */}
              <div className="card-surface p-3 md:p-4">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Chip Size</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={undoLastBet}
                      disabled={myBets.length === 0}
                      data-testid="undo-bet-btn"
                      title={myBets.length === 0 ? "No bets to undo" : `Undo last bet (${myBets.length} in stack)`}
                      className="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-yellow-400 text-black font-heading font-bold text-xs border-2 border-yellow-200 shadow-[0_0_15px_rgba(250,204,21,0.4)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:bg-black/40 disabled:text-slate-300 disabled:border-white/15"
                    >
                      <Undo2 className="w-4 h-4" />
                      <span>Undo</span>
                      {myBets.length > 0 && (
                        <span className="ml-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-black text-yellow-300 text-[10px] font-black grid place-items-center border border-yellow-200">
                          {myBets.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={clearLocalOnly}
                      disabled={totalStake === 0}
                      data-testid="clear-chips-btn"
                      className="chip !text-slate-300 hover:!text-white text-[10px] disabled:opacity-40"
                    >
                      <RotateCcw className="w-3 h-3" /> Clear view
                    </button>
                  </div>
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
                  <div className="chip !bg-green-500/10 !border-green-400/40 !text-green-300 text-[10px] uppercase ml-auto">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Place Bets
                  </div>
                </div>
              </div>

              {/* My bets summary */}
              <MyBetsSummary bets={myBets} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Rules modal */}
      <RulesModal open={showRules} onClose={() => setShowRules(false)} />

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

function PhaseTimer({ phase, phaseEnd }) {
  // Isolated timer: ticks locally so parent (game + wheel) don't re-render every 200ms.
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!phaseEnd) return;
    const compute = () => {
      const s = Math.max(0, Math.ceil((new Date(phaseEnd).getTime() - Date.now()) / 1000));
      setSeconds(s);
    };
    compute();
    const id = setInterval(compute, 250);
    return () => clearInterval(id);
  }, [phaseEnd]);

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

function RulesModal({ open, onClose }) {
  if (!open) return null;
  const rules = [
    { name: "Straight (1 number)",     example: "Any digit 0–36",            payout: "35 : 1", ret: "₹50 → ₹1,800 total" },
    { name: "Split (2 numbers)",       example: "Adjacent pair, e.g. 0 & 1", payout: "17 : 1", ret: "₹50 → ₹900 total" },
    { name: "Street (3 numbers)",      example: "Only 0·1·2 and 0·2·3",       payout: "11 : 1", ret: "₹50 → ₹600 total" },
    { name: "Corner (4 numbers)",      example: "Square, e.g. 1·2·4·5",       payout: "8 : 1",  ret: "₹50 → ₹450 total" },
    { name: "Dozen (12 numbers)",      example: "1st 12 / 2nd 12 / 3rd 12",   payout: "3 : 1",  ret: "₹50 → ₹200 total" },
    { name: "Red / Black",             example: "Colour of winning number",   payout: "1 : 1",  ret: "₹50 → ₹100 total" },
    { name: "Even / Odd",              example: "Parity (0 loses)",           payout: "1 : 1",  ret: "₹50 → ₹100 total" },
    { name: "Low / High",              example: "1–18 or 19–36 (0 loses)",    payout: "1 : 1",  ret: "₹50 → ₹100 total" },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      data-testid="rules-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface p-5 md:p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-cyan-300">Payout Rules</div>
            <h2 className="font-heading text-lg md:text-xl font-black">European Roulette</h2>
          </div>
          <button
            onClick={onClose}
            data-testid="close-rules-btn"
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.name} className="flex items-start justify-between gap-3 bg-black/40 border border-white/10 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-heading font-bold text-white">{r.name}</div>
                <div className="text-[11px] text-slate-400">{r.example}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-mono font-bold text-yellow-300">{r.payout}</div>
                <div className="text-[10px] text-slate-500">{r.ret}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-[11px] text-slate-400 space-y-1">
          <div>• Round: <span className="text-white">20s betting</span> → <span className="text-white">10s spin</span> → <span className="text-white">1s result</span>.</div>
          <div>• On <span className="text-emerald-300">0</span> (green), only straight-0 (and streets 0·1·2 / 0·2·3, split 0-1/0-2/0-3) win. All other outside bets lose.</div>
          <div>• Chip on a bet? Tap it to remove. Or use the <span className="text-yellow-300">Undo</span> button to pop your last bet.</div>
        </div>

        <button
          onClick={onClose}
          data-testid="rules-got-it"
          className="mt-4 w-full btn-primary text-sm py-2"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function BetModeSelector({ mode, onChange, selectedNums, onCancelSelection }) {
  const modes = [
    { key: "straight", label: "Straight", payout: "35:1" },
    { key: "split", label: "Split", payout: "17:1" },
    { key: "corner", label: "Corner", payout: "8:1" },
  ];
  const hint =
    mode === "split"
      ? selectedNums.length === 0
        ? "Split mode: tap the 1st number, then an adjacent 2nd."
        : `Split mode: tap an adjacent number to #${selectedNums[0]}.`
      : mode === "corner"
      ? `Corner mode: tap 4 numbers forming a square (${selectedNums.length}/4)`
      : "Straight mode: tap any number to place a chip.";
  return (
    <div className="card-surface p-3 md:p-4" data-testid="bet-mode-selector">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-400">Bet Mode</div>
        {selectedNums.length > 0 && (
          <button
            onClick={onCancelSelection}
            data-testid="cancel-selection"
            className="chip !bg-red-500/10 !border-red-400/40 !text-red-300 text-[10px] uppercase"
          >
            <X className="w-3 h-3" /> Cancel selection
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => onChange(m.key)}
            data-testid={`mode-${m.key}`}
            className={`px-3 py-2 rounded-full font-heading font-bold text-xs md:text-sm border-2 transition-all ${
              mode === m.key
                ? "bg-cyan-400 text-black border-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.5)]"
                : "bg-black/40 text-slate-200 border-white/15 hover:border-cyan-400/50"
            }`}
          >
            {m.label} · {m.payout}
          </button>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-slate-400" data-testid="mode-hint">{hint}</div>
    </div>
  );
}

function WinnersTicker({ winners = [] }) {
  if (winners.length === 0) return null;
  return (
    <div className="card-surface p-3" data-testid="winners-ticker">
      <div className="flex items-center gap-1 mb-2">
        <Trophy className="w-3.5 h-3.5 text-yellow-300" />
        <div className="text-[10px] uppercase tracking-wider text-yellow-300 font-bold">
          Last Round Winners
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {winners.slice(0, 8).map((w, i) => (
          <div
            key={`${w.round_id}-${w.name}-${i}`}
            data-testid={`winner-item-${i}`}
            className="shrink-0 flex items-center gap-2 bg-black/40 border border-yellow-400/30 rounded-lg px-3 py-1.5"
          >
            <span className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse" />
            <div>
              <div className="text-[11px] font-bold text-white truncate max-w-[110px]">{w.name}</div>
              <div className="text-[10px] text-yellow-200 font-mono font-bold">
                +₹{Number(w.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
