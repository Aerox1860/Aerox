import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Timer, X, TrendingUp, History, Trophy, Undo2, HelpCircle, ClipboardList, Coins } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CHIP_VALUES, colorOf, profitMultClient, isWinnerClient, labelForBet } from "@/lib/roulette";
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
  const [showRules, setShowRules] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
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
    // Optimistic local update: bump chip stack AND add to myBets for instant undo-count feedback.
    setBets((prev) => ({ ...prev, [betKey]: (prev[betKey] || 0) + chip }));
    try {
      const { data } = await api.post("/roulette/bet", { bet_type: betKey, amount: chip });
      // Append to myBets so the Undo counter (which reads myBets.length) reflects it immediately.
      setMyBets((prev) => [
        ...prev,
        {
          id: data.bet_id,
          bet_type: betKey,
          amount: chip,
          created_at: new Date().toISOString(),
          status: "pending",
        },
      ]);
      refresh?.();
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

  // Split/corner bets are placed via SVG hotspots on the table (handled by RouletteTableGrid).

  // Undo the LAST placed bet in this round (LIFO stack — removes 10 → 9 → 8 → …).
  const undoLastBet = async () => {
    if (!isBetting) return;
    if (myBets.length === 0) {
      toast.info("No bets to undo");
      return;
    }
    // Newest bet = highest created_at (works for both straight & outside bets, all types)
    const sorted = [...myBets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const last = sorted[0];
    // Optimistically remove from local myBets + chip stack
    setMyBets((prev) => prev.filter((b) => b.id !== last.id));
    setBets((prev) => {
      const next = { ...prev };
      const remaining = (next[last.bet_type] || 0) - last.amount;
      if (remaining > 0) next[last.bet_type] = remaining;
      else delete next[last.bet_type];
      return next;
    });
    try {
      await api.delete(`/roulette/bet/${last.id}`);
      refresh?.();
    } catch (e) {
      // Rollback on failure — put the bet back
      setMyBets((prev) => [...prev, last]);
      setBets((prev) => ({ ...prev, [last.bet_type]: (prev[last.bet_type] || 0) + last.amount }));
      toast.error(formatApiError(e));
    }
  };

  // Remove ALL bets on a given key during betting phase (called when user clicks a chip).
  const removeBetKey = async (betKey) => {
    if (!isBetting) return;
    const matching = myBets.filter((b) => b.bet_type === betKey);
    if (matching.length === 0) return;
    // Optimistic remove
    setMyBets((prev) => prev.filter((b) => b.bet_type !== betKey));
    setBets((prev) => {
      const next = { ...prev };
      delete next[betKey];
      return next;
    });
    try {
      await Promise.all(matching.map((m) => api.delete(`/roulette/bet/${m.id}`)));
      refresh?.();
      toast.success(`Removed ${matching.length > 1 ? matching.length + " bets" : "bet"}`);
    } catch (e) {
      // Rollback: put matching bets back
      setMyBets((prev) => [...prev, ...matching]);
      const total = matching.reduce((s, m) => s + m.amount, 0);
      setBets((prev) => ({ ...prev, [betKey]: (prev[betKey] || 0) + total }));
      toast.error(formatApiError(e));
    }
  };

  const openHistory = async () => {
    setShowHistory(true);
    setLoadingHistory(true);
    try {
      const { data } = await api.get("/roulette/my-history?hours=24");
      setHistoryRows(data.history || []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoadingHistory(false);
    }
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
            onClick={openHistory}
            data-testid="open-game-history-btn"
            title="Last 24 hours of game bets"
            className="chip !text-yellow-300 hover:!bg-yellow-500/20 !border-yellow-400/40 text-[11px]"
          >
            <ClipboardList className="w-3.5 h-3.5" /> History
          </button>
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

      {/* SEQUENTIAL layout: betting-only when placing bets, wheel-only when spinning/showing result.
          Never side-by-side — chosen for mobile-first tap-friendliness. */}
      <AnimatePresence mode="wait" initial={false}>
        {!isBetting && (
          <motion.div
            key="wheel-only"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className="card-surface p-3 md:p-4 flex flex-col items-center gap-2 mx-auto max-w-md"
            data-testid="wheel-only-view"
          >
            <RouletteWheel
              resultNumber={state?.result_number}
              spinning={phase === "spinning"}
              lastResultNumber={state?.history?.[0]?.number ?? null}
            />
            <div className="mt-2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Round Stake</div>
              <div className="font-mono font-bold text-lg" data-testid="round-stake">₹{totalStake.toFixed(2)}</div>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400 mt-1" data-testid="minimized-note">
              Bets locked — betting board reopens next round.
            </div>
          </motion.div>
        )}

        {isBetting && (
          <motion.div
            key="betting-only"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-3"
            data-testid="betting-ui-wrap"
          >
            {/* Two-column: vertical table on left, sidebar controls on right */}
            <div className="flex gap-2 items-start justify-center" data-testid="table-sidebar-wrap">
              <div className="shrink-0">
                <RouletteTableGrid
                  bets={bets}
                  onPlace={placeBet}
                  disabled={!isBetting}
                  resultNumber={null}
                />
              </div>

              {/* Sidebar: chip picker + undo + outside bets + stake */}
              <BetSidebar
                bets={bets}
                chip={chip}
                setChip={setChip}
                onPlace={placeBet}
                onUndo={undoLastBet}
                undoCount={myBets.length}
                totalStake={totalStake}
                disabled={!isBetting}
              />
            </div>

            {/* My bets summary */}
            <MyBetsSummary bets={myBets} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rules modal */}
      <RulesModal open={showRules} onClose={() => setShowRules(false)} />

      {/* Game history modal */}
      <GameHistoryModal open={showHistory} onClose={() => setShowHistory(false)} rows={historyRows} loading={loadingHistory} />

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

function BetSidebar({ bets, chip, setChip, onPlace, onUndo, undoCount, totalStake, disabled }) {
  // A small bet button used inside the sidebar. Shows a chip badge when a bet is placed.
  const SideBet = ({ betKey, label, extraClass = "" }) => {
    const v = bets[betKey];
    return (
      <button
        type="button"
        onClick={() => !disabled && onPlace(betKey)}
        data-testid={`bet-${betKey}`}
        className={`relative w-full py-2 px-2 rounded-md border border-yellow-500/30 bg-emerald-900/50 text-white text-[11px] font-heading font-bold text-center hover:bg-emerald-800/60 active:scale-95 transition-all ${
          disabled ? "opacity-60 pointer-events-none" : ""
        } ${extraClass}`}
      >
        {label}
        {v > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[26px] h-[20px] px-1.5 rounded-full bg-yellow-400 text-black text-[9px] font-black grid place-items-center border-2 border-yellow-700"
            data-testid={`bet-chip-${betKey}`}
          >
            ₹{v}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="w-[100px] md:w-[130px] shrink-0 flex flex-col gap-2"
      data-testid="bet-sidebar"
    >
      {/* Chip picker + Undo row */}
      <div className="flex flex-col items-center gap-2">
        <ChipPicker chip={chip} onChange={setChip} />
        <button
          onClick={onUndo}
          disabled={undoCount === 0}
          data-testid="undo-bet-btn"
          title={undoCount === 0 ? "No bets to undo" : `Undo last bet — ${undoCount}`}
          className="relative w-12 h-12 rounded-full bg-red-500 text-white border-2 border-white/70 shadow-[0_4px_10px_rgba(0,0,0,0.4)] grid place-items-center hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Undo2 className="w-5 h-5" />
          {undoCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-yellow-400 text-black text-[10px] font-black grid place-items-center border border-yellow-700">
              {undoCount}
            </span>
          )}
        </button>
      </div>

      {/* Stake pill */}
      <div className="bg-black/40 border border-yellow-400/30 rounded-md px-2 py-1 text-center">
        <div className="text-[9px] uppercase tracking-wider text-slate-400 leading-none">Stake</div>
        <div className="font-mono font-black text-sm text-yellow-300 leading-tight" data-testid="round-stake">
          ₹{totalStake.toFixed(0)}
        </div>
      </div>

      {/* Outside bets */}
      <div className="grid grid-cols-2 gap-1.5">
        <SideBet betKey="red" label="RED" extraClass="!bg-red-700/70 !border-red-300/50" />
        <SideBet betKey="black" label="BLACK" extraClass="!bg-neutral-900 !border-white/40" />
        <SideBet betKey="even" label="EVEN" />
        <SideBet betKey="odd" label="ODD" />
        <SideBet betKey="low" label="1–18" />
        <SideBet betKey="high" label="19–36" />
      </div>

      {/* Dozens (full-width buttons) */}
      <div className="flex flex-col gap-1.5">
        <SideBet betKey="dozen_1" label="1st 12 · 3:1" />
        <SideBet betKey="dozen_2" label="2nd 12 · 3:1" />
        <SideBet betKey="dozen_3" label="3rd 12 · 3:1" />
      </div>
    </div>
  );
}

function ChipPicker({ chip, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="chip-picker-btn"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-yellow-400 text-black font-heading font-black text-sm border-2 border-yellow-200 shadow-[0_0_15px_rgba(250,204,21,0.5)] hover:brightness-110 active:scale-95 transition-all"
      >
        <Coins className="w-4 h-4" />
        <span>₹{chip}</span>
      </button>
      {open && (
        <>
          {/* Click-away overlay */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} data-testid="chip-picker-scrim" />
          <div
            className="absolute z-40 top-full left-0 mt-2 p-2 rounded-xl bg-slate-900 border border-yellow-400/30 shadow-[0_10px_30px_rgba(0,0,0,0.55)] flex flex-col gap-1.5 min-w-[110px]"
            data-testid="chip-picker-menu"
          >
            {CHIP_VALUES.map((v) => (
              <button
                key={v}
                onClick={() => { onChange(v); setOpen(false); }}
                data-testid={`chip-${v}`}
                className={`w-full text-left px-3 py-2 rounded-lg font-heading font-bold text-sm border-2 transition-all ${
                  chip === v
                    ? "bg-yellow-400 text-black border-yellow-200"
                    : "bg-black/40 text-slate-200 border-white/10 hover:border-yellow-400/50 hover:bg-black/60"
                }`}
              >
                ₹{v}
              </button>
            ))}
          </div>
        </>
      )}
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
    { name: "Straight (1 number)",     example: "Any digit 0–36",              payout: "35 : 1", ret: "₹50 → ₹1,800 total" },
    { name: "Split (2 numbers)",       example: "Adjacent pair, e.g. 0 & 1",   payout: "17 : 1", ret: "₹50 → ₹900 total" },
    { name: "Street (3 numbers)",      example: "Any row: 1·2·3 … 34·35·36 (+ trios 0·1·2 / 0·2·3)", payout: "11 : 1", ret: "₹50 → ₹600 total" },
    { name: "Corner (4 numbers)",      example: "Square, e.g. 1·2·4·5",        payout: "8 : 1",  ret: "₹50 → ₹450 total" },
    { name: "Six-Line (6 numbers)",    example: "Two adjacent rows, e.g. 1–6", payout: "5 : 1",  ret: "₹50 → ₹300 total" },
    { name: "Dozen (12 numbers)",      example: "1st 12 / 2nd 12 / 3rd 12",    payout: "3 : 1",  ret: "₹50 → ₹200 total" },
    { name: "Red / Black",             example: "Colour of winning number",    payout: "1 : 1",  ret: "₹50 → ₹100 total" },
    { name: "Even / Odd",              example: "Parity (0 loses)",            payout: "1 : 1",  ret: "₹50 → ₹100 total" },
    { name: "Low / High",              example: "1–18 or 19–36 (0 loses)",     payout: "1 : 1",  ret: "₹50 → ₹100 total" },
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
          <div>• On <span className="text-emerald-300">0</span> (green), only straight-0 (and street 0·1·2, split 0-1/0-2/0-3) win. All other outside bets lose.</div>
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

function BetModeSelector() { return null; /* deprecated — replaced by SVG hotspot clicks */ }

function GameHistoryModal({ open, onClose, rows = [], loading }) {
  if (!open) return null;
  const totalWagered = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const totalWon = rows.filter((r) => r.status === "won").reduce((s, r) => s + (r.payout || 0), 0);
  const netProfit = totalWon - totalWagered;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      data-testid="game-history-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface p-5 md:p-6 max-w-lg w-full max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-yellow-300">Game History</div>
            <h2 className="font-heading text-lg md:text-xl font-black">Last 24 Hours</h2>
          </div>
          <button
            onClick={onClose}
            data-testid="close-history-btn"
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-center">
            <div className="text-[9px] uppercase text-slate-400">Bets</div>
            <div className="font-mono font-bold text-sm" data-testid="history-count">{rows.length}</div>
          </div>
          <div className="bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-center">
            <div className="text-[9px] uppercase text-slate-400">Wagered</div>
            <div className="font-mono font-bold text-sm">₹{totalWagered.toFixed(0)}</div>
          </div>
          <div className="bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-center">
            <div className="text-[9px] uppercase text-slate-400">Net</div>
            <div className={`font-mono font-bold text-sm ${netProfit > 0 ? "text-green-400" : netProfit < 0 ? "text-red-400" : "text-slate-300"}`}>
              {netProfit > 0 ? "+" : ""}₹{netProfit.toFixed(0)}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1" data-testid="history-list">
          {loading && <div className="text-center text-sm text-slate-400 py-4">Loading…</div>}
          {!loading && rows.length === 0 && (
            <div className="text-center text-sm text-slate-500 py-6">
              No game bets in the last 24 hours yet.
            </div>
          )}
          {!loading && rows.map((r) => {
            const won = r.status === "won";
            const lost = r.status === "lost";
            const pending = r.status === "pending";
            const when = r.created_at ? new Date(r.created_at).toLocaleString() : "";
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[12px]"
                data-testid={`history-row-${r.id}`}
              >
                <div className="min-w-0">
                  <div className="font-heading font-bold text-white truncate">
                    {labelForBet(r.bet_type)}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {when}
                    {r.result_number != null && ` · result ${r.result_number}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-white">−₹{r.amount}</div>
                  <div className={`text-[10px] font-mono font-bold ${
                    won ? "text-green-400" : lost ? "text-red-400" : "text-yellow-300"
                  }`}>
                    {won ? `+₹${(r.payout || 0).toFixed(0)}` : lost ? "Lost" : "Pending"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 text-[10px] text-slate-500 text-center">
          Game bets are shown here only. Deposits and withdrawals are on the Wallet page.
          <br />History auto-clears after 24 hours.
        </div>
      </div>
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
