import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plane, Send, TrendingUp, Users, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError, wsUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const CHIP_AMOUNTS = [10, 50, 100, 500, 1000];

export default function Game() {
  const { user, refresh } = useAuth();
  const [state, setState] = useState({ status: "waiting", multiplier: 1.0, bets: [], history: [], round_id: null });
  const [countdown, setCountdown] = useState(null);
  const [amount, setAmount] = useState(50);
  const [autoCashout, setAutoCashout] = useState("");
  const [placing, setPlacing] = useState(false);
  const [myBet, setMyBet] = useState(null);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatText, setChatText] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [flash, setFlash] = useState(null); // {type:'win'|'lose', text}
  const wsRef = useRef(null);
  const chatEndRef = useRef(null);

  // Load initial chat
  useEffect(() => {
    api.get("/chat/recent?limit=30").then(({ data }) => setChatMsgs(data)).catch(() => {});
  }, []);

  // WebSocket
  useEffect(() => {
    let stopped = false;
    let reconnectT;
    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "state") {
            setState((s) => ({ ...s, ...msg.data }));
            setCountdown(msg.data.countdown ?? null);
            // reset myBet if new round
            if (msg.data.round_id && myBetRef.current?.round_id !== msg.data.round_id) {
              const mine = (msg.data.bets || []).find((b) => b.user_id === userRef.current?.id);
              myBetRef.current = mine || null;
              setMyBet(mine || null);
            } else {
              const mine = (msg.data.bets || []).find((b) => b.user_id === userRef.current?.id);
              if (mine) { myBetRef.current = mine; setMyBet(mine); }
            }
          } else if (msg.type === "crashed") {
            setState((s) => ({ ...s, status: "crashed", multiplier: msg.data.crash_at, history: msg.data.history }));
            const mine = myBetRef.current;
            if (mine && mine.status === "active") {
              setFlash({ type: "lose", text: `Crashed @ ${msg.data.crash_at.toFixed(2)}x` });
              setTimeout(() => setFlash(null), 2200);
            }
            refresh();
          } else if (msg.type === "cashout") {
            if (msg.data.user_id === userRef.current?.id) {
              setFlash({ type: "win", text: `Cashed out @ ${msg.data.multiplier.toFixed(2)}x  •  +₹${msg.data.profit.toFixed(2)}` });
              setTimeout(() => setFlash(null), 2500);
              refresh();
            }
          } else if (msg.type === "chat") {
            setChatMsgs((prev) => [...prev.slice(-100), msg.data]);
          }
        } catch {}
      };
      ws.onclose = () => {
        if (stopped) return;
        reconnectT = setTimeout(connect, 1500);
      };
    };
    connect();
    return () => { stopped = true; clearTimeout(reconnectT); wsRef.current?.close(); };
    // eslint-disable-next-line
  }, []);

  const myBetRef = useRef(null);
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight;
  }, [chatMsgs, showChat]);

  const placeBet = async () => {
    if (state.status !== "waiting") return toast.error("Betting is closed");
    if (!amount || amount < 10) return toast.error("Minimum bet is ₹10");
    setPlacing(true);
    try {
      const body = { amount: Number(amount) };
      if (autoCashout && Number(autoCashout) > 1.01) body.auto_cashout = Number(autoCashout);
      const { data } = await api.post("/game/bet", body);
      setMyBet(data);
      myBetRef.current = data;
      toast.success(`Bet placed: ₹${amount}`);
      refresh();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setPlacing(false);
    }
  };

  const cashout = async () => {
    try {
      const { data } = await api.post("/game/cashout");
      setMyBet(data);
      myBetRef.current = data;
      refresh();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const sendChat = async () => {
    if (!chatText.trim()) return;
    try {
      await api.post("/chat", { message: chatText.trim() });
      setChatText("");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const isFlying = state.status === "flying";
  const canBet = state.status === "waiting" && (!myBet || myBet.round_id !== state.round_id);
  const canCashout = isFlying && myBet && myBet.round_id === state.round_id && myBet.status === "active";

  return (
    <div className="grid lg:grid-cols-[1fr,320px] gap-4" data-testid="game-page">
      {/* Left: canvas + controls */}
      <div className="space-y-4">
        <div className="card-surface p-4 md:p-6 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="chip !border-cyan-500/40 !text-cyan-300"><Users className="w-3 h-3" /> {state.bets?.length || 0}</span>
              <span className={`chip ${isFlying ? "!border-green-500/40 !text-green-300" : state.status === "crashed" ? "!border-red-500/40 !text-red-300" : "!border-white/10 !text-slate-300"}`}>
                {state.status}
              </span>
              {countdown !== null && state.status === "waiting" && (
                <span className="chip !border-cyan-500/40 !text-cyan-300 font-mono">starts in {countdown}s</span>
              )}
            </div>
            <button className="md:hidden btn-ghost px-3 py-1.5 rounded-lg text-xs flex items-center gap-1" onClick={() => setShowChat((s) => !s)} data-testid="toggle-chat-btn">
              <MessageCircle className="w-3.5 h-3.5" /> Chat
            </button>
          </div>

          <CrashCanvas multiplier={state.multiplier} status={state.status} />

          {/* Flash overlay */}
          {flash && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className={`absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full font-bold text-sm
                ${flash.type === "win" ? "bg-green-500 text-black shadow-[0_0_25px_rgba(34,197,94,0.55)]" : "bg-red-500 text-white shadow-[0_0_25px_rgba(239,68,68,0.55)]"}`}
              data-testid="game-flash">
              {flash.text}
            </motion.div>
          )}

          {/* history strip inside canvas card */}
          <div className="mt-4 flex flex-wrap gap-2" data-testid="game-history-strip">
            {(state.history || []).slice(-15).reverse().map((h) => (
              <div key={h.round_id} className={`font-mono text-xs px-2 py-1 rounded border
                ${h.crash_at >= 2 ? "border-green-500/40 text-green-300" : h.crash_at >= 1.5 ? "border-cyan-500/40 text-cyan-300" : "border-red-500/40 text-red-300"}`}>
                {h.crash_at.toFixed(2)}x
              </div>
            ))}
          </div>
        </div>

        {/* Bet controls */}
        <div className="card-surface p-4 md:p-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] uppercase tracking-widest text-slate-400">Bet amount</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="number" min={10} step={10} value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none font-mono focus:border-cyan-500"
                  data-testid="bet-amount-input" />
                <button className="btn-ghost px-3 py-2 rounded-lg text-sm" onClick={() => setAmount((a) => Math.max(10, Number(a) / 2))} data-testid="bet-half-btn">½</button>
                <button className="btn-ghost px-3 py-2 rounded-lg text-sm" onClick={() => setAmount((a) => Number(a) * 2)} data-testid="bet-double-btn">2×</button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {CHIP_AMOUNTS.map((v) => (
                  <button key={v} onClick={() => setAmount(v)} className="chip hover:!border-cyan-500/40 hover:!text-cyan-300 transition-colors" data-testid={`chip-${v}`}>
                    ₹{v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-slate-400">Auto cashout (optional)</label>
              <input type="number" step="0.1" min="1.01" placeholder="e.g. 2.00" value={autoCashout} onChange={(e) => setAutoCashout(e.target.value)}
                className="w-full mt-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2.5 outline-none font-mono focus:border-cyan-500"
                data-testid="auto-cashout-input" />
              <div className="text-xs text-slate-500 mt-1">Cashes you out automatically at this multiplier.</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button disabled={!canBet || placing} onClick={placeBet} className="btn-primary py-4 rounded-xl text-lg" data-testid="place-bet-btn">
              {myBet && myBet.round_id === state.round_id ? "Bet placed" : (placing ? "..." : "Place bet")}
            </button>
            <button disabled={!canCashout} onClick={cashout} className="btn-cyan py-4 rounded-xl text-lg flex items-center justify-center gap-2" data-testid="cashout-btn">
              <TrendingUp className="w-5 h-5" /> Cash out {isFlying ? `@ ${state.multiplier.toFixed(2)}x` : ""}
            </button>
          </div>

          {myBet && myBet.round_id === state.round_id && (
            <div className="mt-3 text-sm text-slate-400" data-testid="my-bet-status">
              Your bet: <span className="font-mono text-slate-200">₹{myBet.amount}</span>
              {myBet.auto_cashout && <> • auto @ {myBet.auto_cashout.toFixed(2)}x</>}
              {myBet.status === "cashed_out" && <> • <span className="text-green-400">won ₹{(myBet.amount * myBet.cashout_multiplier).toFixed(2)}</span></>}
              {myBet.status === "lost" && <> • <span className="text-red-400">lost</span></>}
            </div>
          )}
        </div>

        {/* Live bets */}
        <div className="card-surface p-4 md:p-5">
          <h3 className="font-heading font-bold mb-3">Live bets</h3>
          <div className="max-h-64 overflow-y-auto" data-testid="live-bets-list">
            {(state.bets || []).length === 0 && <div className="text-sm text-slate-500">No bets yet</div>}
            <div className="grid gap-1">
              {(state.bets || []).map((b) => (
                <div key={b.id || b.user_id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#06090F] border border-white/5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-green-500 grid place-items-center text-[10px] font-bold text-black">
                      {b.user_name?.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate max-w-[140px]">{b.user_name}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-300">₹{b.amount}</span>
                    {b.status === "cashed_out" ? (
                      <span className="chip !border-green-500/40 !text-green-300">{b.cashout_multiplier?.toFixed(2)}x</span>
                    ) : b.status === "lost" ? (
                      <span className="chip !border-red-500/40 !text-red-300">bust</span>
                    ) : (
                      <span className="chip !border-cyan-500/40 !text-cyan-300">active</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right: chat */}
      <div className={`card-surface p-4 flex flex-col ${showChat ? "" : "hidden lg:flex"}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading font-bold">Round chat</h3>
          <span className="text-xs text-slate-500">{chatMsgs.length}</span>
        </div>
        <div ref={chatEndRef} className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[520px]" data-testid="chat-messages">
          {chatMsgs.map((m) => (
            <div key={m.id} className="text-sm">
              <span className={`font-semibold ${m.role === "admin" ? "text-cyan-300" : "text-green-300"}`}>{m.user_name}: </span>
              <span className="text-slate-300 break-words">{m.message}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()}
            placeholder="Say something..." maxLength={200}
            className="flex-1 bg-[#06090F] border border-white/10 rounded-lg px-3 py-2 outline-none text-sm focus:border-cyan-500"
            data-testid="chat-input" />
          <button onClick={sendChat} className="btn-cyan px-3 py-2 rounded-lg" data-testid="chat-send-btn"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

function CrashCanvas({ multiplier, status }) {
  const clampedM = Math.min(multiplier, 15);
  // Progress across canvas from 1.0x to ~10x
  const progress = Math.min((clampedM - 1) / 9, 1);
  // Bezier from bottom-left to top-right
  const width = 800, height = 340;
  const endX = 40 + (width - 80) * progress;
  const endY = height - 30 - (height - 60) * progress;
  const controlX = (40 + endX) / 2;
  const controlY = height - 30;
  const path = `M 40 ${height - 30} Q ${controlX} ${controlY} ${endX} ${endY}`;

  const crashed = status === "crashed";
  const flying = status === "flying";

  return (
    <div className="relative w-full h-64 md:h-80">
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="curveGrad" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.1" />
            <stop offset="100%" stopColor={crashed ? "#ef4444" : "#22c55e"} stopOpacity="1" />
          </linearGradient>
          <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={crashed ? "#ef4444" : "#22d3ee"} stopOpacity="0.25" />
            <stop offset="100%" stopColor="#06090F" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {[0.2, 0.4, 0.6, 0.8].map((p, i) => (
          <line key={i} x1="30" x2={width - 30} y1={height * (1 - p)} y2={height * (1 - p)}
            stroke="rgba(255,255,255,0.05)" strokeDasharray="4 6" />
        ))}

        {/* Area under curve */}
        <path d={`${path} L ${endX} ${height - 30} L 40 ${height - 30} Z`} fill="url(#areaGrad)" />
        {/* Curve */}
        <path d={path} stroke={crashed ? "#ef4444" : "url(#curveGrad)"} strokeWidth="3" fill="none" strokeLinecap="round" />

        {/* Plane at leading edge */}
        <g transform={`translate(${endX} ${endY}) rotate(${-45 * progress})`}>
          <circle r="18" fill={crashed ? "#ef4444" : "#22d3ee"} fillOpacity="0.18" />
          <circle r="6" fill={crashed ? "#ef4444" : "#22d3ee"} />
        </g>
      </svg>

      {/* Multiplier centered */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className={`multiplier-txt text-6xl md:text-8xl ${crashed ? "crashed" : ""}`} data-testid="game-multiplier">
          {clampedM.toFixed(2)}x
        </div>
      </div>

      {status === "waiting" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-slate-400 font-heading text-lg md:text-2xl uppercase tracking-[0.3em]">Get ready...</div>
        </div>
      )}
    </div>
  );
}
